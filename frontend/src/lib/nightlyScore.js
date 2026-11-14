// Port of the notebook's nightly scoring. Pure functions only (no file or network access),
// so the same code runs in the API routes, the browser and the node:test parity test.
//
// Method: compare a night with the median of the same person's *other* clean nights,
// divide by the night-to-night spread pooled across people, and flip "low is bad" features
// so a positive z always means "worse than usual".

export const SOURCE_PHYSIONET = 'General human data (PhysioNet)';
export const SOURCE_NASA = 'NASA Inspiration4';

/** The 6 features, in display order. `bad` is the direction that counts as worse. */
export const FEATURES = [
  { key: 'sleep_hr_median', check: 'heart_rate', bad: 'high', label: 'Sleeping heart rate', unit: 'bpm' },
  { key: 'sleep_hr_p5', check: 'heart_rate', bad: 'high', label: 'Lowest sleeping heart rate (5th pct)', unit: 'bpm' },
  { key: 'total_sleep_h', check: 'sleep', bad: 'low', label: 'Total sleep', unit: 'h' },
  { key: 'wake_pct', check: 'sleep', bad: 'high', label: 'Time awake', unit: '%' },
  { key: 'n3_pct_of_sleep', check: 'sleep', bad: 'low', label: 'Deep sleep (N3)', unit: '%' },
  { key: 'rem_pct_of_sleep', check: 'sleep', bad: 'low', label: 'REM sleep', unit: '%' },
];
export const FEATURE_KEYS = FEATURES.map((f) => f.key);

/** Plausible limits for a logged night. Values outside these are rejected, not scored. */
export const SANE_RANGES = {
  sleep_hr_median: [25, 200],
  sleep_hr_p5: [25, 200],
  total_sleep_h: [0, 16],
  wake_pct: [0, 100],
  n3_pct_of_sleep: [0, 100],
  rem_pct_of_sleep: [0, 100],
};

export const MIN_HISTORY = 2;
export const REASON_MIN_Z = 1.5;
export const REASON_MAX_ITEMS = 2;

export const STATUS_QUALITY = 'data quality issue';
export const STATUS_NO_HISTORY = 'not enough history';

const SEVERITY = { normal: 0, watch: 1, alert: 2 };

/**
 * Data-quality check for a recorded night. Rows without the quality columns
 * (nights logged in the app) are treated as clean.
 * @returns {string} '' when clean, otherwise a short label for the issue.
 */
export function qualityIssue(row) {
  const rate = num(row.hr_per_sleep_hour);
  const unknown = num(row.unknown_pct);
  if (rate !== null && rate < 500) return 'low HR coverage';
  if (rate !== null && rate > 1000) return 'about double the normal HR rate';
  if (unknown !== null && unknown > 15) return 'over 15% unknown sleep stage';
  return '';
}

export const isClean = (row) => qualityIssue(row) === '';

export function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Check one night's 6 features.
 * @returns {string|null} a user-facing error message, or null when valid.
 */
export function validateNight(night, label = 'night') {
  if (!night || typeof night !== 'object' || Array.isArray(night)) {
    return `${label} must be an object with ${FEATURE_KEYS.join(', ')}.`;
  }
  for (const f of FEATURES) {
    const raw = night[f.key];
    if (raw === undefined || raw === null || raw === '') return `${label}.${f.key} is missing.`;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return `${label}.${f.key} must be a number.`;
    const [lo, hi] = SANE_RANGES[f.key];
    if (raw < lo || raw > hi) {
      return `${label}.${f.key} is ${raw}; expected ${lo}–${hi}${f.unit === '%' ? ' %' : ` ${f.unit}`}.`;
    }
  }
  if (night.sleep_hr_p5 > night.sleep_hr_median) {
    return `${label}.sleep_hr_p5 (${night.sleep_hr_p5}) cannot be higher than sleep_hr_median (${night.sleep_hr_median}).`;
  }
  const stagePct = night.n3_pct_of_sleep + night.rem_pct_of_sleep;
  if (stagePct > 100) {
    return `${label}: n3_pct_of_sleep + rem_pct_of_sleep is ${stagePct}; together they cannot exceed 100 %.`;
  }
  return null;
}

/**
 * Score one night against a person's history.
 * @param {object} night       the 6 features (plus optional quality columns)
 * @param {object[]} history   the person's other nights; unclean ones are ignored here
 * @param {{ pooled_spread: object, thresholds: object }} model
 * @returns {{ status, heart_rate_score, sleep_score, reason, quality_issue, z }}
 */
export function scoreNight(night, history, { pooled_spread, thresholds }) {
  const issue = qualityIssue(night);
  const clean = history.filter(isClean);

  if (clean.length < MIN_HISTORY) {
    return {
      status: issue ? STATUS_QUALITY : STATUS_NO_HISTORY,
      heart_rate_score: null,
      sleep_score: null,
      reason: '',
      quality_issue: issue,
      z: null,
    };
  }

  const z = {};
  const centre = {};
  for (const f of FEATURES) {
    centre[f.key] = median(clean.map((h) => Number(h[f.key])));
    const raw = (Number(night[f.key]) - centre[f.key]) / pooled_spread[f.key];
    z[f.key] = f.bad === 'low' ? -raw : raw;
  }

  const { hr, sleep } = checkScores(z);

  if (issue) {
    return {
      status: STATUS_QUALITY,
      heart_rate_score: round2(hr),
      sleep_score: round2(sleep),
      reason: '',
      quality_issue: issue,
      z,
    };
  }

  const status = worse(level(hr, thresholds.heart_rate), level(sleep, thresholds.sleep));
  const reason = status === 'normal' ? '' : buildReason(night, centre, z);
  return { status, heart_rate_score: round2(hr), sleep_score: round2(sleep), reason, quality_issue: '', z };
}

/** Unrounded check scores from the per-feature z values. */
export function checkScores(z) {
  const max = (check) => Math.max(...FEATURES.filter((f) => f.check === check).map((f) => z[f.key]));
  return { hr: max('heart_rate'), sleep: max('sleep') };
}

function level(score, { watch, alert }) {
  if (score >= alert) return 'alert';
  if (score >= watch) return 'watch';
  return 'normal';
}

const worse = (a, b) => (SEVERITY[a] >= SEVERITY[b] ? a : b);

/** Top 2 features with z ≥ 1.5, in plain words. */
function buildReason(night, centre, z) {
  return FEATURES.filter((f) => z[f.key] >= REASON_MIN_Z)
    .sort((a, b) => z[b.key] - z[a.key])
    .slice(0, REASON_MAX_ITEMS)
    .map((f) => {
      const value = Number(night[f.key]);
      const diff = value - centre[f.key];
      const dir = diff >= 0 ? 'above' : 'below';
      const times = `${z[f.key].toFixed(1)}x a typical night-to-night change`;
      if (f.unit === 'bpm') {
        return `${f.label} ${fmt(value, 0)} bpm is ${fmt(Math.abs(diff), 0)} bpm ${dir} your usual (${times})`;
      }
      if (f.unit === 'h') {
        return `${f.label} ${fmt(value, 1)} h is ${fmt(Math.abs(diff), 1)} h ${dir} your usual (${times})`;
      }
      return `${f.label} ${fmt(value, 0)}% is ${fmt(Math.abs(diff), 0)} points ${dir} your usual (${times})`;
    })
    .join('; ');
}

/**
 * Format like Python's f"{n:.{digits}f}" (the notebook's formatter): exact binary ties
 * such as 8.5 or 0.25 round half to even, where JS toFixed would round them up.
 */
function fmt(n, digits) {
  const scale = 10 ** digits;
  const doubled = n * 2 * scale;
  if (Number.isInteger(doubled) && Math.abs(doubled) % 2 === 1) {
    const lo = Math.floor(n * scale);
    const even = lo % 2 === 0 ? lo : lo + 1;
    return (even / scale).toFixed(digits);
  }
  return n.toFixed(digits);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
