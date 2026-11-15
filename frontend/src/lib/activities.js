// Activities: Reaction Run, Calm Orbit, Crew Journey and Dock Pilot (physics in lib/dockPilot.js). Pure functions only, so node:test runs exactly
// what the screens show. Every game record is "Logged · not scored": nothing here returns a status, and
// no game record is ever passed to the scoring engines (lib/personCards.js, lib/baseline.js …).
//
// Record (lib/activityStore.js, localStorage `ahm.activities.v1`):
//   { id, crew_id, kind: 'reaction_run'|'calm_orbit'|'crew_journey'|'dock_pilot', recorded_at, data }
//   reaction_run: { median_ms: number|null, lapses, false_starts, trials }
//   calm_orbit:   { minutes: 2, feeling: 'calmer'|'same'|'worse' }
//   crew_journey: { type: 'treadmill'|'bike'|'resistance', minutes: 5..120 }
//   dock_pilot:   { level: 1|2|3, docked, time_s: 0..60, final_offset_px, final_speed, hard_contacts, fuel_used: 0..100 }
// recorded_at is the demo date with the real time of day (lib/demoState.js stampOnDemoDate), and records
// dated after the demo's today are ignored, as everywhere else in the app.

import { ACTIVITY_KINDS, ACTIVITY_SETTINGS, GAME_KINDS, EXERCISE_TYPES, FEELINGS, LOGGED_NOT_SCORED, ROUTES, ROUTE_BY_PROFILE } from '../content/activities.js';
import { onOrBefore } from './demoState.js';
import { addDays } from './sensorFeed.js';
import { inQuietHours } from './reminders.js';

const S = ACTIVITY_SETTINGS;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isCount = (v) => Number.isInteger(v) && v >= 0;
const isNum = (v, min, max = Infinity) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export const dateOf = (r) => (typeof r?.recorded_at === 'string' ? r.recorded_at.slice(0, 10) : null);
const byTime = (a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at);

// ---------- Validation ----------

/** @returns {string|null} a user-facing message, or null when the session can be saved */
export function validateJourney({ type, minutes } = {}) {
  if (!EXERCISE_TYPES.some((t) => t.value === type)) return 'Choose the type of exercise.';
  if (minutes === '' || minutes === null || minutes === undefined) return 'Enter how many minutes.';
  if (typeof minutes !== 'number' || !Number.isInteger(minutes)) return 'Enter whole minutes.';
  if (minutes < S.journey.minMinutes || minutes > S.journey.maxMinutes) return `Enter ${S.journey.minMinutes} to ${S.journey.maxMinutes} minutes.`;
  return null;
}

function validData(kind, d) {
  if (!isObj(d)) return false;
  if (kind === 'reaction_run')
    return (d.median_ms === null || (typeof d.median_ms === 'number' && d.median_ms >= 0)) && isCount(d.lapses) && isCount(d.false_starts) && isCount(d.trials);
  if (kind === 'calm_orbit') return d.minutes === S.calm.minutes && FEELINGS.some((f) => f.value === d.feeling);
  if (kind === 'crew_journey') return validateJourney(d) === null;
  if (kind === 'dock_pilot')
    return (
      Object.hasOwn(S.dock.levels, d.level) && Number.isInteger(d.level) && typeof d.docked === 'boolean' && isNum(d.time_s, 0, S.dock.roundS) &&
      isNum(d.final_offset_px, 0) && isNum(d.final_speed, 0) && isCount(d.hard_contacts) && isNum(d.fuel_used, 0, S.dock.fuelMax)
    );
  return false;
}

/** A well-formed activity record? */
export const isActivity = (r) =>
  isObj(r) && typeof r.id === 'string' && typeof r.crew_id === 'string' && r.crew_id !== '' && GAME_KINDS.includes(r.kind) &&
  typeof r.recorded_at === 'string' && !Number.isNaN(Date.parse(r.recorded_at)) && validData(r.kind, r.data);

export const makeActivity = ({ id, crewId, kind, recordedAt, data }) => ({ id, crew_id: crewId, kind, recorded_at: recordedAt, data });

/** Records visible on the demo's today, optionally for one person and one kind, oldest first. */
export function visible(records, { demoDate, crewId = null, kind = null } = {}) {
  return onOrBefore((records ?? []).filter(isActivity), demoDate)
    .filter((r) => (!crewId || r.crew_id === crewId) && (!kind || r.kind === kind))
    .sort(byTime);
}

// ---------- Reaction Run ----------

export function median(values) {
  const v = values.filter((n) => typeof n === 'number' && Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Score one session. `reactions`: one entry per stimulus shown, the reaction in ms or null when there was
 * no tap within the timeout. A tap before the stimulus is a false start (counted, the trial restarts).
 * A reaction over 500 ms, or no reaction, is a lapse; null reactions are left out of the median.
 * @returns {{ median_ms: number|null, lapses: number, false_starts: number, trials: number }}
 */
export function scoreReactionRun({ reactions = [], falseStarts = 0 } = {}) {
  const times = reactions.filter((r) => typeof r === 'number' && Number.isFinite(r) && r >= 0);
  const m = median(times);
  return {
    median_ms: m === null ? null : Math.round(m),
    lapses: reactions.filter((r) => !(typeof r === 'number' && Number.isFinite(r)) || r > S.reaction.lapseMs).length,
    false_starts: Math.max(0, Math.trunc(falseStarts) || 0),
    trials: reactions.length,
  };
}

/** A random wait before the next stimulus, 2–10 s (rand ∈ [0, 1)). */
export const nextWaitMs = (rand = Math.random()) => Math.round(S.reaction.minWaitMs + rand * (S.reaction.maxWaitMs - S.reaction.minWaitMs));

/**
 * "Your usual": the median of the player's last 7 sessions' medians, from 3 sessions on.
 * @returns {{ usual_ms: number, sessions: number } | null}
 */
export function reactionBaseline(records, crewId, demoDate) {
  const meds = visible(records, { demoDate, crewId, kind: 'reaction_run' })
    .map((r) => r.data.median_ms)
    .filter((v) => typeof v === 'number')
    .slice(-S.reaction.baselineSessions);
  if (meds.length < S.reaction.baselineMinSessions) return null;
  return { usual_ms: Math.round(median(meds)), sessions: meds.length };
}

/** The player's session medians, oldest first (at most `n`), for the Vitals sparkline. */
export const reactionHistory = (records, crewId, demoDate, n = 14) =>
  visible(records, { demoDate, crewId, kind: 'reaction_run' })
    .map((r) => r.data.median_ms)
    .filter((v) => typeof v === 'number')
    .slice(-n);

// ---------- Calm Orbit ----------

/** The Calm Orbit record's data. Stored in the activity log only; it never writes the check-in mood. */
export function calmOrbitData(feeling) {
  if (!FEELINGS.some((f) => f.value === feeling)) return null;
  return { minutes: S.calm.minutes, feeling };
}

/** Breathing phase at `elapsedMs`: 'in' for 5 s, then 'out' for 5 s, with the seconds left in it. */
export function breathPhase(elapsedMs) {
  const cycle = (S.calm.inhaleS + S.calm.exhaleS) * 1000;
  const t = ((elapsedMs % cycle) + cycle) % cycle;
  const inhale = t < S.calm.inhaleS * 1000;
  const into = inhale ? t : t - S.calm.inhaleS * 1000;
  const len = (inhale ? S.calm.inhaleS : S.calm.exhaleS) * 1000;
  return { phase: inhale ? 'in' : 'out', progress: into / len, secondsLeft: Math.ceil((len - into) / 1000) };
}

// ---------- Crew Journey ----------

export const routeFor = (profileId) => ROUTES[ROUTE_BY_PROFILE[profileId] ?? 'moon'];

/** All crew members' exercise minutes on or before the demo's today. */
export const crewMinutesTotal = (records, demoDate) =>
  visible(records, { demoDate, kind: 'crew_journey' }).reduce((s, r) => s + r.data.minutes, 0);

/** One person's own minutes ("You added 30 min"), shown only to that person. */
export const myMinutes = (records, crewId, demoDate) =>
  visible(records, { demoDate, crewId, kind: 'crew_journey' }).reduce((s, r) => s + r.data.minutes, 0);

/**
 * The shared ship: every crew member's minutes on the route chosen by the mission profile.
 * @returns {{ route, totalMinutes, km, fraction, milestones: { id, note, km, reached }[] }}
 */
export function journeyProgress(records, profileId, demoDate) {
  const route = routeFor(profileId);
  const totalMinutes = crewMinutesTotal(records, demoDate);
  const km = Math.min(route.totalKm, totalMinutes * route.kmPerMinute);
  return {
    route,
    totalMinutes,
    km,
    fraction: km / route.totalKm,
    milestones: route.milestones.map((m) => ({ ...m, reached: km >= m.km })),
  };
}

/** The demo date the crew's running total first reached `km` on a route (null if not yet). */
export function dateCrewReached(records, route, km, demoDate) {
  let total = 0;
  for (const r of visible(records, { demoDate, kind: 'crew_journey' })) {
    total += r.data.minutes;
    if (total * route.kmPerMinute >= km) return dateOf(r);
  }
  return null;
}

// ---------- Gates ----------

export const sessionsOn = (records, crewId, kind, date) => visible(records, { demoDate: date, crewId, kind }).filter((r) => dateOf(r) === date).length;

/**
 * Can this game start now?
 *   'rest' — quiet hours (22:00–06:00 crew time, the reminder setting): every game but Calm Orbit;
 *            Calm Orbit stays open as a wind-down.
 *   'done' — 3 sessions of this game already on the demo's today.
 *   'open' — otherwise.
 */
export function gate({ kind, records, crewId, demoDate, now = Date.now() }) {
  if (kind !== 'calm_orbit' && inQuietHours(now)) return 'rest';
  if (sessionsOn(records, crewId, kind, demoDate) >= S.dailyCap) return 'done';
  return 'open';
}

export const GATE_TEXT = { rest: 'Rest time; try again after 06:00', done: 'Done for today' };

// ---------- Summaries ----------

const weekFrom = (demoDate) => addDays(demoDate, -6);

/**
 * One person's sessions over the last 7 demo days, per game: counts and dates only (the CMO's view of
 * someone else). Never a time, a feeling or a minute count. `kinds` defaults to the first three games;
 * pass GAME_KINDS to include Dock Pilot.
 */
export function weekSessions(records, crewId, demoDate, kinds = ACTIVITY_KINDS) {
  const from = weekFrom(demoDate);
  const mine = visible(records, { demoDate, crewId }).filter((r) => dateOf(r) >= from);
  return Object.fromEntries(
    kinds.map((k) => {
      const list = mine.filter((r) => r.kind === k);
      return [k, { count: list.length, dates: [...new Set(list.map(dateOf))] }];
    }),
  );
}

/** Minutes and sessions this person logged over the last 7 demo days. */
export function exerciseThisWeek(records, crewId, demoDate) {
  const from = weekFrom(demoDate);
  const list = visible(records, { demoDate, crewId, kind: 'crew_journey' }).filter((r) => dateOf(r) >= from);
  return { minutes: list.reduce((s, r) => s + r.data.minutes, 0), sessions: list.length };
}

/** Did this person play this game on the demo date? */
export const playedOn = (records, crewId, kind, date) => sessionsOn(records, crewId, kind, date) > 0;

// ---------- What Vitals and the body map show ----------

/**
 * Vitals → Reaction time: the Reaction Run panel under the crew-record card. No status: the card above
 * keeps its crew-record value and status, and this panel never feeds a score.
 * @returns {{ label, history: number[], latest: object|null, usual: object|null, sessions: number }}
 */
export function reactionPanel(records, crewId, demoDate) {
  const list = visible(records, { demoDate, crewId, kind: 'reaction_run' });
  return {
    label: `From Reaction Run · ${LOGGED_NOT_SCORED}`,
    history: reactionHistory(records, crewId, demoDate),
    latest: list.at(-1) ?? null,
    usual: reactionBaseline(records, crewId, demoDate),
    sessions: list.length,
  };
}

/**
 * The body-map drawer's "Exercise time" row, from logged Crew Journey sessions this week. It keeps the
 * row's existing status (the drawer summary and sort are unchanged) and shows "Logged · not scored"
 * instead of a status chip. `own` false (the CMO viewing someone else): sessions only, never minutes.
 */
export function exerciseRow(baseRow, records, crewId, demoDate, { own = true } = {}) {
  const week = exerciseThisWeek(records, crewId, demoDate);
  return {
    ...baseRow,
    value: own ? week.minutes : week.sessions,
    unit: own ? 'min this week' : week.sessions === 1 ? 'session this week' : 'sessions this week',
    sample: false,
    notScored: true,
    notScoredText: LOGGED_NOT_SCORED,
    sourceNote: 'From Crew Journey',
    trend: 'flat',
    trendText: own ? `${week.sessions} ${week.sessions === 1 ? 'session' : 'sessions'} in the last 7 days` : 'Sessions logged in the last 7 days',
    history: undefined,
  };
}
