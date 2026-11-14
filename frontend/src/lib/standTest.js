// Stand test (orthostatic check). Pure functions only (no file or network access), so the same
// code runs in the API routes, the browser and node:test.
//
// A test is { supine, standing_1min, standing_3min, symptoms[], partial?, timing_skipped? },
// where each reading is { heart_rate, systolic, diastolic }. Standing readings may be null on a
// partial (stopped) test, and so may supine.

import { STAND_TEST } from '../content/limits.js';

export const STAND_TEST_ENGINE_VERSION = 'stand-test-1.1.0';

export const SOURCE_SYNTHETIC = 'Synthetic';
export const SOURCE_ENTERED = 'Entered on this device';

// Cut-offs come from content/limits.js: alert levels from Freeman et al. 2011 (consensus definition
// of orthostatic hypotension), watch levels team-set. Drops are supine minus standing (positive =
// BP fell); the rise is standing minus supine HR. A value at or above a cut-off counts.
export const CRITERIA = { alert: { ...STAND_TEST.alert }, watch: { ...STAND_TEST.watch } };

/** Standing readings must be taken within this many minutes of standing up. */
export const STANDING_WINDOW_MINUTES = STAND_TEST.windowMinutes;

// Personal rule: flag watch when this test's response is worse than the person's own preflight
// average by at least the general watch amount for that measure (the team-set watch levels).
// Needs at least one preflight test with standing readings.
export const PERSONAL_MARGIN = { ...CRITERIA.watch };

export const READING_RANGES = {
  heart_rate: { min: 25, max: 220, unit: 'bpm', label: 'heart rate' },
  systolic: { min: 60, max: 250, unit: 'mmHg', label: 'systolic BP' },
  diastolic: { min: 30, max: 150, unit: 'mmHg', label: 'diastolic BP' },
};
export const READING_KEYS = Object.keys(READING_RANGES);

export const READING_SLOTS = ['supine', 'standing_1min', 'standing_3min'];

export const SYMPTOMS = [
  { id: 'dizzy', label: 'Dizzy or light-headed' },
  { id: 'blurred_vision', label: 'Blurred or dimmed vision' },
  { id: 'nausea', label: 'Nausea' },
  { id: 'felt_faint', label: 'Felt faint' },
];
export const SYMPTOM_IDS = SYMPTOMS.map((s) => s.id);
const SYMPTOM_WORDS = Object.fromEntries(SYMPTOMS.map((s) => [s.id, s.label.toLowerCase()]));

const SEVERITY = { normal: 0, watch: 1, alert: 2 };
const worse = (a, b) => (SEVERITY[a] >= SEVERITY[b] ? a : b);

// ---------- Validation ----------

/**
 * Check one { heart_rate, systolic, diastolic } reading.
 * @returns {string|null} a user-facing error message, or null when valid.
 */
export function validateReading(reading, label) {
  if (!reading || typeof reading !== 'object' || Array.isArray(reading)) {
    return `${label} must be an object with heart_rate, systolic and diastolic.`;
  }
  for (const key of READING_KEYS) {
    const { min, max, unit, label: name } = READING_RANGES[key];
    const raw = reading[key];
    if (raw === undefined || raw === null || raw === '') return `${label}.${key} (${name}) is missing.`;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return `${label}.${key} (${name}) must be a number.`;
    if (raw < min || raw > max) return `${label}.${key} (${name}) is ${raw}; expected ${min}–${max} ${unit}.`;
  }
  if (reading.diastolic >= reading.systolic) {
    return `${label}: diastolic BP (${reading.diastolic}) must be lower than systolic BP (${reading.systolic}).`;
  }
  return null;
}

/**
 * Check a whole test. Supine and at least one standing reading are required unless `partial` is true.
 * @returns {string|null}
 */
export function validateStandTest(test, label = 'test') {
  if (!test || typeof test !== 'object' || Array.isArray(test)) return `${label} must be an object.`;
  for (const flag of ['partial', 'timing_skipped']) {
    if (test[flag] !== undefined && typeof test[flag] !== 'boolean') return `${label}.${flag} must be true or false.`;
  }
  const partial = test.partial === true;

  for (const slot of READING_SLOTS) {
    const reading = test[slot];
    if (reading === undefined || reading === null) continue;
    const error = validateReading(reading, `${label}.${slot}`);
    if (error) return error;
  }
  if (!partial) {
    if (!test.supine) return `${label}.supine is missing (heart rate and BP after 5 min lying down).`;
    if (!test.standing_1min && !test.standing_3min) {
      return `${label} needs a standing reading at 1 min or 3 min (or set partial: true for a stopped test).`;
    }
  }

  const symptoms = test.symptoms ?? [];
  if (!Array.isArray(symptoms)) return `${label}.symptoms must be an array.`;
  for (const s of symptoms) {
    if (!SYMPTOM_IDS.includes(s)) return `${label}.symptoms has unknown value "${s}"; use ${SYMPTOM_IDS.join(', ')}.`;
  }
  if (new Set(symptoms).size !== symptoms.length) return `${label}.symptoms lists the same symptom twice.`;
  return null;
}

/** Keep only the fields the engine reads, so an echo or a stored copy carries no extra input. */
export function cleanStandTest(test) {
  const out = {};
  for (const slot of READING_SLOTS) {
    const r = test[slot];
    out[slot] = r ? Object.fromEntries(READING_KEYS.map((k) => [k, r[k]])) : null;
  }
  out.symptoms = [...(test.symptoms ?? [])];
  out.partial = test.partial === true;
  out.timing_skipped = test.timing_skipped === true;
  return out;
}

// ---------- Evaluation ----------

/**
 * Standing minus supine, using the worst standing reading for each measure separately:
 * the lowest systolic, the lowest diastolic and the highest heart rate of the 1 and 3 min readings.
 * @returns {{ systolic, diastolic, heart_rate, worst_at: { systolic, diastolic, heart_rate } } | null}
 *          null when there is no supine reading or no standing reading.
 */
export function computeChanges(test) {
  const { supine } = test;
  const standing = [
    ['1min', test.standing_1min],
    ['3min', test.standing_3min],
  ].filter(([, r]) => r);
  if (!supine || standing.length === 0) return null;

  const pick = (key, better) =>
    standing.reduce((best, cur) => (better(cur[1][key], best[1][key]) ? cur : best));
  const sys = pick('systolic', (a, b) => a < b);
  const dia = pick('diastolic', (a, b) => a < b);
  const hr = pick('heart_rate', (a, b) => a > b);
  return {
    systolic: sys[1].systolic - supine.systolic,
    diastolic: dia[1].diastolic - supine.diastolic,
    heart_rate: hr[1].heart_rate - supine.heart_rate,
    worst_at: { systolic: sys[0], diastolic: dia[0], heart_rate: hr[0] },
  };
}

/** The three responses as positive-is-worse numbers. */
const responses = (c) => ({ systolicDrop: -c.systolic, diastolicDrop: -c.diastolic, hrRise: c.heart_rate });

const MEASURES = [
  { key: 'systolicDrop', change: 'systolic', name: 'Systolic BP', lower: 'systolic BP', unit: 'mmHg', kind: 'bp' },
  { key: 'diastolicDrop', change: 'diastolic', name: 'Diastolic BP', lower: 'diastolic BP', unit: 'mmHg', kind: 'bp' },
  { key: 'hrRise', change: 'heart_rate', name: 'Heart rate', lower: 'heart rate', unit: 'bpm', kind: 'hr' },
];

/** "fell 24 mmHg" / "rose 3 mmHg" / "did not change" for a standing-minus-supine change. */
function moved(change, unit) {
  const n = Math.round(Math.abs(change) * 10) / 10;
  if (n === 0) return 'did not change';
  return `${change < 0 ? 'fell' : 'rose'} ${n} ${unit}`;
}

/**
 * Evaluate one stand test against the same person's preflight tests.
 * @param {object} test
 * @param {object[]} preflightTests  the person's preflight tests (the test itself is skipped if included)
 * @returns {{ status: 'normal'|'watch'|'alert', reasons: string[], changes: object|null,
 *             preflight: { count, average: object|null, tests: {id, timepoint, changes}[] } }}
 */
export function evaluateStandTest(test, preflightTests = []) {
  const changes = computeChanges(test);
  const preflight = (preflightTests ?? [])
    .filter((p) => p && p !== test && (test.id === undefined || p.id !== test.id))
    .map((p) => ({ id: p.id ?? null, timepoint: p.timepoint ?? null, changes: computeChanges(p) }))
    .filter((p) => p.changes);
  const average = preflight.length
    ? Object.fromEntries(
        ['systolic', 'diastolic', 'heart_rate'].map((k) => [
          k,
          Math.round((preflight.reduce((sum, p) => sum + p.changes[k], 0) / preflight.length) * 10) / 10,
        ]),
      )
    : null;

  let status = 'normal';
  let flagged = 0; // measures over a general or personal limit
  const reasons = [];

  if (test.partial) reasons.push('Test stopped early, which counts as alert; only the readings taken before stopping were used.');
  if (test.timing_skipped) {
    reasons.push('Timing skipped (demo mode): the rest and standing waits were not completed, so the readings may not reflect a full stand test.');
  }

  if (changes) {
    const now = responses(changes);
    const base = average ? responses(average) : null;
    for (const m of MEASURES) {
      let general = 'normal';
      if (now[m.key] >= CRITERIA.alert[m.key]) general = 'alert';
      else if (now[m.key] >= CRITERIA.watch[m.key]) general = 'watch';
      const personal = base !== null && now[m.key] - base[m.key] >= PERSONAL_MARGIN[m.key] ? 'watch' : 'normal';
      const level = worse(general, personal);
      if (level === 'normal') continue;
      flagged += 1;
      status = worse(status, level);

      const before = average
        ? `before flight it ${moved(average[m.change], m.unit)} (average of ${preflight.length} preflight test${preflight.length === 1 ? '' : 's'})`
        : 'there is no preflight test to compare with';
      const limit =
        general !== 'normal'
          ? ` That reaches the general ${general} level (${m.kind === 'hr' ? 'rise' : 'fall'} of ${CRITERIA[general][m.key]} ${m.unit} or more).`
          : ` That is at least ${PERSONAL_MARGIN[m.key]} ${m.unit} more than this person's own preflight response.`;
      reasons.push(`${m.name} ${moved(changes[m.change], m.unit)} on standing; ${before}.${limit}`);
    }
  } else {
    reasons.push(
      test.supine
        ? 'No standing reading was taken, so the BP and heart rate change on standing could not be checked.'
        : 'No lying-down reading was taken, so the BP and heart rate change on standing could not be checked.',
    );
  }

  // A stopped test, or an alert symptom such as "felt faint", is alert; any other symptom is at least watch.
  if (test.partial) status = worse(status, STAND_TEST.stoppedLevel);
  const symptoms = test.symptoms ?? [];
  if (symptoms.length) {
    const alertSymptom = symptoms.some((s) => STAND_TEST.alertSymptoms.includes(s));
    status = worse(status, alertSymptom ? 'alert' : STAND_TEST.otherSymptomLevel);
    reasons.push(`Symptoms reported: ${symptoms.map((s) => SYMPTOM_WORDS[s] ?? s).join(', ')}.`);
  }

  if (changes && flagged === 0) {
    const parts = MEASURES.map((m) => `${m.lower} ${moved(changes[m.change], m.unit)}`);
    reasons.push(
      `On standing, ${parts.join(', ')}: all within the general limits${average ? ' and close to this person\'s preflight response' : ''}.`,
    );
  }

  return {
    status,
    reasons,
    changes,
    preflight: {
      count: preflight.length,
      average,
      tests: preflight.map((p) => ({ id: p.id, timepoint: p.timepoint, changes: stripWorst(p.changes) })),
    },
  };
}

function stripWorst(c) {
  const { worst_at, ...rest } = c;
  return rest;
}
