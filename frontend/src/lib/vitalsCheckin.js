// Daily vitals check-in: validate a reading, score it with the baseline engine against the
// person's history, and shape the result for the API and the result screen.
// Pure functions only (no file or network access), so it runs in API routes, the browser and node:test.
//
// Status per indicator = the worst of the fixed-range check (content/limits.js via rangeCheck.js),
// the personal z-score check and the slow-drift check, all from lib/baseline.js.

import { CRISIS_ACTION } from '../content/limits.js';
import { CRISIS_STEPS, VITALS_STEPS } from '../content/actions.js';
import { ENGINE_VERSION, SETTINGS, baselineAfter, evaluateSeries, fmt } from './baseline.js';

export const VITALS_ENGINE_VERSION = `daily-vitals-1.0.0+${ENGINE_VERSION}`;
export const RECORD_KIND = 'daily_vitals';
export const MAX_EXTRA_HISTORY = 400;

/**
 * Input fields, in entry order, with plausibility ranges. These reject typos and impossible
 * values only; they are not health limits (those live in content/limits.js).
 */
export const READING_FIELDS = {
  systolic: { min: 60, max: 260, unit: 'mmHg', label: 'systolic blood pressure', baselineKey: 'systolic' },
  diastolic: { min: 30, max: 160, unit: 'mmHg', label: 'diastolic blood pressure', baselineKey: 'diastolic' },
  heart_rate: { min: 25, max: 220, unit: 'bpm', label: 'resting heart rate', baselineKey: 'heartRate' },
  glucose: { min: 20, max: 600, unit: 'mg/dL', label: 'fasting blood sugar', baselineKey: 'glucose' },
  temperature: { min: 30, max: 43, unit: '°C', label: 'temperature', baselineKey: 'temperature' },
  sleep_hours: { min: 0, max: 24, unit: 'h', label: 'sleep', baselineKey: 'sleepHours' },
  mood: { min: 1, max: 5, unit: '/ 5', label: 'mood', baselineKey: 'mood', integer: true },
};
export const READING_KEYS = Object.keys(READING_FIELDS);

/**
 * Result rows, in display order. `parts` are reading keys; `limitKey` is the LIMIT_GROUPS key
 * that the Limits & sources panel uses.
 */
export const VITALS_ROWS = [
  { id: 'blood_pressure', name: 'Blood pressure', unit: 'mmHg', parts: ['systolic', 'diastolic'], limitKey: 'blood_pressure' },
  { id: 'heart_rate', name: 'Resting heart rate', unit: 'bpm', parts: ['heart_rate'], limitKey: 'resting_hr' },
  { id: 'glucose', name: 'Fasting blood sugar', unit: 'mg/dL', parts: ['glucose'], limitKey: 'fasting_glucose' },
  { id: 'temperature', name: 'Body temperature', unit: '°C', parts: ['temperature'], limitKey: 'temperature' },
  { id: 'sleep_hours', name: 'Sleep', unit: 'h', parts: ['sleep_hours'], limitKey: 'sleep_hours' },
  { id: 'mood', name: 'Mood', unit: '/ 5', parts: ['mood'], limitKey: 'mood' },
];

const RANK = { normal: 0, watch: 1, alert: 2 };
const worse = (a, b) => (RANK[a ?? 'normal'] >= RANK[b ?? 'normal'] ? a ?? 'normal' : b ?? 'normal');
const worst = (list) => list.reduce((s, x) => worse(s, x), 'normal');

// ---------- Validation ----------

/** Check one value. @returns {string|null} a user-facing message, or null when valid. */
export function validateField(key, raw, label = 'reading') {
  const { min, max, unit, label: name, integer } = READING_FIELDS[key];
  if (raw === undefined || raw === null || raw === '') return `${label}.${key} (${name}) is missing.`;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return `${label}.${key} (${name}) must be a number.`;
  if (integer && !Number.isInteger(raw)) return `${label}.${key} (${name}) must be a whole number from ${min} to ${max}.`;
  if (raw < min || raw > max) return `${label}.${key} (${name}) is ${raw}; expected ${min}–${max} ${unit}.`;
  return null;
}

/**
 * Check a whole reading. @returns {string|null}
 * A value set to null means "not measured" (a sensor gap, or a question not answered); it is skipped,
 * never guessed. A missing key or an empty string is still an error, so a typo is not silently dropped.
 * At least one value must be present, and blood pressure needs both numbers or neither.
 */
export function validateReading(reading, label = 'reading') {
  if (!reading || typeof reading !== 'object' || Array.isArray(reading)) {
    return `${label} must be an object with ${READING_KEYS.join(', ')}.`;
  }
  for (const key of READING_KEYS) {
    if (reading[key] === null) continue;
    // Blood pressure is optional for a manual check-in: both keys left out is fine; one alone is still an error.
    if (['systolic', 'diastolic'].includes(key) && reading.systolic === undefined && reading.diastolic === undefined) continue;
    const error = validateField(key, reading[key], label);
    if (error) return error;
  }
  if (READING_KEYS.every((k) => reading[k] === null)) return `${label} has no values: at least one reading is needed.`;
  if ((reading.systolic === null) !== (reading.diastolic === null)) {
    return `${label}: blood pressure needs both systolic and diastolic, or neither.`;
  }
  if (reading.systolic !== null && reading.diastolic >= reading.systolic) {
    return `${label}: diastolic (${reading.diastolic}) must be lower than systolic (${reading.systolic}).`;
  }
  return null;
}

/**
 * Check readings saved on this device: [{ recorded_at, systolic, diastolic, heart_rate, … }].
 * @returns {string|null}
 */
export function validateExtraHistory(list) {
  if (list === undefined || list === null) return null;
  if (!Array.isArray(list)) return 'extra_history must be an array of saved readings.';
  if (list.length > MAX_EXTRA_HISTORY) return `extra_history has ${list.length} items; send at most ${MAX_EXTRA_HISTORY}.`;
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const label = `extra_history[${i}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) return `${label} must be an object.`;
    if (typeof item.recorded_at !== 'string' || Number.isNaN(Date.parse(item.recorded_at))) {
      return `${label}.recorded_at must be an ISO date-time string.`;
    }
    const error = validateReading(item, label);
    if (error) return error;
  }
  return null;
}

/** Keep only the reading fields, so the echo and any later sync carry no extra input. Not measured = null. */
export const cleanReading = (reading) => Object.fromEntries(READING_KEYS.map((k) => [k, reading[k] ?? null]));

/** Is this reading value present (a finite number)? */
export const hasValue = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------- History ----------

/** A request reading (snake_case) as a baseline-engine day (crew.json keys). */
export function toBaselineDay(reading, extra = {}) {
  const day = { ...extra };
  for (const key of READING_KEYS) day[READING_FIELDS[key].baselineKey] = reading[key] ?? null;
  return day;
}

const SENSOR_STAMP = 'T06:00:00.000Z';
const stampOf = (e) => e.recorded_at ?? `${e.date}${SENSOR_STAMP}`;

/** kind_detail of an exam the Crew Medical Officer recorded for a crew member. */
export const CMO_EXAM = 'cmo_exam';
/** Is this saved reading (or record payload) a CMO exam? */
export const isExamItem = (r) => r?.kind_detail === CMO_EXAM;

/**
 * One timeline per person, oldest first: their crew.json days, then (merged by time) simulated sensor
 * days and readings saved later. A saved check-in replaces the sensor day of the same date (the
 * newest data wins). Day numbers continue after the last crew.json day.
 *
 * CMO exams (saved items with kind_detail 'cmo_exam') never add a second entry on a date that has one:
 * each date's base is its latest check-in, else its sensor day, else its crew.json day, and the exams
 * of that date overlay their measured fields in time order, each field only when the exam is newer
 * than the value already there. So a check-in after an exam wins for the fields it has, and the
 * exam's values stay only where the check-in left null. A date with no entry at all gets one partial
 * entry holding just the exam values. Merged entries carry `exams: [{ recorded_at, fields, ref?,
 * entered_by? }]` and `provenance[field] = 'cmo_exam'`. Without exams the result is exactly as before.
 * @param {{ crewDays?: object[], sensorDays?: object[], saved?: object[] }} p
 *   saved: [{ recorded_at, systolic, diastolic, heart_rate, …, kind_detail?, ref?, entered_by? }] (snake_case readings)
 */
export function buildTimeline({ crewDays = [], sensorDays = [], saved = [] } = {}) {
  const seeded = crewDays.map((d) => ({ ...d }));
  const lastDay = seeded.at(-1)?.day ?? 0;
  const exams = saved.filter(isExamItem);
  const checkins = exams.length ? saved.filter((r) => !isExamItem(r)) : saved;
  const savedDates = new Set(checkins.map((r) => r.recorded_at.slice(0, 10)));
  const later = [
    ...sensorDays.filter((d) => d && !savedDates.has(d.date)).map((d) => ({ kind: 'sensor', at: stampOf(d), d })),
    ...checkins.map((r) => ({ kind: 'saved', at: r.recorded_at, r })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const rest = later.map((e, i) =>
    e.kind === 'sensor'
      ? { ...e.d, day: lastDay + i + 1 }
      : toBaselineDay(e.r, { day: lastDay + i + 1, date: e.r.recorded_at.slice(0, 10) }),
  );
  if (!exams.length) return [...seeded, ...rest];
  return overlayExams({ seeded, later, rest, exams, lastDay });
}

const BASE_RANK = { seed: 0, sensor: 1, saved: 2 };

function overlayExams({ seeded, later, rest, exams, lastDay }) {
  const entries = [
    ...seeded.map((d) => ({ kind: 'seed', at: `${d.date}${SENSOR_STAMP}`, date: d.date, d })),
    ...rest.map((d, i) => ({ kind: later[i].kind, at: later[i].at, date: d.date, d })),
  ];
  // Each date's base: its latest check-in, else its sensor day, else its crew.json day.
  const baseOf = new Map();
  for (const e of entries) {
    if (!e.date) continue;
    const cur = baseOf.get(e.date);
    if (!cur || BASE_RANK[e.kind] > BASE_RANK[cur.kind] || (e.kind === cur.kind && Date.parse(e.at) >= Date.parse(cur.at))) {
      baseOf.set(e.date, e);
    }
  }
  const standalone = [];
  const ordered = [...exams].sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
  for (const x of ordered) {
    const date = x.recorded_at.slice(0, 10);
    let base = baseOf.get(date);
    if (!base) {
      base = { kind: 'exam', at: x.recorded_at, date, d: toBaselineDay({}, { date, examOnly: true }) };
      baseOf.set(date, base);
      standalone.push(base);
    }
    if (!base.times) {
      // Copy before changing: sensor days share their provenance object with the feed.
      const baseMs = base.kind === 'exam' ? -Infinity : Date.parse(base.at);
      base.d = { ...base.d, exams: [...(base.d.exams ?? [])] };
      if (base.d.provenance) base.d.provenance = { ...base.d.provenance };
      base.times = Object.fromEntries(
        READING_KEYS.map((k) => [k, hasValue(base.d[READING_FIELDS[k].baselineKey]) ? baseMs : -Infinity]),
      );
    }
    const t = Date.parse(x.recorded_at);
    const fields = [];
    for (const k of READING_KEYS) {
      if (!hasValue(x[k]) || !(t > base.times[k])) continue;
      base.d[READING_FIELDS[k].baselineKey] = x[k];
      base.times[k] = t;
      fields.push(k);
    }
    if (fields.length) {
      base.d.provenance = { ...(base.d.provenance ?? {}), ...Object.fromEntries(fields.map((k) => [k, CMO_EXAM])) };
    }
    base.d.exams.push({
      recorded_at: x.recorded_at,
      fields,
      ...(x.ref !== undefined ? { ref: x.ref } : {}),
      ...(x.entered_by ? { entered_by: x.entered_by } : {}),
    });
  }
  const seededOut = entries.slice(0, seeded.length).map((e) => e.d);
  const restOut = [...entries.slice(seeded.length), ...standalone]
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map((e, i) => ({ ...e.d, day: lastDay + i + 1 }));
  return [...seededOut, ...restOut];
}

/** A timeline entry (crew.json keys) as a check-in reading (snake_case); missing values are null. */
export const readingFromEntry = (entry) =>
  Object.fromEntries(READING_KEYS.map((k) => [k, hasValue(entry?.[READING_FIELDS[k].baselineKey]) ? entry[READING_FIELDS[k].baselineKey] : null]));

/**
 * The person's history, oldest first: their crew.json days, then readings saved on this device
 * (sorted by time). Day numbers continue after the last crew.json day.
 */
export function buildHistory(crewDays = [], extraHistory = []) {
  return buildTimeline({ crewDays, saved: extraHistory });
}

// ---------- Evaluation ----------

const round = (v, digits) => Number(v.toFixed(digits));
const digitsOf = (baselineKey) => (baselineKey === 'temperature' || baselineKey === 'sleepHours' ? 1 : 0);

function usualFor(row, parts) {
  if (parts.some((p) => !p.usual)) return null;
  const days = Math.min(...parts.map((p) => p.usual.days));
  if (row.id === 'blood_pressure') {
    const [s, d] = parts.map((p) => Math.round(p.usual.mean));
    return { mean: { systolic: s, diastolic: d }, days, text: `${s}/${d} ${row.unit}` };
  }
  const key = READING_FIELDS[row.parts[0]].baselineKey;
  const { mean, sd } = parts[0].usual;
  return { mean: round(mean, digitsOf(key)), sd: round(sd, 2), days, text: fmt(key, mean) };
}

function actionFor(row, status, crisis, urgent) {
  if (status !== 'watch' && status !== 'alert') return null;
  if (crisis) return { status: 'alert', urgent: urgent ?? CRISIS_ACTION, steps: [...CRISIS_STEPS] };
  return { status, urgent: null, steps: [...VITALS_STEPS[row.id][status]] };
}

function rowResult(row, today, reading) {
  const parts = row.parts.map((k) => today.indicators[READING_FIELDS[k].baselineKey]);
  const status = worst(parts.map((p) => p.status));
  const crisis = parts.some((p) => p.crisis);
  const urgent = parts.find((p) => p.action)?.action ?? null;
  const single = parts.length === 1;
  const zs = parts.map((p) => p.z);
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    limit_key: row.limitKey,
    value: single ? reading[row.parts[0]] : Object.fromEntries(row.parts.map((k) => [k, reading[k]])),
    status,
    range_status: parts.some((p) => p.rangeStatus === null) ? null : worst(parts.map((p) => p.rangeStatus)),
    baseline_status: worst(parts.map((p) => p.baselineStatus)),
    drift_status: worst(parts.map((p) => p.driftStatus)),
    z: single ? zs[0] : Object.fromEntries(row.parts.map((k, i) => [k, zs[i]])),
    reasons: parts.flatMap((p) => p.reasons),
    usual: usualFor(row, parts),
    crisis,
    action: actionFor(row, status, crisis, urgent),
  };
}

/** One line for the top of the result screen. */
function summaryFor(rows, needsAttention, crisis) {
  const flagged = rows.filter((r) => r.status !== 'normal');
  if (crisis) return 'Your blood pressure is over the crisis line. Act on the first step now.';
  if (flagged.length === 0) return 'All readings are within the limits and your usual range.';
  if (!needsAttention) return 'One reading is on watch. On its own this is often day-to-day noise; re-check tomorrow.';
  return `${flagged.length} reading${flagged.length === 1 ? ' needs' : 's need'} attention today.`;
}

/** The one card to show first: crisis, else the combined steps when the day needs attention. */
function overallAction(rows, status, needsAttention, crisis) {
  if (crisis) {
    const bp = rows.find((r) => r.crisis);
    return { status: 'alert', urgent: bp.action.urgent, steps: [...CRISIS_STEPS], indicators: [bp.id] };
  }
  if (!needsAttention) return null;
  const flagged = rows.filter((r) => r.action).sort((a, b) => RANK[b.status] - RANK[a.status]);
  const steps = [...new Set(flagged.flatMap((r) => r.action.steps))];
  return { status, urgent: null, steps, indicators: flagged.map((r) => r.id) };
}

/**
 * The check-in result for one evaluated day (an evaluateSeries() result), with its reading.
 * Rows whose value is missing (null) are left out and listed in `missing`; nothing is guessed.
 * @param {object} today        evaluateSeries() result for the day
 * @param {object} reading      { systolic, diastolic, heart_rate, glucose, temperature, sleep_hours, mood }
 * @param {number} historyDays  how many days came before it
 */
export function checkinResultFrom(today, reading, historyDays) {
  const scored = VITALS_ROWS.filter((row) => row.parts.every((k) => hasValue(reading[k])));
  const missing = VITALS_ROWS.filter((row) => !scored.includes(row)).map((row) => row.id);
  const rows = scored.map((row) => rowResult(row, today, reading));
  const indicators = Object.fromEntries(rows.map((r) => [r.id, r]));
  const status = worst(rows.map((r) => r.status));
  const crisis = rows.some((r) => r.crisis);
  const needsAttention = today.attention;
  return {
    engine_version: VITALS_ENGINE_VERSION,
    status,
    needs_attention: needsAttention,
    crisis,
    summary: summaryFor(rows, needsAttention, crisis),
    indicators,
    order: rows.map((r) => r.id),
    action: overallAction(rows, status, needsAttention, crisis),
    reasons: rows.flatMap((r) => r.reasons),
    history_days: historyDays,
    baseline_window_days: SETTINGS.windowDays,
    ...(missing.length ? { missing } : {}),
  };
}

/**
 * Score today's reading against the person's history.
 * @param {object} reading  validated { systolic, diastolic, heart_rate, glucose, temperature, sleep_hours, mood };
 *                          a value may be null (not measured), and that row is skipped
 * @param {object[]} history  baseline-engine days, oldest first (see buildHistory)
 */
export function evaluateCheckin(reading, history = []) {
  const lastDay = history.at(-1)?.day ?? 0;
  const series = evaluateSeries([...history, toBaselineDay(reading, { day: lastDay + 1 })]);
  return checkinResultFrom(series.at(-1), reading, history.length);
}

/**
 * "Your usual" per result row, as the next reading would be judged: { blood_pressure: { mean, days, text }, … }.
 * A row is null until there are 7 clean days.
 */
export function usualByRow(history) {
  const base = baselineAfter(history);
  return Object.fromEntries(
    VITALS_ROWS.map((row) => [row.id, usualFor(row, row.parts.map((k) => ({ usual: base[READING_FIELDS[k].baselineKey] })))]),
  );
}

/** Plain value text for a row: "118/76", "36.8", "7.5", "4". */
export function formatRowValue(row) {
  if (row.id === 'blood_pressure') return `${row.value.systolic}/${row.value.diastolic}`;
  const key = READING_FIELDS[VITALS_ROWS.find((r) => r.id === row.id).parts[0]].baselineKey;
  return Number(row.value).toFixed(digitsOf(key));
}
