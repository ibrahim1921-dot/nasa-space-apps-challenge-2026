// One scoring entry point for both places a reading is scored:
//   - on the device, the moment it is saved (instant feedback, works with no link to anything), and
//   - on the onboard server in POST /api/sync, which stores the official result.
// Both call the same engines (baseline.js through the check-in evaluator, and standTest.js) with the
// same history, so they agree unless the server knows readings this device does not.
// Pure functions only: no storage or network access.

import { SOURCE_ENTERED, SOURCE_SYNTHETIC, STAND_TEST_ENGINE_VERSION, cleanStandTest, evaluateStandTest } from './standTest.js';
import { CMO_EXAM, buildTimeline, checkinResultFrom, cleanReading, evaluateCheckin, isExamItem, readingFromEntry } from './vitalsCheckin.js';
import { evaluateSeries } from './baseline.js';

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
 * @param {object[]} [p.sensorDays] simulated sensor days (lib/sensorFeed.js); only days before this
 *                                  reading's date count (the reading replaces its own date's sensor day)
 */
export function scoreCheckin({ crewId, reading, crewDays = [], saved = [], sensorDays = [], at, scoredOn, kindDetail = null }) {
  if (kindDetail === CMO_EXAM) return scoreExam({ crewId, reading, crewDays, saved, sensorDays, at, scoredOn });
  const clean = cleanReading(reading);
  const date = at.slice(0, 10);
  // An exam on this check-in's own date belongs to the same day, not to its history.
  const earlier = saved
    .filter(before(at))
    .filter((r) => !(isExamItem(r) && r.recorded_at.slice(0, 10) === date))
    .map(asSaved);
  const sensors = sensorDays.filter((d) => d && d.date < date);
  const shownSensors = sensors.filter((d) => !earlier.some((r) => !isExamItem(r) && r.recorded_at.slice(0, 10) === d.date));
  const result = evaluateCheckin(clean, buildTimeline({ crewDays, sensorDays: sensors, saved: earlier }));
  const parts = [SOURCE_SYNTHETIC];
  if (shownSensors.length) parts.push(`${shownSensors.length} simulated sensor day${shownSensors.length === 1 ? '' : 's'}`);
  if (earlier.length) parts.push(`${earlier.length} ${HISTORY_WHERE[scoredOn]}`);
  return {
    source: SOURCE_ENTERED,
    history_source: parts.join(' + '),
    crew_id: crewId,
    evaluated_at: at,
    reading: clean,
    scored_on: scoredOn,
    ...result,
  };
}

/** A saved reading as a timeline item; exams keep their marker (and nothing else extra). */
const asSaved = (r) => ({ recorded_at: r.recorded_at, ...(isExamItem(r) ? { kind_detail: CMO_EXAM } : {}), ...cleanReading(r) });

const SELF = Symbol('this exam');

/**
 * A CMO exam is scored as the merged day it belongs to: that date's base (latest check-in, else
 * sensor day, else crew.json day) with the earlier exams of the date and this one overlaid
 * (buildTimeline), against the patient's entries before it. `reading` stays the exam's own measured
 * values; `day_reading` is the merged day the result rows describe. Because the engine is causal, the
 * result is exactly what the dashboard's timeline gives that day.
 */
function scoreExam({ crewId, reading, crewDays, saved, sensorDays, at, scoredOn }) {
  const clean = cleanReading(reading);
  const date = at.slice(0, 10);
  const earlier = saved.filter(before(at)).map(asSaved);
  const sensors = sensorDays.filter((d) => d && d.date <= date);
  const timeline = buildTimeline({ crewDays, sensorDays: sensors, saved: [...earlier, { recorded_at: at, kind_detail: CMO_EXAM, ref: SELF, ...clean }] });
  const idx = timeline.findIndex((e) => e.exams?.some((x) => x.ref === SELF));
  const upTo = timeline.slice(0, idx + 1);
  const dayReading = readingFromEntry(timeline[idx]);
  const result = checkinResultFrom(evaluateSeries(upTo).at(-1), dayReading, idx);
  const sensorCount = upTo.filter((d) => d.source === 'sensor').length;
  const parts = [SOURCE_SYNTHETIC];
  if (sensorCount) parts.push(`${sensorCount} simulated sensor day${sensorCount === 1 ? '' : 's'}`);
  if (earlier.length) parts.push(`${earlier.length} ${HISTORY_WHERE[scoredOn]}`);
  return {
    source: SOURCE_ENTERED,
    history_source: parts.join(' + '),
    crew_id: crewId,
    evaluated_at: at,
    reading: clean,
    day_reading: dayReading,
    kind_detail: CMO_EXAM,
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
    .map((r) => ({ recorded_at: r.recorded_at, ...(isExamItem(r.payload) ? { kind_detail: CMO_EXAM } : {}), ...r.payload.reading }));
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
