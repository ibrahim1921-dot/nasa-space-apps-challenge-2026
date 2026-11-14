// Tests for the baseline health engine. Run with: npm test
// The planted events below are in src/data/crew.json (synthetic data).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LIMITS } from '../content/limits.js';
import { INDICATORS, baselineAfter, baselineCheck, evaluateSeries, needsAttention, rangeCheck } from './baseline.js';

const here = dirname(fileURLToPath(import.meta.url));
const crew = JSON.parse(readFileSync(join(here, '../data/crew.json'), 'utf8')).crew;
const byId = Object.fromEntries(crew.map((c) => [c.id, evaluateSeries(c.days)]));
const day = (id, n) => byId[id].find((d) => d.day === n);

test('range check: fever is an alert, normal temperature is not', () => {
  assert.equal(rangeCheck('temperature', 38.2).status, 'alert');
  assert.equal(rangeCheck('temperature', 37.6).status, 'watch');
  assert.equal(rangeCheck('temperature', 36.8).status, 'normal');
  assert.equal(rangeCheck('glucose', 65).status, 'watch');
});

test('range check uses content/limits.js and says which line was crossed', () => {
  assert.equal(rangeCheck('systolic', 132).reason, 'Systolic blood pressure 132 mmHg is at or above the AHA watch line (130 mmHg)');
  assert.equal(rangeCheck('temperature', 38.2).reason, 'Body temperature 38.2 °C is at or above the CDC fever line (38.0 °C)');
  assert.equal(rangeCheck('heartRate', 45).reason, 'Resting heart rate 45 bpm is below the team-set low watch line (50 bpm)');
  assert.equal(rangeCheck('sleepHours', 6.0).status, 'watch', 'AASM line is "6.0 h or less"');
  assert.equal(rangeCheck('diastolic', 80).status, 'watch', 'AHA diastolic watch line is 80');
});

test('hypertensive crisis comes through with the CMO action', () => {
  const r = rangeCheck('systolic', 185);
  assert.equal(r.status, 'alert');
  assert.equal(r.crisis, true);
  assert.equal(r.action, 'Tell the Crew Medical Officer now');
  assert.match(r.reason, /above the AHA hypertensive crisis line \(180 mmHg\)/);
});

test('mood 1 is a team-set watch, even with no other signal', () => {
  assert.equal(rangeCheck('mood', 1).status, 'watch');
  assert.equal(rangeCheck('mood', 2).status, 'normal');
  assert.match(rangeCheck('mood', 1).reason, /team-set very low line/);
});

test('reaction time has no range limits: baseline only', () => {
  assert.equal(rangeCheck('reactionMs', 900).status, null);
});

test('baseline.js holds no limit numbers: every range-checked indicator is in limits.js', () => {
  const ids = new Set(LIMITS.map((l) => l.indicator));
  for (const cfg of Object.values(INDICATORS)) if (cfg.limitKey) assert.ok(ids.has(cfg.limitKey), cfg.limitKey);
  const src = readFileSync(join(here, 'baseline.js'), 'utf8');
  assert.doesNotMatch(src, /watchHigh|alertHigh|watchLow|alertLow/);
});

test('baseline check needs 7 days of history before judging', () => {
  assert.equal(baselineCheck('heartRate', 120, [60, 61, 62]).status, 'normal');
  assert.equal(baselineCheck('heartRate', 120, [60, 61, 62, 60, 61, 62, 60]).status, 'alert');
});

test('baseline check: watch from |z| 2, alert from 3.5', () => {
  const history = [100, 104, 100, 104, 100, 104, 100, 104]; // mean 102, sd ≈ 2.14 → minSd 3 applies
  assert.equal(baselineCheck('systolic', 102 + 1.9 * 3, history).status, 'normal');
  assert.equal(baselineCheck('systolic', 102 + 2.0 * 3, history).status, 'watch');
  assert.equal(baselineCheck('systolic', 102 + 3.4 * 3, history).status, 'watch');
  assert.equal(baselineCheck('systolic', 102 + 3.5 * 3, history).status, 'alert');
});

test('baseline check only flags the bad direction', () => {
  const history = [7, 7.2, 6.9, 7.1, 7, 6.8, 7.2, 7.1];
  assert.equal(baselineCheck('sleepHours', 9.5, history).status, 'normal'); // long sleep is fine
  assert.notEqual(baselineCheck('sleepHours', 5.5, history).status, 'normal');
  const bp = [110, 112, 111, 109, 110, 112, 111, 110];
  assert.equal(baselineCheck('systolic', 95, bp).status, 'normal', 'low BP vs your usual is not the bad direction');
});

test('every flag comes with a plain-English reason', () => {
  const r = baselineCheck('sleepHours', 5.1, [6.4, 6.5, 6.3, 6.4, 6.6, 6.2, 6.4]);
  assert.match(r.reason, /Sleep 5\.1 h is \d\.\d SD below your 7-day average of 6\.4 h/);
  assert.match(r.reason, /outside your usual range/);
});

test('planted fever (crew-01, days 22-24) is flagged as alert on temperature', () => {
  for (const n of [22, 23, 24]) {
    assert.equal(day('crew-01', n).attention, true, `day ${n}`);
    assert.notEqual(day('crew-01', n).indicators.temperature.status, 'normal', `day ${n}`);
  }
});

test('planted stress week (crew-02, days 35-41) is flagged every day', () => {
  for (let n = 35; n <= 41; n += 1) assert.equal(day('crew-02', n).attention, true, `day ${n}`);
});

test('planted mild fatigue (crew-03, days 48-50) is flagged at least once', () => {
  assert.ok([48, 49, 50].some((n) => day('crew-03', n).attention));
});

test('the fever does not become part of the baseline afterwards', () => {
  // Day 30 is well after the fever: a normal temperature must still read as normal.
  assert.equal(day('crew-01', 30).indicators.temperature.status, 'normal');
});

test('alert readings are kept out of the baseline', () => {
  const steady = Array.from({ length: 14 }, (_, i) => ({ day: i + 1, temperature: 36.7 }));
  const withFever = [...steady, { day: 15, temperature: 39.0 }];
  assert.ok(Math.abs(baselineAfter(withFever).temperature.mean - 36.7) < 1e-9, 'fever left out of the mean');
  assert.equal(baselineAfter(withFever).temperature.days, 14);
  assert.equal(evaluateSeries(withFever).at(-1).indicators.temperature.status, 'alert');
});

test('slow drift raises watch after 5 days and needs attention', () => {
  const days = Array.from({ length: 14 }, (_, i) => ({ day: i + 1, heartRate: i % 2 ? 61 : 59 }));
  // Creep up 2 bpm a day: each step is small against the moving 14-day baseline.
  for (let i = 0; i < 10; i += 1) days.push({ day: 15 + i, heartRate: 62 + i * 1.5 });
  const results = evaluateSeries(days);
  const drifted = results.filter((r) => r.indicators.heartRate.driftStatus === 'watch');
  assert.ok(drifted.length > 0, 'drift fires');
  assert.match(drifted[0].indicators.heartRate.reasons.at(-1), /has drifted up from your mission-start average of 60 bpm for 5 days/);
  assert.equal(drifted[0].attention, true);
});

test('needsAttention: one watch is noise, two watches or any alert is not', () => {
  const ind = (status) => ({ status, driftStatus: 'normal' });
  assert.equal(needsAttention({ indicators: { a: ind('watch'), b: ind('normal') } }), false);
  assert.equal(needsAttention({ indicators: { a: ind('watch'), b: ind('watch') } }), true);
  assert.equal(needsAttention({ indicators: { a: ind('alert') } }), true);
});
