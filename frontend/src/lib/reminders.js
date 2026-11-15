// Reminders: what is due for one person, what was missed, and who else should know.
// Pure: every input is passed in, so node:test runs exactly what the bell, the Today card and the
// CMO's Crew overview show. The schedule and every timing value are team-set (content/reminderSchedule.js).
// Nothing is stored for a reminder itself: "done" is always read from records already saved
// (check-ins, exams, stand tests, logged grip values, ground messages), so the same inputs give the
// same list on every device. Only snooze / "Not today" live in lib/reminderStore.js.

import { REMINDER_KIND, REMINDER_SCHEDULE } from '../content/reminderSchedule.js';
import { gravityText } from '../constants/mission.js';
import { onOrBefore } from './demoState.js';
import { environmentRules } from './environmentRules.js';
import { DEVICES, READING_KEY_OF, addDays, daysBetween } from './sensorFeed.js';
import { VITALS_ROWS } from './vitalsCheckin.js';
import { entryKey } from './reminderStore.js';
import { status as messageStatus } from '../ground/lib/messages.js';

// ---------- Time ----------
//
// Why two clocks: the demo clock (lib/demoState.js) moves in whole days only, so it decides WHICH DAY
// it is (what is due, what was missed, which records count). It has no time of day of its own, so the
// real clock decides the TIME OF DAY (is it past 10:00 yet? are we in quiet hours?). Crew time is UTC,
// as on the ISS (GMT). Records dated after the demo's today are ignored, as everywhere else in the app.

const toMs = (now) => (now instanceof Date ? now.getTime() : Number(now));
/** Minutes since midnight, crew time (UTC), from the real clock. */
export const crewMinutes = (now) => {
  const d = new Date(toMs(now));
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
const atHour = (date, hour) => `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`;
const dateOf = (r) => (typeof r?.recorded_at === 'string' ? r.recorded_at.slice(0, 10) : null);
const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Inside quiet hours (22:00–06:00 crew time, team-set)? Reminders still show; no notification is sent. */
export function inQuietHours(now, s = REMINDER_SCHEDULE.settings) {
  const m = crewMinutes(now);
  const start = s.quietStartHour * 60;
  const end = s.quietEndHour * 60;
  return start > end ? m >= start || m < end : m >= start && m < end;
}

// ---------- Records ----------

const isExam = (r) => r?.payload?.kind_detail === 'cmo_exam';
const isCheckin = (r) => r?.kind === 'daily_vitals' && r?.payload?.reading && !isExam(r);
const hasValues = (reading, keys) => keys.every((k) => typeof reading?.[k] === 'number');

/** Mission day on a date, from the person's last crew.json day; null when unknown. */
export function missionDayOn(crewDays, date) {
  const last = [...(crewDays ?? [])].sort((a, b) => a.day - b.day).at(-1);
  if (!last || typeof last.missionDay !== 'number' || !date) return null;
  return last.missionDay + daysBetween(last.date, date);
}

const ROW_NAME = Object.fromEntries(VITALS_ROWS.map((r) => [r.id, r.name]));

// ---------- One kind each ----------

function dailyCheckin({ checkins, crewDays, demoDate, s }) {
  const done = new Set([...checkins.map(dateOf), ...(crewDays ?? []).map((d) => d.date)]);
  if (done.has(demoDate)) return [];
  const lastSeed = [...(crewDays ?? [])].map((d) => d.date).sort().at(-1) ?? null;
  let missed = 0;
  for (let d = addDays(demoDate, -1); missed < s.lookbackDays && (!lastSeed || d > lastSeed) && !done.has(d); d = addDays(d, -1)) missed += 1;
  return [
    {
      id: `daily_checkin:${demoDate}`,
      kind: 'daily_checkin',
      detail: missed ? `No check-in on the last ${plural(missed, 'day')}. Today’s is ready when you are.` : 'A few minutes, morning readings.',
      dueAt: atHour(demoDate, s.dueHour),
      missedDays: missed,
      timed: true,
    },
  ];
}

function repeatWatch({ checkins, demoDate, s }) {
  const from = addDays(demoDate, -s.lookbackDays);
  const before = checkins.filter((r) => dateOf(r) < demoDate && dateOf(r) >= from);
  const newestWatch = new Map(); // row id → newest date it was on watch
  for (const r of before) {
    const rows = r.payload?.result?.indicators ?? {};
    for (const row of VITALS_ROWS) {
      if (rows[row.id]?.status !== 'watch') continue;
      const d = dateOf(r);
      if (!newestWatch.has(row.id) || newestWatch.get(row.id) < d) newestWatch.set(row.id, d);
    }
  }
  const out = [];
  for (const row of VITALS_ROWS) {
    const d = newestWatch.get(row.id);
    if (!d) continue;
    const repeated = checkins.some((c) => dateOf(c) > d && hasValues(c.payload.reading, row.parts));
    if (repeated) continue;
    const due = addDays(d, 1);
    out.push({
      id: `repeat_watch:${row.id}:${d}`,
      kind: 'repeat_watch',
      detail: `${ROW_NAME[row.id]} was on watch on ${shortDate(d)}. Measure it again at your next check-in.`,
      dueAt: atHour(due, s.dueHour),
      missedDays: Math.max(0, daysBetween(due, demoDate)),
      timed: true,
      reading: row.id,
    });
  }
  return out;
}

function deviceGap({ checkins, timeline, demoDate, s }) {
  const day = (timeline ?? []).find((d) => d?.date === demoDate);
  if (!day?.devices) return [];
  const today = checkins.filter((r) => dateOf(r) === demoDate);
  return Object.entries(DEVICES)
    .filter(([id]) => day.devices[id] && day.devices[id] !== 'ok')
    .filter(([id, dev]) => {
      void id;
      const keys = dev.keys.map((k) => READING_KEY_OF[k]);
      // Simulated data never arrives late; a value in today's check-in (by hand) clears it.
      return !today.some((r) => hasValues(r.payload.reading, keys));
    })
    .map(([id, dev]) => ({
      id: `device_gap:${id}:${demoDate}`,
      kind: 'device_gap',
      detail: `No data from the ${dev.name.toLowerCase()} today. Check it is worn, or enter the reading by hand.`,
      dueAt: atHour(demoDate, s.dueHour),
      missedDays: 0,
      timed: true,
      device: id,
    }));
}

function gripWeekly({ grip, fitnessWeeks, crewDays, demoDate, s }) {
  const md = missionDayOn(crewDays, demoDate);
  if (md === null) return [];
  const weekStart = Math.floor(md / s.missionWeekDays) * s.missionWeekDays;
  if (weekStart < s.missionWeekDays) return [];
  const weekEnd = weekStart + s.missionWeekDays - 1;
  const startDate = addDays(demoDate, weekStart - md);
  const endDate = addDays(startDate, s.missionWeekDays - 1);
  const fromCrewRecord = (fitnessWeeks ?? []).some((w) => typeof w?.missionDay === 'number' && w.missionDay >= weekStart && w.missionDay <= weekEnd);
  const logged = grip.some((e) => dateOf(e) >= startDate && dateOf(e) <= endDate);
  if (fromCrewRecord || logged) return [];
  const week = weekStart / s.missionWeekDays;
  return [
    {
      id: `grip_weekly:${week}`,
      kind: 'grip_weekly',
      detail: `Mission week ${week}. One grip value this week.`,
      dueAt: atHour(startDate, s.dueHour),
      missedDays: md - weekStart,
      timed: true,
    },
  ];
}

function standTest({ standTests, profile, arrivalDate, demoDate, s }) {
  if (!environmentRules(profile).standTest.available) return [];
  const arrival = arrivalDate && arrivalDate <= demoDate ? arrivalDate : demoDate;
  const k = Math.floor(daysBetween(arrival, demoDate) / s.missionWeekDays);
  const start = addDays(arrival, k * s.missionWeekDays);
  const end = addDays(start, s.missionWeekDays - 1);
  if (standTests.some((r) => dateOf(r) >= start && dateOf(r) <= end)) return [];
  return [
    {
      id: `stand_test:${start}`,
      kind: 'stand_test',
      detail: k === 0 ? `First week at ${gravityText(profile)}. One stand test this week.` : 'One stand test this week.',
      dueAt: atHour(start, s.dueHour),
      missedDays: daysBetween(start, demoDate),
      timed: true,
    },
  ];
}

function examFollowups({ crew, crewId, demoDate, s }) {
  const windowDays = Math.ceil(s.examWindowHours / 24);
  const since = addDays(demoDate, -windowDays);
  return (crew ?? [])
    .filter((m) => m && m.id !== crewId && m.status === 'alert')
    .filter((m) => !onOrBefore(m.exams ?? [], demoDate).some((r) => isExam(r) && dateOf(r) >= since))
    .map((m) => ({
      id: `cmo_exam_followup:${m.id}`,
      kind: 'cmo_exam_followup',
      detail: `${m.name ?? m.id} is on alert. No exam in the last ${s.examWindowHours} h.`,
      dueAt: atHour(demoDate, 0),
      missedDays: 0,
      timed: false,
      actionParams: { crewId: m.id },
    }));
}

function groundMessages({ messages, crewId, now }) {
  if (!Array.isArray(messages)) return []; // unavailable or unreadable: skip this reminder
  return messages
    .filter((m) => m && (m.to === 'cmo' || m.to === crewId))
    .filter((m) => messageStatus(m, toMs(now)).state === 'delivered')
    .map((m) => ({
      id: `ground_message:${m.id}`,
      kind: 'ground_message',
      detail: `${m.subject} · from ${m.from?.name ?? 'the ground'}`,
      dueAt: m.arrives_at,
      missedDays: 0,
      timed: false,
      actionParams: { messageId: m.id },
    }));
}

// Activities (APP_REMINDER_SCHEDULE only): a Reaction Run logged on the demo day clears it. Daily, so it
// never counts missed days and never escalates.
function reactionDaily({ activities, crewId, demoDate, kind }) {
  const done = activities.some((r) => r?.kind === 'reaction_run' && r.crew_id === crewId && dateOf(r) === demoDate);
  if (done) return [];
  return [
    {
      id: `reaction_daily:${demoDate}`,
      kind: 'reaction_daily',
      detail: 'Three minutes. Tap as soon as the shape appears.',
      dueAt: atHour(demoDate, kind.dueHour),
      missedDays: 0,
      timed: true,
    },
  ];
}

const BUILDERS = {
  daily_checkin: dailyCheckin,
  repeat_watch: repeatWatch,
  device_gap: deviceGap,
  grip_weekly: gripWeekly,
  stand_test: standTest,
  cmo_exam_followup: examFollowups,
  ground_message: groundMessages,
  reaction_daily: reactionDaily,
};

// ---------- The engine ----------

const RANK = { overdue: 0, due: 1, snoozed: 2 };

/**
 * Everything due for one person on the demo's today.
 * @param {object} p
 * @param {string} p.crewId
 * @param {'crew'|'cmo'} p.role         CMO-only kinds are never returned for 'crew'
 * @param {object} p.records            this person's saved data:
 *   { checkins: daily_vitals records (exams are told apart), standTests, grip (lib/gripLog.js entries),
 *     crewDays (crew.json days), fitnessWeeks (fitness.json inflight_grip), arrivalDate (first demo date
 *     on this gravity profile), crew?: [{ id, name, status, exams }] (CMO), messages?: ground messages or null (CMO),
 *     activities?: this person's activity records (lib/activities.js; used by APP_REMINDER_SCHEDULE only) }
 * @param {object[]} p.timeline         this person's simulated sensor days up to demoDate (device states)
 * @param {object} [p.schedule]         { kinds, settings } (content/reminderSchedule.js)
 * @param {object} p.profile            mission profile (constants/mission.js)
 * @param {string} p.demoDate           the demo's today (YYYY-MM-DD): decides the DAY
 * @param {Date|number} p.now           the real clock: decides the TIME OF DAY
 * @param {object} [p.dismissed]        reminderStore `entries` (snooze / Not today), keyed crewId|id|demoDate
 * @returns {{ id, kind, title, detail, dueAt, status: 'due'|'overdue'|'snoozed', missedDays, action }[]}
 *   overdue first, then due, then snoozed. "Not today" items are left out (but see missedItemsFor).
 */
export function remindersFor({ crewId, role = 'crew', records = {}, timeline = [], schedule = REMINDER_SCHEDULE, profile, demoDate, now = Date.now(), dismissed = {} }) {
  if (!crewId || !demoDate) return [];
  const s = schedule.settings;
  const kinds = schedule.kinds.filter((k) => role === 'cmo' || !k.cmoOnly);
  // Records dated after the demo's today stay hidden until the clock reaches them.
  const checkins = onOrBefore(records.checkins ?? [], demoDate).filter(isCheckin);
  const ctx = {
    crewId,
    checkins,
    standTests: onOrBefore(records.standTests ?? [], demoDate).filter((r) => r?.kind === 'stand_test'),
    grip: onOrBefore(records.grip ?? [], demoDate),
    crewDays: records.crewDays ?? [],
    fitnessWeeks: records.fitnessWeeks ?? [],
    arrivalDate: records.arrivalDate ?? null,
    crew: records.crew ?? [],
    messages: records.messages ?? null,
    activities: onOrBefore(records.activities ?? [], demoDate),
    timeline,
    profile,
    demoDate,
    now,
    s,
  };
  // A kind may set its own due hour (the Reaction Run: 12:00); every other kind uses the shared one.
  const pastDueFor = (kind) => crewMinutes(now) >= (kind.dueHour ?? s.dueHour) * 60;
  const nowMs = toMs(now);
  const items = kinds.flatMap((kind) =>
    (BUILDERS[kind.id]?.({ ...ctx, kind }) ?? []).map((it) => {
      const pastDue = pastDueFor(kind);
      const entry = dismissed[entryKey(crewId, it.id, demoDate)] ?? {};
      const overdue = it.missedDays >= s.overdueAfterDays || (it.timed && pastDue);
      const snoozed = entry.snoozedUntil && Date.parse(entry.snoozedUntil) > nowMs;
      return {
        id: it.id,
        kind: kind.id,
        title: kind.title,
        detail: it.detail,
        dueAt: it.dueAt,
        status: snoozed ? 'snoozed' : overdue ? 'overdue' : 'due',
        missedDays: it.missedDays,
        action: { ...kind.action, ...(it.actionParams ?? {}) },
        notToday: entry.notToday === true,
      };
    }),
  );
  const order = Object.fromEntries(schedule.kinds.map((k, i) => [k.id, i]));
  return items
    .filter((it) => !it.notToday)
    .map(({ notToday: _n, ...it }) => it)
    .sort((a, b) => RANK[a.status] - RANK[b.status] || b.missedDays - a.missedDays || order[a.kind] - order[b.kind]);
}

/** The bell's number: due + overdue, never snoozed. */
export const bellCount = (items) => items.filter((i) => i.status === 'due' || i.status === 'overdue').length;

/** The Today card: at most `n` items that are not snoozed (the same list as the bell). */
export const dueTodayTop = (items, n = 3) => items.filter((i) => i.status !== 'snoozed').slice(0, n);

// ---------- Escalation ----------

/** 'ground' (3+ days) | 'cmo' (2) | 'overdue' (1) | null. Team-set thresholds. */
export function escalationLevel(missedDays, s = REMINDER_SCHEDULE.settings) {
  if (missedDays >= s.groundAfterDays) return 'ground';
  if (missedDays >= s.cmoAfterDays) return 'cmo';
  if (missedDays >= s.overdueAfterDays) return 'overdue';
  return null;
}

/** "Missed check-in · 2 days". */
export const markerText = (kind, missedDays) => `${REMINDER_KIND[kind]?.missedLabel ?? 'Missed'} · ${plural(missedDays, 'day')}`;

/**
 * One person's missed items the CMO (2+ days) and the ground (3+ days) should know about.
 * "Not today" and snooze never hide these: they are worked out with no dismissals at all.
 * @returns {{ crewId, reminderId, kind, missedDays, level: 'cmo'|'ground', text }[]} worst first
 */
export function missedItemsFor(args) {
  const s = (args.schedule ?? REMINDER_SCHEDULE).settings;
  return remindersFor({ ...args, role: 'crew', dismissed: {} })
    .filter((it) => REMINDER_KIND[it.kind]?.escalates && it.missedDays >= s.cmoAfterDays)
    .map((it) => ({
      crewId: args.crewId,
      reminderId: it.id,
      kind: it.kind,
      missedDays: it.missedDays,
      level: escalationLevel(it.missedDays, s),
      text: markerText(it.kind, it.missedDays),
    }))
    .sort((a, b) => b.missedDays - a.missedDays);
}

/** Crew id → { text, level, items } for the Crew overview cards (worst item's text). */
export function crewMissedMarkers(missed) {
  const out = new Map();
  for (const m of missed) {
    const cur = out.get(m.crewId);
    if (!cur) out.set(m.crewId, { text: m.text, level: m.level, items: [m] });
    else {
      cur.items.push(m);
      if (m.level === 'ground') cur.level = 'ground';
    }
  }
  return out;
}

/** The list for the ground console (3+ missed days in a row). */
export const groundEscalations = (missed, s = REMINDER_SCHEDULE.settings) => missed.filter((m) => m.missedDays >= s.groundAfterDays);

const SEVERITY = { alert: 0, watch: 1 };

/**
 * Crew overview order: open emergencies, alert, watch, then people with a missed marker, then normal;
 * the officer's own card last. Ties keep the given order. (lib/crewOverview.js orderCrewCards is unchanged.)
 */
export function orderWithMissed(cards, selfId, emergencyIds = new Set(), markers = new Map()) {
  const rank = (c) => [
    c.id === selfId ? 1 : 0,
    emergencyIds.has(c.id) ? 0 : 1,
    SEVERITY[c.status] ?? (c.status === 'normal' ? (markers.has(c.id) ? 2 : 3) : 4),
  ];
  return cards
    .map((c, i) => ({ c, i, r: rank(c) }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.r[2] - b.r[2] || a.i - b.i)
    .map((x) => x.c);
}

// ---------- Browser notifications ----------

/**
 * Which items to notify now: only when switched on and permitted, never in quiet hours, never snoozed,
 * and at most once per reminder per demo day (`notified` is reminderStore's map).
 */
export function notificationsToSend({ items, crewId, demoDate, now, notified = {}, enabled, permission, schedule = REMINDER_SCHEDULE }) {
  if (!enabled || permission !== 'granted' || inQuietHours(now, schedule.settings)) return [];
  return items.filter((i) => i.status !== 'snoozed' && !notified[entryKey(crewId, i.id, demoDate)]);
}
