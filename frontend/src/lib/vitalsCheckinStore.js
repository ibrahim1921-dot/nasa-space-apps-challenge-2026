// Daily vitals check-ins saved in this browser's localStorage, in the same record shape as stand tests:
//   { id, crew_id, kind: 'daily_vitals', recorded_at, payload, status, reasons, engine_version, synced_at: null,
//     scored_on: 'device' | 'server', server_differs?, device_result? }
// synced_at stays null until the onboard server has stored it (see lib/outbox.js).
// `payload` is { reading, context, result }: the reading exactly as evaluated, the context answers,
// and the evaluate result (so the dashboard can show it without asking the server again).
// Every access is guarded: storage can be blocked, full or empty.

import { newRecordId, notifyRecordsChanged } from './standTestStore.js';
import { RECORD_KIND } from './vitalsCheckin.js';

const KEY = 'ahm.dailyVitals.v1';
const MAX_RECORDS = 500;

function readAll() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((r) => r && r.kind === RECORD_KIND && r.payload?.reading) : [];
  } catch {
    return [];
  }
}

/** Every saved check-in on this device (all crew members). */
export const readAllVitals = () => readAll();

/** Saved check-ins for one person, newest first. */
export function readVitalsCheckins(crewId) {
  return readAll()
    .filter((r) => r.crew_id === crewId)
    .sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at));
}

/** The newest saved check-in for one person, or null. */
export const latestVitalsCheckin = (crewId) => readVitalsCheckins(crewId)[0] ?? null;

/** Saved readings as `extra_history` for the evaluate API, oldest first. */
export function extraHistoryFor(crewId) {
  return readVitalsCheckins(crewId)
    .reverse()
    .map((r) => ({ recorded_at: r.recorded_at, ...r.payload.reading }));
}

/** @returns {boolean} false when the browser would not store it. */
export function writeVitalsCheckin(record) {
  const list = [record, ...readAll().filter((r) => r.id !== record.id)].slice(0, MAX_RECORDS);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    notifyRecordsChanged();
    return true;
  } catch {
    return false;
  }
}

export function makeVitalsRecord({ crewId, reading, context, result, recordedAt }) {
  return {
    id: newRecordId(),
    crew_id: crewId,
    kind: RECORD_KIND,
    recorded_at: recordedAt ?? new Date().toISOString(),
    payload: { reading, context, result },
    status: result.status,
    reasons: result.reasons,
    engine_version: result.engine_version,
    synced_at: null,
    scored_on: result.scored_on ?? 'device',
  };
}
