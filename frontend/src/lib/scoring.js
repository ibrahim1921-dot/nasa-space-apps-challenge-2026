// One scoring entry point for both places a reading is scored:
//   - on the device, the moment it is saved (instant feedback, works with no link to anything), and
//   - on the onboard server (the Java backend), whose result becomes the official one.
// Both call the same engines (baseline.js through the check-in evaluator, and standTest.js) with the
// same history, so they agree unless the server knows readings this device does not.
// Pure functions only: no storage or network access.

import { SOURCE_ENTERED, SOURCE_SYNTHETIC, STAND_TEST_ENGINE_VERSION, cleanStandTest, evaluateStandTest } from './standTest.js';
import { buildHistory, cleanReading, evaluateCheckin } from './vitalsCheckin.js';

export const SCORED_ON = { device: 'device', server: 'server' };
export const SCORED_LABEL = {
  device: 'Scored on this device',
  server: 'Scored on the onboard server',
};

const HISTORY_WHERE = { device: 'saved on this device', server: 'stored on the onboard server' };

const before = (iso) => (r) => Date.parse(r.recorded_at) < Date.parse(iso);

/**
 * Score a daily vitals check-in.
 * @param {object} p
 * @param {string} p.crewId
 * @param {object} p.reading     { systolic, diastolic, heart_rate, glucose, temperature, sleep_hours, mood }
 * @param {object[]} p.crewDays  the person's seeded days (crew.json shape), oldest first
 * @param {object[]} p.saved     the person's readings entered later: [{ recorded_at, ...reading }]
 * @param {string} p.at          when this reading was recorded (ISO); only saved readings before it count
 * @param {'device'|'server'} p.scoredOn
 */
export function scoreCheckin({ crewId, reading, crewDays = [], saved = [], at, scoredOn }) {
  const clean = cleanReading(reading);
  const earlier = saved.filter(before(at)).map((r) => ({ recorded_at: r.recorded_at, ...cleanReading(r) }));
  const result = evaluateCheckin(clean, buildHistory(crewDays, earlier));
  return {
    source: SOURCE_ENTERED,
    history_source: earlier.length ? `${SOURCE_SYNTHETIC} + ${earlier.length} ${HISTORY_WHERE[scoredOn]}` : SOURCE_SYNTHETIC,
    crew_id: crewId,
    evaluated_at: at,
    reading: clean,
    scored_on: scoredOn,
    ...result,
  };
}

/**
 * Score a stand test against the person's preflight tests.
 * @param {{ test: object, preflightTests: object[], scoredOn: 'device'|'server' }} p
 */
export function scoreStandTest({ test, preflightTests = [], scoredOn }) {
  const clean = cleanStandTest(test);
  return {
    source: SOURCE_ENTERED,
    preflight_source: SOURCE_SYNTHETIC,
    engine_version: STAND_TEST_ENGINE_VERSION,
    scored_on: scoredOn,
    test: clean,
    ...evaluateStandTest(clean, preflightTests),
  };
}

/**
 * Daily-vitals history from stored reading rows ({ recorded_at, payload }):
 * seeded rows carry the crew.json day as payload.day, entered rows carry payload.reading.
 * @returns {{ crewDays: object[], saved: object[] }} ready for scoreCheckin
 */
export function historyFromRows(rows) {
  const crewDays = rows
    .filter((r) => r.payload?.origin === 'seed' && r.payload.day)
    .map((r) => r.payload.day)
    .sort((a, b) => a.day - b.day);
  const saved = rows
    .filter((r) => r.payload?.origin !== 'seed' && r.payload?.reading)
    .map((r) => ({ recorded_at: r.recorded_at, ...r.payload.reading }));
  return { crewDays, saved };
}

/** Do two scored results agree on what is stored: status, reasons and engine version? */
export function sameResult(a, b) {
  if (!a || !b) return false;
  return (
    a.status === b.status &&
    a.engine_version === b.engine_version &&
    JSON.stringify(a.reasons ?? []) === JSON.stringify(b.reasons ?? [])
  );
}
