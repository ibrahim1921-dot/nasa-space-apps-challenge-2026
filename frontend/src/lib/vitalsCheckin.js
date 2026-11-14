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

/** Check a whole reading. @returns {string|null} */
export function validateReading(reading, label = 'reading') {
  if (!reading || typeof reading !== 'object' || Array.isArray(reading)) {
    return `${label} must be an object with ${READING_KEYS.join(', ')}.`;
  }
  for (const key of READING_KEYS) {
    const error = validateField(key, reading[key], label);
    if (error) return error;
  }
  if (reading.diastolic >= reading.systolic) {
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

/** Keep only the reading fields, so the echo and any later sync carry no extra input. */
export const cleanReading = (reading) => Object.fromEntries(READING_KEYS.map((k) => [k, reading[k]]));

// ---------- History ----------

/** A request reading (snake_case) as a baseline-engine day (crew.json keys). */
export function toBaselineDay(reading, extra = {}) {
  const day = { ...extra };
  for (const key of READING_KEYS) day[READING_FIELDS[key].baselineKey] = reading[key];
  return day;
}

/**
 * The person's history, oldest first: their crew.json days, then readings saved on this device
 * (sorted by time). Day numbers continue after the last crew.json day.
 */
export function buildHistory(crewDays = [], extraHistory = []) {
  const seeded = crewDays.map((d) => ({ ...d }));
  const lastDay = seeded.at(-1)?.day ?? 0;
  const saved = [...extraHistory]
    .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at))
    .map((r, i) => toBaselineDay(r, { day: lastDay + i + 1, date: r.recorded_at.slice(0, 10) }));
  return [...seeded, ...saved];
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
 * Score today's reading against the person's history.
 * @param {object} reading  validated { systolic, diastolic, heart_rate, glucose, temperature, sleep_hours, mood }
 * @param {object[]} history  baseline-engine days, oldest first (see buildHistory)
 */
export function evaluateCheckin(reading, history = []) {
  const lastDay = history.at(-1)?.day ?? 0;
  const series = evaluateSeries([...history, toBaselineDay(reading, { day: lastDay + 1 })]);
  const today = series.at(-1);
  const rows = VITALS_ROWS.map((row) => rowResult(row, today, reading));
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
    history_days: history.length,
    baseline_window_days: SETTINGS.windowDays,
  };
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
