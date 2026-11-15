// Grip strength values logged on this device (localStorage `ahm.gripLog.v1`), so the weekly grip
// reminder can be completed. They are NOT scored: grip status still comes from the crew record
// (data/fitness.json via lib/fitness.js), and the app says so next to every logged value.
// Entry: { id, crew_id, kind: 'grip_log', kg, recorded_at }. recorded_at uses the demo date.
// Storage is passed in, so node:test uses an in-memory storage.

export const GRIP_LOG_KEY = 'ahm.gripLog.v1';
export const GRIP_MIN_KG = 5;
export const GRIP_MAX_KG = 90;
export const GRIP_LOG_LABEL = 'Logged on this device · not scored yet';
const MAX_ENTRIES = 300;

/** @returns {string|null} a user-facing message, or null when the value can be saved */
export function validateGrip(kg) {
  if (kg === '' || kg === null || kg === undefined) return 'Enter your grip strength in kg.';
  if (typeof kg !== 'number' || !Number.isFinite(kg)) return 'Grip strength must be a number in kg.';
  if (kg < GRIP_MIN_KG || kg > GRIP_MAX_KG) return `Enter a value from ${GRIP_MIN_KG} to ${GRIP_MAX_KG} kg.`;
  if (!Number.isInteger(kg * 2)) return 'Use whole or half kilograms, for example 31 or 31.5.';
  return null;
}

/** "31.5" or "31,5" → 31.5; anything else → NaN (validateGrip rejects it). */
export const parseKg = (text) => (typeof text === 'string' && text.trim() !== '' ? Number(text.trim().replace(',', '.')) : text);

const isEntry = (e) =>
  e && typeof e === 'object' && e.kind === 'grip_log' && typeof e.crew_id === 'string' && validateGrip(e.kg) === null &&
  typeof e.recorded_at === 'string' && !Number.isNaN(Date.parse(e.recorded_at));

function readAll(storage) {
  try {
    const raw = storage?.getItem(GRIP_LOG_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(isEntry) : [];
  } catch {
    return [];
  }
}

/** One person's logged values, newest first. */
export const readGripLog = (storage, crewId) =>
  readAll(storage).filter((e) => e.crew_id === crewId).sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at));

export function makeGripEntry({ crewId, kg, recordedAt, id }) {
  return { id, crew_id: crewId, kind: 'grip_log', kg, recorded_at: recordedAt };
}

/** @returns {{ ok: true } | { ok: false, error: string }} */
export function writeGripEntry(storage, entry) {
  const problem = validateGrip(entry?.kg);
  if (problem) return { ok: false, error: problem };
  if (!isEntry(entry)) return { ok: false, error: 'This value could not be saved.' };
  const list = [entry, ...readAll(storage).filter((e) => e.id !== entry.id)].slice(0, MAX_ENTRIES);
  try {
    storage.setItem(GRIP_LOG_KEY, JSON.stringify(list));
    return { ok: true };
  } catch {
    return { ok: false, error: 'This browser would not save the value.' };
  }
}
