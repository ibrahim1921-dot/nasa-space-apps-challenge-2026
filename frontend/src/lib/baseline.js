// Health status engine: compares each reading with the published / team-set limits and with the
// astronaut's own recent baseline, and explains every flag in plain words.
// Runs in the browser, so it keeps working with no link to Earth.
//
// Statuses use the app's existing values: 'normal' | 'watch' | 'alert'.
// No limit numbers live here: the fixed-range part calls rangeStatus() from lib/rangeCheck.js,
// which reads content/limits.js. This file only holds the personal-baseline settings.

import { RANGE_INDICATORS, crossingPhrase, rangeStatus, worstLimit } from './rangeCheck.js';

/**
 * @typedef {'normal'|'watch'|'alert'} Status
 * @typedef {{ day: number, [key: string]: number }} DayReading
 */

/** Bump when the rules or settings change, so saved results can be told apart. */
export const ENGINE_VERSION = 'baseline-2.0.0';

/**
 * Indicator settings.
 * - limitKey: the indicator id in content/limits.js; null = judged against the personal baseline only
 * - direction: which way is bad ('high', 'low' or 'both') for the personal check
 * - minSd: smallest spread allowed, so a very steady week doesn't make tiny changes look big
 */
export const INDICATORS = {
  systolic: { label: 'Systolic blood pressure', unit: 'mmHg', direction: 'high', minSd: 3, limitKey: 'systolic_bp' },
  diastolic: { label: 'Diastolic blood pressure', unit: 'mmHg', direction: 'high', minSd: 2.5, limitKey: 'diastolic_bp' },
  heartRate: { label: 'Resting heart rate', unit: 'bpm', direction: 'both', minSd: 2.5, limitKey: 'resting_hr' },
  glucose: { label: 'Blood sugar (fasting)', unit: 'mg/dL', direction: 'both', minSd: 4, limitKey: 'fasting_glucose' },
  temperature: { label: 'Body temperature', unit: '°C', direction: 'high', minSd: 0.15, limitKey: 'temperature' },
  sleepHours: { label: 'Sleep', unit: 'h', direction: 'low', minSd: 0.35, limitKey: 'sleep_hours' },
  mood: { label: 'Mood', unit: '/ 5', direction: 'low', minSd: 0.5, limitKey: 'mood' },
  reactionMs: { label: 'Reaction time', unit: 'ms', direction: 'high', minSd: 10, limitKey: null },
  lapses: { label: 'Reaction lapses', unit: 'per test', direction: 'high', minSd: 1.5, limitKey: null },
};

for (const [key, cfg] of Object.entries(INDICATORS)) {
  if (cfg.limitKey && !RANGE_INDICATORS.includes(cfg.limitKey)) {
    throw new Error(`baseline.js: "${key}" points at "${cfg.limitKey}", which has no range limits in content/limits.js`);
  }
}

export const SETTINGS = {
  windowDays: 14, // personal baseline = the previous 14 days
  minHistory: 7, // need at least this many days before judging against baseline
  watchZ: 2,
  alertZ: 3.5,
  ewmaAlpha: 0.3,
  driftZ: 1, // EWMA this many reference SDs off for...
  driftDays: 5, // ...this many days in a row = slow drift
  minWatchCount: 2, // watch-level indicators needed on one day to raise it
};

const RANK = { normal: 0, watch: 1, alert: 2 };
const worse = (a, b) => (RANK[a] >= RANK[b] ? a : b);

function meanSd(values, minSd) {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(n - 1, 1);
  return { mean, sd: Math.max(Math.sqrt(variance), minSd) };
}

const digitsFor = (key) => (key === 'temperature' || key === 'sleepHours' ? 1 : 0);

export const fmt = (key, v) => {
  const { unit } = INDICATORS[key];
  return `${Number(v).toFixed(digitsFor(key))} ${unit}`.replace(' / 5', '/5');
};

/**
 * Fixed-range check, through rangeStatus() and the limits in content/limits.js.
 * Indicators with no limits (reaction time, lapses) return status null.
 * @returns {{ status: Status|null, reason: string|null, crisis: boolean, action: string|null, limit: object|null }}
 */
export function rangeCheck(key, value) {
  const { limitKey, label } = INDICATORS[key];
  if (!limitKey) return { status: null, reason: null, crisis: false, action: null, limit: null };
  const r = rangeStatus(limitKey, value);
  if (r.status === null || r.status === 'normal') {
    return { status: r.status, reason: null, crisis: false, action: null, limit: null };
  }
  const limit = worstLimit(r.matched);
  return {
    status: r.status,
    reason: `${label} ${fmt(key, value)} is ${crossingPhrase(limit)}`,
    crisis: r.crisis,
    action: r.action,
    limit,
  };
}

/**
 * Personal-baseline check.
 * @returns {{ status: Status, z: number|null, reason: string|null, mean: number|null, sd: number|null, n: number }}
 */
export function baselineCheck(key, value, history) {
  const cfg = INDICATORS[key];
  const n = history.length;
  if (n < SETTINGS.minHistory) return { status: 'normal', z: null, reason: null, mean: null, sd: null, n };
  const { mean, sd } = meanSd(history, cfg.minSd);
  const z = (value - mean) / sd;
  const bad = cfg.direction === 'high' ? z : cfg.direction === 'low' ? -z : Math.abs(z);
  const status = bad >= SETTINGS.alertZ ? 'alert' : bad >= SETTINGS.watchZ ? 'watch' : 'normal';
  if (status === 'normal') return { status, z, reason: null, mean, sd, n };
  const side = z > 0 ? 'above' : 'below';
  return {
    status,
    z,
    mean,
    sd,
    n,
    reason: `${cfg.label} ${fmt(key, value)} is ${Math.abs(z).toFixed(1)} SD ${side} your ${n}-day average of ${fmt(key, mean)}, outside your usual range`,
  };
}

/**
 * Evaluate a whole series of daily readings for one astronaut, oldest first.
 * Days that were flagged are left out of later baselines, so a fever doesn't
 * become part of "normal".
 * @param {DayReading[]} days
 */
export function evaluateSeries(days) {
  return runSeries(days).results;
}

function runSeries(days) {
  const keys = Object.keys(INDICATORS);
  const clean = Object.fromEntries(keys.map((k) => [k, []])); // unflagged history
  const reference = {}; // mission-start reference for drift, from the first window
  const ewma = {};
  const driftRun = Object.fromEntries(keys.map((k) => [k, 0]));
  const results = [];

  days.forEach((reading, i) => {
    const indicators = {};
    let overall = 'normal';
    for (const key of keys) {
      const value = reading[key];
      if (value === undefined || value === null) continue;
      const cfg = INDICATORS[key];
      const history = clean[key].slice(-SETTINGS.windowDays);
      const range = rangeCheck(key, value);
      const base = baselineCheck(key, value, history);
      const rangeLevel = range.status ?? 'normal';

      // Slow drift: EWMA compared with the mission-start reference.
      let drift = { status: 'normal', reason: null };
      if (i === SETTINGS.windowDays && !reference[key]) reference[key] = meanSd(clean[key], cfg.minSd);
      // Alert-level readings (a fever, a terrible night) are left out of the slow average,
      // so one bad event doesn't look like a drift for days afterwards.
      const isOutlier = rangeLevel === 'alert' || base.status === 'alert';
      if (ewma[key] === undefined) ewma[key] = value;
      else if (!isOutlier) ewma[key] = SETTINGS.ewmaAlpha * value + (1 - SETTINGS.ewmaAlpha) * ewma[key];
      if (reference[key]) {
        const dz = (ewma[key] - reference[key].mean) / reference[key].sd;
        const badDz = cfg.direction === 'high' ? dz : cfg.direction === 'low' ? -dz : Math.abs(dz);
        driftRun[key] = badDz >= SETTINGS.driftZ ? driftRun[key] + 1 : 0;
        if (driftRun[key] >= SETTINGS.driftDays) {
          drift = {
            status: 'watch',
            reason: `${cfg.label} has drifted ${dz > 0 ? 'up' : 'down'} from your mission-start average of ${fmt(key, reference[key].mean)} for ${driftRun[key]} days`,
          };
        }
      }

      const status = worse(worse(rangeLevel, base.status), drift.status);
      indicators[key] = {
        value,
        status,
        rangeStatus: range.status,
        baselineStatus: base.status,
        driftStatus: drift.status,
        z: base.z === null ? null : Number(base.z.toFixed(2)),
        reasons: [range.reason, base.reason, drift.reason].filter(Boolean),
        crisis: range.crisis,
        action: range.action,
        usual: base.mean === null ? null : { mean: base.mean, sd: base.sd, days: base.n },
      };
      overall = worse(overall, status);
      // Only clear outliers (alert) are kept out of the baseline. Dropping every watch
      // day too would shrink the spread and cause more false alarms.
      if (!isOutlier) clean[key].push(value);
    }
    const result = { day: reading.day, missionDay: reading.missionDay, date: reading.date, overall, indicators };
    result.attention = needsAttention(result);
    results.push(result);
  });
  return { results, clean };
}

/**
 * The personal baseline the next reading would be judged against: mean and spread of the last
 * 14 clean days per indicator (alert days left out). null where there is not enough history yet.
 * @returns {{ [key: string]: { mean: number, sd: number, days: number } | null }}
 */
export function baselineAfter(days) {
  const { clean } = runSeries(days);
  return Object.fromEntries(
    Object.entries(clean).map(([key, values]) => {
      const window = values.slice(-SETTINGS.windowDays);
      if (window.length < SETTINGS.minHistory) return [key, null];
      return [key, { ...meanSd(window, INDICATORS[key].minSd), days: window.length }];
    }),
  );
}

/**
 * Should this day be raised with the astronaut? One indicator slightly off is common
 * noise, so a day needs attention when any indicator is at alert, when two or more are
 * at watch, or when an indicator shows slow drift.
 */
export function needsAttention(dayResult) {
  const list = Object.values(dayResult.indicators);
  if (list.some((x) => x.status === 'alert')) return true;
  if (list.filter((x) => x.status === 'watch').length >= SETTINGS.minWatchCount) return true;
  return list.some((x) => x.driftStatus !== 'normal');
}

/** Latest day's result, the shape the dashboard needs. */
export function evaluateLatest(days) {
  const all = evaluateSeries(days);
  return all.at(-1);
}
