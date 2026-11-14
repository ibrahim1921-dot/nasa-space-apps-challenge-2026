// Fixed-range checks: is a single reading inside the published (or team-set) limits?
// Pure functions only, so the same code runs in API routes, the browser and node:test.
// Every number comes from content/limits.js. Personal-baseline (z-score) scoring lives
// elsewhere (lib/nightlyScore.js today) and may call rangeStatus() alongside its own result.

import { LIMITS, limitsFor } from '../content/limits.js';

const SEVERITY = { normal: 0, watch: 1, alert: 2 };
const worse = (a, b) => (SEVERITY[a] >= SEVERITY[b] ? a : b);

const COMPARE = {
  '>=': (v, t) => v >= t,
  '>': (v, t) => v > t,
  '<': (v, t) => v < t,
  '<=': (v, t) => v <= t,
};

/** Indicators whose limits can be checked with rangeStatus(). */
export const RANGE_INDICATORS = [
  ...new Set(LIMITS.filter((l) => (l.level === 'watch' || l.level === 'alert') && COMPARE[l.rule]).map((l) => l.indicator)),
];

/** True when `value` falls on the flagged side of `limit`. */
export function crosses(limit, value) {
  const test = COMPARE[limit.rule];
  return Boolean(test) && typeof value === 'number' && Number.isFinite(value) && test(value, limit.value);
}

/**
 * Check one reading against an indicator's watch/alert limits.
 * @param {string} indicator  an id from content/limits.js, e.g. 'temperature'
 * @param {number} value
 * @returns {{ indicator, value, status: 'normal'|'watch'|'alert'|null, matched: object[], crisis: boolean,
 *             action: string|null }}  status is null when value is not a finite number.
 */
export function rangeStatus(indicator, value) {
  const limits = limitsFor(indicator).filter((l) => (l.level === 'watch' || l.level === 'alert') && COMPARE[l.rule]);
  if (limits.length === 0) throw new Error(`No range limits for "${indicator}" in content/limits.js`);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { indicator, value, status: null, matched: [], crisis: false, action: null };
  }
  const matched = limits.filter((l) => crosses(l, value));
  const status = matched.reduce((s, l) => worse(s, l.level), 'normal');
  const crisis = matched.some((l) => l.crisis);
  const action = matched.find((l) => l.action)?.action ?? null;
  return { indicator, value, status, matched, crisis, action };
}

/** Both BP numbers together: the worse of the two, and crisis if either crosses its crisis line. */
export function bloodPressureStatus(systolic, diastolic) {
  const s = rangeStatus('systolic_bp', systolic);
  const d = rangeStatus('diastolic_bp', diastolic);
  const status = s.status === null || d.status === null ? null : worse(s.status, d.status);
  return {
    indicator: 'blood_pressure',
    value: { systolic, diastolic },
    status,
    matched: [...s.matched, ...d.matched],
    crisis: s.crisis || d.crisis,
    action: s.action ?? d.action,
  };
}

/** "118/76" → { systolic: 118, diastolic: 76 }, or null. */
export function parseBloodPressure(text) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/.exec(String(text ?? ''));
  return m ? { systolic: Number(m[1]), diastolic: Number(m[2]) } : null;
}

// ---------- Indicators shown on the dashboard ----------

/** Which limits.js indicators each dashboard indicator's info panel lists. */
export const LIMIT_GROUPS = {
  blood_pressure: ['systolic_bp', 'diastolic_bp'],
  temperature: ['temperature'],
  resting_hr: ['resting_hr'],
  fasting_glucose: ['fasting_glucose'],
  sleep_hours: ['sleep_hours'],
  mood: ['mood'],
  stand_test: ['stand_systolic_drop', 'stand_diastolic_drop', 'stand_hr_rise', 'stand_test'],
  reaction_test: ['reaction_test'],
};

/**
 * Give a dashboard indicator its status from the limits, when it has a `limitKey` that rangeStatus
 * can check. Indicators without one (or info-only ones like the reaction test) are returned as-is.
 */
export function applyRangeStatus(indicator) {
  const key = indicator.limitKey;
  let result = null;
  if (key === 'blood_pressure') {
    const bp = parseBloodPressure(indicator.value);
    if (bp) result = bloodPressureStatus(bp.systolic, bp.diastolic);
  } else if (key && RANGE_INDICATORS.includes(key)) {
    result = rangeStatus(key, Number(indicator.value));
  }
  if (!result || result.status === null) return indicator;
  return { ...indicator, status: result.status, crisis: result.crisis, action: result.action };
}

// ---------- Display text ----------

const DECIMALS = { '°C': 1, h: 1 };
const WORDS = { '>=': 'from', '>': 'above', '<': 'below', '<=': 'at or below', '=': '' };
const SYMBOLS = { '>=': '≥ ', '>': '> ', '<': '< ', '<=': '≤ ', '=': '' };
const LEVEL_WORD = { watch: 'Watch', alert: 'Alert', guidance: 'Target', definition: '' };

const CROSS_WORDS = { '>=': 'at or above', '>': 'above', '<': 'below', '<=': 'at or below' };
const LINE_SEVERITY = { watch: 1, alert: 2 };

/** The most serious limit in a rangeStatus() `matched` list: crisis first, then alert, then watch. */
export function worstLimit(matched) {
  const score = (l) => (l.crisis ? 10 : 0) + (LINE_SEVERITY[l.level] ?? 0);
  return matched.reduce((best, l) => (best === null || score(l) >= score(best) ? l : best), null);
}

/**
 * Which line a value crossed, in plain words, e.g. "at or above the AHA watch line (130 mmHg)",
 * "above the AHA hypertensive crisis line (180 mmHg)", "below the team-set low watch line (90 mmHg)".
 */
export function crossingPhrase(limit) {
  const named = limit.label && limit.label !== 'Low' ? limit.label.toLowerCase() : null;
  const line = named ? `${named} line` : `${limit.label === 'Low' ? 'low ' : ''}${limit.level} line`;
  const who = limit.source_short ?? limit.source_name;
  return `${CROSS_WORDS[limit.rule] ?? ''} the ${who} ${line} (${formatLimitValue(limit)})`;
}

export function formatLimitValue(limit) {
  if (typeof limit.value !== 'number') return '';
  const d = DECIMALS[limit.unit] ?? 0;
  return `${limit.value.toFixed(d)} ${limit.unit}`;
}

/** One limit as a short line, e.g. "Watch from <value> <unit>", "Alert below <value> <unit> (hypothermia)". */
export function describeLimit(limit) {
  if (limit.rule === 'symptom') {
    return `${LEVEL_WORD[limit.level]} if ${limit.value === 'any' ? 'any other symptom is reported' : `"${limit.label.toLowerCase()}" is reported`}`;
  }
  if (limit.rule === 'stopped') return `${LEVEL_WORD[limit.level]} if the test is stopped early`;
  const v = formatLimitValue(limit);
  if (limit.level === 'guidance') return `${limit.label ?? 'Target'}: ${v} or more`;
  if (limit.level === 'definition') return `${limit.label} ${SYMBOLS[limit.rule]}${v}`;
  const tag = limit.label && limit.label !== 'Low' ? ` (${limit.label.toLowerCase()})` : '';
  return `${LEVEL_WORD[limit.level]} ${WORDS[limit.rule]} ${v}${tag}`;
}
