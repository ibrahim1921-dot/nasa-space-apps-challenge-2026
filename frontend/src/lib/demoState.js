// Demo clock and simulated events, saved in this browser only (localStorage key `ahm.demo.v1`):
//   { dayOffset: number, events: [{ crewId, type, startOffset }] }
// "Today" in the app = the last crew.json day + dayOffset. Sensor days exist from the day after the
// last crew.json day up to today. The clock never passes the real date (the onboard server refuses
// readings from the future) or mission day 180.
// Pure functions, plus small read/write helpers that take the storage as an argument, so node:test
// can use an in-memory storage.

import { EVENT_TYPES, addDays, daysBetween } from './sensorFeed.js';

export const DEMO_KEY = 'ahm.demo.v1';
/** Window event fired after the demo state changes, so every view re-reads it. */
export const DEMO_CHANGED_EVENT = 'ahm:demo-changed';
/** Day 1 after the crew record, so the first demo morning already has an overnight sensor reading. */
export const INITIAL_DEMO = Object.freeze({ dayOffset: 1, events: Object.freeze([]) });
export const MISSION_END_DAY = 180;
export const MAX_EVENTS = 20;
export const MAX_OFFSET = 365;

const isInt = (v) => Number.isInteger(v);

/** One event, or null when it is not valid. */
export function cleanEvent(e) {
  if (!e || typeof e !== 'object') return null;
  if (typeof e.crewId !== 'string' || e.crewId === '') return null;
  if (!Object.hasOwn(EVENT_TYPES, e.type)) return null;
  if (!isInt(e.startOffset) || e.startOffset < 0 || e.startOffset > MAX_OFFSET) return null;
  return { crewId: e.crewId, type: e.type, startOffset: e.startOffset };
}

/** Any stored value as a valid demo state (falls back to the initial state). */
export function parseDemo(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...INITIAL_DEMO, events: [] };
  const dayOffset = isInt(value.dayOffset) && value.dayOffset >= 0 && value.dayOffset <= MAX_OFFSET ? value.dayOffset : INITIAL_DEMO.dayOffset;
  const events = Array.isArray(value.events) ? value.events.map(cleanEvent).filter(Boolean).slice(0, MAX_EVENTS) : [];
  return { dayOffset, events };
}

/**
 * How far the clock may go. The real date and mission day 180 are both limits; the first one wins.
 * @param {{ lastDate: string, lastMissionDay: number|null, realToday: string }} p
 * @returns {{ maxOffset: number, reason: 'real'|'mission', date: string }}
 */
export function clockLimit({ lastDate, lastMissionDay, realToday }) {
  const byReal = Math.max(0, daysBetween(lastDate, realToday));
  const byMission = typeof lastMissionDay === 'number' ? Math.max(0, MISSION_END_DAY - lastMissionDay) : Infinity;
  const maxOffset = Math.min(byReal, byMission, MAX_OFFSET);
  return { maxOffset, reason: byMission <= byReal ? 'mission' : 'real', date: addDays(lastDate, maxOffset) };
}

/** The offset actually used: never past the limit. */
export const effectiveOffset = (state, limit) => Math.min(state.dayOffset, limit?.maxOffset ?? state.dayOffset);

/** The demo's "today" (YYYY-MM-DD). */
export const demoToday = (lastDate, offset) => addDays(lastDate, offset);

export const canAdvance = (state, limit) => effectiveOffset(state, limit) < limit.maxOffset;

/** Move the clock on one day (for everyone), up to the limit. */
export function advanceDay(state, limit) {
  const offset = effectiveOffset(state, limit);
  return { ...state, dayOffset: Math.min(offset + 1, limit.maxOffset) };
}

/** Back to the start: clock and events only. Saved check-ins are never touched here. */
export const resetDemo = () => ({ dayOffset: INITIAL_DEMO.dayOffset, events: [] });

/** Add an event for one person that starts tomorrow (demo time). */
export function addEvent(state, { crewId, type }, limit = null) {
  const startOffset = (limit ? effectiveOffset(state, limit) : state.dayOffset) + 1;
  const event = cleanEvent({ crewId, type, startOffset });
  if (!event) return state;
  const others = state.events.filter((e) => !(e.crewId === crewId && e.type === type && e.startOffset === startOffset));
  return { ...state, events: [...others, event].slice(-MAX_EVENTS) };
}

export const removeEvent = (state, index) => ({ ...state, events: state.events.filter((_, i) => i !== index) });

/** Where an event stands today: 'upcoming' | 'active' | 'ended', and its first and last dates. */
export function eventStatus(event, offset, lastDate) {
  const days = EVENT_TYPES[event.type].days;
  const end = event.startOffset + days - 1;
  const status = offset < event.startOffset ? 'upcoming' : offset > end ? 'ended' : 'active';
  return { status, from: addDays(lastDate, event.startOffset), to: addDays(lastDate, end) };
}

/** This person's events, as sent with a check-in so the onboard server rebuilds the same sensor days. */
export const eventsFor = (state, crewId) => state.events.filter((e) => e.crewId === crewId);

/** Records dated on or before the demo's today. Later ones are hidden (never deleted) until the clock reaches them. */
export const onOrBefore = (records, today) =>
  today ? records.filter((r) => typeof r?.recorded_at === 'string' && r.recorded_at.slice(0, 10) <= today) : records;

/** The demo date with the real time of day (as check-ins are stamped), so a record lands on the demo's "today". */
export const stampOnDemoDate = (today, now = new Date()) =>
  today ? `${today}T${new Date(now).toISOString().slice(11)}` : new Date(now).toISOString();

// ---------- Storage ----------

export function readDemo(storage) {
  try {
    const raw = storage?.getItem(DEMO_KEY);
    return parseDemo(raw ? JSON.parse(raw) : null);
  } catch {
    return parseDemo(null);
  }
}

/** @returns {boolean} false when the storage would not take it */
export function writeDemo(state, storage) {
  try {
    storage.setItem(DEMO_KEY, JSON.stringify(parseDemo(state)));
    return true;
  } catch {
    return false;
  }
}

export function notifyDemoChanged() {
  try {
    window.dispatchEvent(new Event(DEMO_CHANGED_EVENT));
  } catch {
    // no window
  }
}
