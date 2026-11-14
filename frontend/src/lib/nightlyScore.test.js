// Parity test: re-score every stored night with the JS port and compare with nights_scored.json.
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv } from './csv.js';
import { FEATURE_KEYS, checkScores, isClean, median, scoreNight, validateNight } from './nightlyScore.js';

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);
const scored = JSON.parse(readFileSync(dataUrl('nights_scored.json'), 'utf8'));
const rows = parseCsv(readFileSync(dataUrl('bidsleep_nights.csv'), 'utf8'), {
  numeric: [...FEATURE_KEYS, 'hr_per_sleep_hour', 'unknown_pct', 'night_index'],
});
const model = { pooled_spread: scored.pooled_spread, thresholds: scored.thresholds };
const key = (subject, index) => `${subject}#${index}`;
const expected = new Map(scored.nights.map((n) => [key(n.subject_id, n.night_index), n]));

function others(row) {
  return rows.filter((r) => r.subject_id === row.subject_id && r !== row);
}

test('every stored night re-scores to the same scores and status', () => {
  assert.equal(rows.length, scored.nights.length, 'CSV and JSON should have the same number of nights');

  const mismatches = [];
  for (const row of rows) {
    const want = expected.get(key(row.subject_id, row.night_index));
    assert.ok(want, `no stored score for ${row.subject_id} night ${row.night_index}`);
    const got = scoreNight(row, others(row), model);
    // Compare the unrounded JS score with the stored (2-dp) score, so rounding both sides
    // cannot turn a 0.005 gap into a 0.01 one.
    const raw = got.z ? checkScores(got.z) : { hr: null, sleep: null };

    const scoreOff = (a, b) => (a === null || b === null ? a !== b : Math.abs(a - b) > 0.01);
    const problems = [];
    if (scoreOff(raw.hr, want.heart_rate_score)) {
      problems.push(`heart_rate_score ${raw.hr?.toFixed(4)} vs ${want.heart_rate_score}`);
    }
    if (scoreOff(raw.sleep, want.sleep_score)) problems.push(`sleep_score ${raw.sleep?.toFixed(4)} vs ${want.sleep_score}`);
    if (got.status !== want.status) problems.push(`status "${got.status}" vs "${want.status}"`);
    if (got.quality_issue !== want.quality_issue) {
      problems.push(`quality_issue "${got.quality_issue}" vs "${want.quality_issue}"`);
    }
    if (problems.length) mismatches.push(`${row.subject_id} night ${row.night_index}: ${problems.join(', ')}`);
  }

  console.log(`parity: ${rows.length} nights checked, ${mismatches.length} mismatches`);
  for (const m of mismatches) console.log(`  MISMATCH ${m}`);
  assert.equal(mismatches.length, 0);
});

test('reason text matches the stored reasons', () => {
  const diffs = [];
  for (const row of rows) {
    const want = expected.get(key(row.subject_id, row.night_index));
    const got = scoreNight(row, others(row), model);
    if (got.reason !== want.reason) diffs.push(`${row.subject_id} night ${row.night_index}:\n    got  ${got.reason}\n    want ${want.reason}`);
  }
  console.log(`reasons: ${diffs.length} differences`);
  for (const d of diffs) console.log(`  ${d}`);
  assert.equal(diffs.length, 0);
});

// Reports every Bidslab50 night with sleep_hr_median raised by 12 bpm. Whether that reaches
// watch depends on where the night started: the HR watch threshold (2.92) x pooled spread
// (4.448 bpm) is 12.99 bpm above the person's usual, so +12 from a usual night is just under.
test('Bidslab50: sleep_hr_median raised by 12 bpm', () => {
  const subjectRows = rows.filter((r) => r.subject_id === 'Bidslab50');
  assert.ok(subjectRows.length >= 3, 'Bidslab50 needs at least 3 nights');
  const statuses = [];
  for (const night of subjectRows) {
    const before = scoreNight(night, others(night), model);
    const raised = { ...night, sleep_hr_median: night.sleep_hr_median + 12 };
    const got = scoreNight(raised, others(night), model);
    statuses.push(got.status);
    console.log(
      `Bidslab50 night ${night.night_index}: ${night.sleep_hr_median} -> ${raised.sleep_hr_median} bpm | ` +
        `before ${before.status} (HR ${before.heart_rate_score}) | after ${got.status} (HR ${got.heart_rate_score}, ` +
        `sleep ${got.sleep_score})${got.reason ? ` | ${got.reason}` : ''}`,
    );
    // The z for sleep_hr_median always rises by exactly 12 / pooled spread.
    assert.ok(Math.abs(got.z.sleep_hr_median - before.z.sleep_hr_median - 12 / model.pooled_spread.sleep_hr_median) < 1e-9);
  }

  // A night at the person's usual values, with only sleep_hr_median raised (what the live form sends).
  const usual = Object.fromEntries(
    FEATURE_KEYS.map((k) => [k, median(subjectRows.filter(isClean).map((r) => r[k]))]),
  );
  for (const bump of [12, 13]) {
    const got = scoreNight({ ...usual, sleep_hr_median: usual.sleep_hr_median + bump }, subjectRows, model);
    console.log(`Bidslab50 usual night + ${bump} bpm: ${got.status} (HR ${got.heart_rate_score})`);
    if (bump === 13) assert.ok(['watch', 'alert'].includes(got.status));
  }
  assert.ok(statuses.some((s) => s === 'watch' || s === 'alert'));
});

test('validation rejects missing and out-of-range features', () => {
  const ok = { sleep_hr_median: 60, sleep_hr_p5: 54, total_sleep_h: 7.2, wake_pct: 6, n3_pct_of_sleep: 20, rem_pct_of_sleep: 22 };
  assert.equal(validateNight(ok), null);
  assert.match(validateNight({ ...ok, wake_pct: undefined }), /wake_pct is missing/);
  assert.match(validateNight({ ...ok, sleep_hr_median: '60' }), /must be a number/);
  assert.match(validateNight({ ...ok, total_sleep_h: 30 }), /expected 0–16 h/);
  assert.match(validateNight({ ...ok, sleep_hr_p5: 70 }), /cannot be higher/);
  assert.match(validateNight(null), /must be an object/);
});
