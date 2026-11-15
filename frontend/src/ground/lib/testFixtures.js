// Test helpers for the ground console (Node only): an in-memory Storage, a window stand-in so the
// crew app's stores (which read window.localStorage) run unchanged, and small record fixtures.

export function memoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    data,
  };
}

/** Point globalThis.window at this storage. Returns a function that restores the previous window. */
export function useWindowStorage(storage) {
  const had = Object.hasOwn(globalThis, 'window');
  const prev = globalThis.window;
  globalThis.window = { localStorage: storage, dispatchEvent: () => true, crypto: globalThis.crypto };
  return () => {
    if (had) globalThis.window = prev;
    else delete globalThis.window;
  };
}

export const VITALS_KEY = 'ahm.dailyVitals.v1';

const RESULT = { status: 'normal', reasons: [], engine_version: 'test' };

/** A saved daily check-in (lib/vitalsCheckinStore.js shape). */
export const checkin = ({ id, crewId, at, reading, provenance, enteredBy, status = 'normal', reasons = [] }) => ({
  id,
  crew_id: crewId,
  kind: 'daily_vitals',
  recorded_at: at,
  payload: {
    reading: { systolic: null, diastolic: null, heart_rate: null, glucose: null, temperature: null, sleep_hours: null, mood: null, ...reading },
    context: {},
    result: { ...RESULT, status, reasons },
    ...(provenance ? { provenance } : {}),
    ...(enteredBy ? { entered_by: enteredBy } : {}),
  },
  status,
  reasons,
  engine_version: 'test',
  synced_at: null,
  scored_on: 'device',
});

/** A saved CMO exam for a patient. */
export const exam = ({ id, crewId, at, reading, note = null }) => {
  const r = checkin({ id, crewId, at, reading, enteredBy: { crew_id: 'crew-03', name: 'Lena Kowalski', role: 'cmo' } });
  r.payload.kind_detail = 'cmo_exam';
  r.payload.provenance = Object.fromEntries(Object.keys(reading).map((k) => [k, 'cmo_exam']));
  if (note) r.payload.note = note;
  return r;
};

/** A stored emergency (lib/emergency.js shape). */
export const emergency = ({ id, patient = 'crew-02', started, ended = null, drill = false, events = [] }) => ({
  id,
  patient_crew_id: patient,
  reporter: { crew_id: 'crew-01', name: 'Maya Okafor' },
  flow: 'chest_pain',
  environment: 'spacecraft',
  started_at: started,
  ended_at: ended,
  drill,
  events: [{ id: `${id}-e0`, at: started, type: 'started', by: 'Maya Okafor' }, ...events],
});
