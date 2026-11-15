// Earned patches and emergency tough days, saved in this browser only (localStorage `ahm.patches.v1`):
//   { "<crewId>": { earned: { "<patchId>": "YYYY-MM-DD" }, emergencyDays: ["YYYY-MM-DD"] } }
// earned:        the first date each patch was earned. Entries are only ever added, never removed.
// emergencyDays: demo dates on which this person was the patient in an open emergency (emergency times
//                are real-clock only, so the demo day is noted while it is open; an ended one keeps it).

import { ALL_PATCHES } from '../content/activities.js';

export const PATCHES_KEY = 'ahm.patches.v1';
const PATCH_IDS = new Set(ALL_PATCHES.map((p) => p.id));
const MAX_DAYS = 120;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function parsePatchState(value) {
  if (!isObj(value)) return {};
  const out = {};
  for (const [crewId, entry] of Object.entries(value)) {
    if (!isObj(entry)) continue;
    const earned = Object.fromEntries(Object.entries(isObj(entry.earned) ? entry.earned : {}).filter(([id, d]) => PATCH_IDS.has(id) && isDate(d)));
    const emergencyDays = [...new Set((Array.isArray(entry.emergencyDays) ? entry.emergencyDays : []).filter(isDate))].sort().slice(-MAX_DAYS);
    out[crewId] = { earned, emergencyDays };
  }
  return out;
}

export const patchesOf = (state, crewId) => state[crewId] ?? { earned: {}, emergencyDays: [] };

/** Add newly earned patches; an existing earnedOn is kept as it is. */
export function recordEarned(state, crewId, fromRecords) {
  const cur = patchesOf(state, crewId);
  const earned = { ...cur.earned };
  let changed = false;
  for (const [id, date] of Object.entries(fromRecords)) {
    if (PATCH_IDS.has(id) && isDate(date) && !earned[id]) {
      earned[id] = date;
      changed = true;
    }
  }
  return changed ? { ...state, [crewId]: { ...cur, earned } } : state;
}

export function noteEmergencyDay(state, crewId, date) {
  const cur = patchesOf(state, crewId);
  if (!isDate(date) || cur.emergencyDays.includes(date)) return state;
  return { ...state, [crewId]: { ...cur, emergencyDays: [...cur.emergencyDays, date].sort().slice(-MAX_DAYS) } };
}

export function readPatchState(storage) {
  try {
    const raw = storage?.getItem(PATCHES_KEY);
    return parsePatchState(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
}

export function writePatchState(storage, state) {
  try {
    storage.setItem(PATCHES_KEY, JSON.stringify(parsePatchState(state)));
    return true;
  } catch {
    return false;
  }
}
