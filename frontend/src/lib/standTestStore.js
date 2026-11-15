// Stand tests saved in this browser's localStorage, in the record shape a later database sync
// will reuse:
//   { id, crew_id, kind: 'stand_test', recorded_at, payload, status, reasons, engine_version, synced_at: null,
//     scored_on: 'device' | 'server', server_differs?, device_result? }
// `id` is a UUID made on the device; `payload` is the test exactly as evaluated.
// synced_at stays null until the onboard server has stored it (see lib/outbox.js).
// Every access is guarded: storage can be blocked, full or empty.

const KEY = 'ahm.standTests.v1';
const MAX_RECORDS = 500;

/** Window event fired after any saved record changes, so the outbox can try to sync. */
export const RECORDS_CHANGED_EVENT = 'ahm:records-changed';

export function notifyRecordsChanged() {
  try {
    window.dispatchEvent(new Event(RECORDS_CHANGED_EVENT));
  } catch {
    // no window, or events blocked
  }
}

function readAll() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((r) => r && r.kind === 'stand_test' && r.payload) : [];
  } catch {
    return [];
  }
}

/** Every saved stand test on this device (all crew members). */
export const readAllStandTests = () => readAll();

/** Saved records for one person, newest first. */
export function readStandTests(crewId) {
  return readAll()
    .filter((r) => r.crew_id === crewId)
    .sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at));
}

/** @returns {boolean} false when the browser would not store it. */
export function writeStandTest(record) {
  const list = [record, ...readAll().filter((r) => r.id !== record.id)].slice(0, MAX_RECORDS);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    notifyRecordsChanged();
    return true;
  } catch {
    return false;
  }
}

export function newRecordId() {
  try {
    return window.crypto.randomUUID();
  } catch {
    // Fallback UUID v4 shape for browsers without randomUUID (non-secure contexts).
    const hex = () => Math.floor(Math.random() * 16).toString(16);
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) =>
      c === 'x' ? hex() : ((Math.random() * 4) | 8).toString(16),
    );
  }
}

/**
 * `recordedAt` (optional): the demo date with the real time of day (lib/demoState.js stampOnDemoDate), so
 * the test lands on the demo's "today" like a check-in. Without it, the real time is used, as before;
 * records saved earlier keep loading unchanged.
 */
export function makeRecord({ crewId, test, status, reasons, engineVersion, scoredOn = 'device', recordedAt }) {
  return {
    id: newRecordId(),
    crew_id: crewId,
    kind: 'stand_test',
    recorded_at: typeof recordedAt === 'string' && !Number.isNaN(Date.parse(recordedAt)) ? recordedAt : new Date().toISOString(),
    payload: test,
    status,
    reasons,
    engine_version: engineVersion,
    synced_at: null,
    scored_on: scoredOn,
  };
}
