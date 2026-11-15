// Mission patches: earned only by taking part. No rule reads a score, a reaction time, a feeling or a
// minute count as a measure of how well someone did. Patches are worked out from saved records, and the
// first `earnedOn` of each is kept in `ahm.patches.v1` (lib/patchStore.js), so a patch, once earned, is
// never taken away (for example by switching to the longer Mars route).
//
// Tough days and grace days keep a run going (the user only sees "Tough days don't break your run"):
//   tough day — that day's check-in mood is 1 or 2; or that day's overall check-in status is alert; or the
//               person was the patient in an emergency (lib/patchStore.js notes the demo day it was open).
//               Read only to forgive a missed day: a tough day never earns a patch by itself.
//   grace day — up to 2 per mission month (30 mission days), per run rule, team-set.
// A run can only earn its patch on a day the person actually played.

import { ACTIVITY_SETTINGS, ALL_PATCHES } from '../content/activities.js';
import { onOrBefore } from './demoState.js';
import { addDays } from './sensorFeed.js';
import { missionDayOn } from './reminders.js';
import { dateCrewReached, dateOf, routeFor, visible } from './activities.js';

const P = ACTIVITY_SETTINGS.patches;

/** Demo dates that count as tough days for this person. */
export function toughDays({ checkins = [], emergencyDays = [], demoDate }) {
  const out = new Set(emergencyDays.filter((d) => typeof d === 'string' && (!demoDate || d <= demoDate)));
  for (const r of onOrBefore(checkins, demoDate)) {
    if (r?.kind !== 'daily_vitals') continue;
    const mood = r.payload?.reading?.mood;
    if ((typeof mood === 'number' && mood <= 2) || r.status === 'alert') out.add(dateOf(r));
  }
  return out;
}

/** Mission month index of a date (30 mission days each), from crew.json days; falls back to the start date. */
export function monthOf(date, { crewDays = [], start }) {
  const md = missionDayOn(crewDays, date);
  if (md !== null) return Math.floor((md - 1) / P.missionMonthDays);
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
  return Math.floor(days / P.missionMonthDays);
}

/**
 * Walk the days from `from` to `to`, marking each 'done' | 'tough' | 'grace' | 'miss' | 'pending'.
 * 'pending' is only the demo's today when nothing is done yet (the day is not over, so no grace is spent).
 */
export function walkDays({ from, to, isDone, tough, crewDays, demoDate }) {
  const used = new Map();
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    let mark;
    if (isDone(d)) mark = 'done';
    else if (tough.has(d)) mark = 'tough';
    else if (d === demoDate) mark = 'pending';
    else {
      const m = monthOf(d, { crewDays, start: from });
      const n = used.get(m) ?? 0;
      if (n < P.graceDaysPerMonth) {
        used.set(m, n + 1);
        mark = 'grace';
      } else mark = 'miss';
    }
    days.push({ date: d, mark });
  }
  return days;
}

const counts = (mark) => mark === 'done' || mark === 'tough' || mark === 'grace';

/** First date a 5-day run (done, tough or grace days) ends on a played day. */
export function streakEarnedOn(days, need = P.streakDays) {
  let run = 0;
  for (const { date, mark } of days) {
    if (mark === 'miss') run = 0;
    else if (counts(mark)) run += 1;
    if (mark === 'done' && run >= need) return date;
  }
  return null;
}

/** First played day ending a 7-day window with 5 counted days. */
export function weekEarnedOn(days, need = P.weekNeeded, size = P.weekDays) {
  for (let i = 0; i < days.length; i += 1) {
    if (days[i].mark !== 'done') continue;
    const win = days.slice(Math.max(0, i - size + 1), i + 1);
    if (win.filter((d) => counts(d.mark)).length >= need) return days[i].date;
  }
  return null;
}

/**
 * The date each patch was first earned, from records alone (null when not earned).
 * @param {object} p
 * @param {string} p.crewId
 * @param {object[]} p.activities   every crew member's activity records on this device (Crew Journey is shared)
 * @param {object[]} [p.checkins]   this person's daily_vitals records (tough days only)
 * @param {string[]} [p.emergencyDays] demo dates this person was the patient in an emergency
 * @param {object[]} [p.crewDays]   crew.json days (mission months)
 * @param {string} p.profileId      mission profile (the Crew Journey route)
 * @param {string} p.demoDate
 * @returns {Record<string, string|null>}
 */
export function earnedFromRecords({ crewId, activities, checkins = [], emergencyDays = [], crewDays = [], profileId, demoDate }) {
  const mine = visible(activities, { demoDate, crewId });
  const of = (kind) => mine.filter((r) => r.kind === kind);
  const firstDate = (list) => (list.length ? dateOf(list[0]) : null);
  const reactions = of('reaction_run');
  const calms = of('calm_orbit');
  const exercise = of('crew_journey');
  const playedDates = (list) => new Set(list.map(dateOf));
  const rDates = playedDates(reactions);
  const cDates = playedDates(calms);
  const eDates = playedDates(exercise);
  const docks = of('dock_pilot');
  const dDates = playedDates(docks);
  const docked = docks.filter((r) => r.data.docked);

  const out = Object.fromEntries(ALL_PATCHES.map((p) => [p.id, null]));
  out.first_reaction = firstDate(reactions);
  out.first_calm = firstDate(calms);
  out.first_exercise = firstDate(exercise);
  // Dock Pilot: a docking (any level), a level-3 docking, and playing 5 days in a row (docked or not).
  out.first_dock = firstDate(docked);
  out.dock_level3 = firstDate(docked.filter((r) => r.data.level === 3));
  out.calm_seven = calms.length >= P.calmCount ? dateOf(calms[P.calmCount - 1]) : null;

  const start = firstDate(mine);
  if (start) {
    const tough = toughDays({ checkins, emergencyDays, demoDate });
    const base = { from: start, to: demoDate, tough, crewDays, demoDate };
    out.reaction_streak = streakEarnedOn(walkDays({ ...base, isDone: (d) => rDates.has(d) }));
    out.dock_streak = streakEarnedOn(walkDays({ ...base, isDone: (d) => dDates.has(d) }));
    out.full_week = weekEarnedOn(walkDays({ ...base, isDone: (d) => rDates.has(d) && cDates.has(d) && eDates.has(d) }));
  }

  // Shared journey: earned by everyone who has logged exercise, once the crew passes the point.
  if (out.first_exercise) {
    const route = routeFor(profileId);
    // Not before this person's own first exercise.
    const later = (a) => (a ? (a > out.first_exercise ? a : out.first_exercise) : null);
    out.crew_halfway = later(dateCrewReached(activities, route, route.totalKm / 2, demoDate));
    out.crew_arrived = later(dateCrewReached(activities, route, route.totalKm, demoDate));
  }
  return out;
}

/**
 * The patch shelf: records plus what was saved before. A saved earnedOn always wins (first date kept),
 * so a patch is never taken away.
 * @param {Record<string,string>} saved  patchStore earned map for this person
 * @returns {{ id, name, earned: boolean, earnedOn: string|null }[]}
 */
export function patchShelf(fromRecords, saved = {}) {
  return ALL_PATCHES.map((p) => {
    const earnedOn = saved[p.id] ?? fromRecords[p.id] ?? null;
    return { id: p.id, name: p.name, earned: Boolean(earnedOn), earnedOn };
  });
}
