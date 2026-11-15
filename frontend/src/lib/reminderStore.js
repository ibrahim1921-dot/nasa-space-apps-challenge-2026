// Snooze, "Not today", notification bookkeeping and the surface-arrival date, saved in this browser
// only (localStorage `ahm.reminders.v1`):
//   {
//     entries:  { "<crewId>|<reminderId>|<demoDate>": { snoozedUntil?: ISO, notToday?: true, reason?: string } },
//     notified: { "<crewId>|<reminderId>|<demoDate>": ISO },     // at most one notification per reminder per day
//     arrival:  { "<profileId>": "YYYY-MM-DD" },                  // first demo date a gravity profile was seen
//     notify:   boolean                                           // "Allow reminders on this device"
//   }
// Pure functions plus read/write helpers that take the storage, as in lib/demoState.js.

import { REMINDER_SETTINGS } from '../content/reminderSchedule.js';

export const REMINDERS_KEY = 'ahm.reminders.v1';
/** Window event fired after reminder state (or a grip log entry) changes, so the bell re-reads. */
export const REMINDERS_CHANGED_EVENT = 'ahm:reminders-changed';
const MAX_KEYS = 400;

export const EMPTY_REMINDER_STATE = Object.freeze({ entries: {}, notified: {}, arrival: {}, notify: false });

export const entryKey = (crewId, reminderId, demoDate) => `${crewId}|${reminderId}|${demoDate}`;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isTime = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const newest = (obj) => Object.fromEntries(Object.entries(obj).slice(-MAX_KEYS));

/** The reason as stored: trimmed, single line, at most 60 characters (team-set). */
export const cleanReason = (text, max = REMINDER_SETTINGS.reasonMaxLength) =>
  typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, max) : '';

function cleanEntry(e) {
  if (!isObj(e)) return null;
  const out = {};
  if (isTime(e.snoozedUntil)) out.snoozedUntil = e.snoozedUntil;
  if (e.notToday === true) {
    out.notToday = true;
    const reason = cleanReason(e.reason);
    if (reason) out.reason = reason;
  }
  return Object.keys(out).length ? out : null;
}

/** Any stored value as a valid state. */
export function parseReminderState(value) {
  if (!isObj(value)) return { entries: {}, notified: {}, arrival: {}, notify: false };
  const entries = {};
  for (const [k, e] of Object.entries(isObj(value.entries) ? value.entries : {})) {
    const c = cleanEntry(e);
    if (c) entries[k] = c;
  }
  const notified = Object.fromEntries(Object.entries(isObj(value.notified) ? value.notified : {}).filter(([, v]) => isTime(v)));
  const arrival = Object.fromEntries(Object.entries(isObj(value.arrival) ? value.arrival : {}).filter(([, v]) => isDate(v)));
  return { entries: newest(entries), notified: newest(notified), arrival, notify: value.notify === true };
}

/** Snooze one reminder for this demo date until now + 1 h (team-set). */
export function snooze(state, { crewId, reminderId, demoDate, now = Date.now(), minutes = REMINDER_SETTINGS.snoozeMinutes }) {
  const key = entryKey(crewId, reminderId, demoDate);
  const until = new Date(Number(now) + minutes * 60_000).toISOString();
  return { ...state, entries: { ...state.entries, [key]: { ...state.entries[key], snoozedUntil: until } } };
}

/** "Not today", with an optional short reason. Hides it from this person's own list for this demo date only. */
export function notToday(state, { crewId, reminderId, demoDate, reason = '' }) {
  const key = entryKey(crewId, reminderId, demoDate);
  const r = cleanReason(reason);
  const { snoozedUntil, ...rest } = state.entries[key] ?? {};
  void snoozedUntil;
  return { ...state, entries: { ...state.entries, [key]: { ...rest, notToday: true, ...(r ? { reason: r } : {}) } } };
}

export const markNotified = (state, { crewId, reminderId, demoDate, now = Date.now() }) => ({
  ...state,
  notified: { ...state.notified, [entryKey(crewId, reminderId, demoDate)]: new Date(Number(now)).toISOString() },
});

/** Remember the first demo date a profile was seen (kept if already set). */
export const noteArrival = (state, profileId, demoDate) =>
  state.arrival[profileId] ? state : { ...state, arrival: { ...state.arrival, [profileId]: demoDate } };

export const setNotify = (state, on) => ({ ...state, notify: Boolean(on) });

// ---------- Storage ----------

export function readReminderState(storage) {
  try {
    const raw = storage?.getItem(REMINDERS_KEY);
    return parseReminderState(raw ? JSON.parse(raw) : null);
  } catch {
    return parseReminderState(null);
  }
}

/** @returns {boolean} false when the storage would not take it */
export function writeReminderState(storage, state) {
  try {
    storage.setItem(REMINDERS_KEY, JSON.stringify(parseReminderState(state)));
    return true;
  } catch {
    return false;
  }
}

export function notifyRemindersChanged() {
  try {
    window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT));
  } catch {
    // no window (tests)
  }
}
