// Fixed-range checks against content/limits.js. Run with: npm test
// Boundary values below are test inputs on either side of each line, checked against limits.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CRISIS_ACTION, LIMITS, PVT_B, SOURCES, limitOf } from '../content/limits.js';
import { applyRangeStatus, bloodPressureStatus, describeLimit, parseBloodPressure, rangeStatus } from './rangeCheck.js';

const status = (indicator, value) => rangeStatus(indicator, value).status;
const bp = (s, d) => bloodPressureStatus(s, d);

test('every limit has the required fields and a source or a team-set mark', () => {
  for (const l of LIMITS) {
    for (const k of ['indicator', 'level', 'rule', 'source_name', 'team_set']) assert.ok(k in l, `${l.indicator} missing ${k}`);
    assert.ok('value' in l && 'unit' in l && 'source_url' in l);
    if (l.team_set) assert.equal(l.source_url, null);
    else assert.match(l.source_url, /^https:\/\//);
  }
});

test('systolic: watch from 130, alert from 140', () => {
  assert.equal(status('systolic_bp', 129), 'normal');
  assert.equal(status('systolic_bp', 130), 'watch');
  assert.equal(status('systolic_bp', 139), 'watch');
  assert.equal(status('systolic_bp', 140), 'alert');
});

test('diastolic: 79 is normal, 80 is watch, 90 is alert', () => {
  assert.equal(status('diastolic_bp', 79), 'normal');
  assert.equal(status('diastolic_bp', 80), 'watch');
  assert.equal(status('diastolic_bp', 89), 'watch');
  assert.equal(status('diastolic_bp', 90), 'alert');
});

test('blood pressure takes the worse of the two numbers', () => {
  assert.equal(bp(118, 76).status, 'normal');
  assert.equal(bp(125, 82).status, 'watch');
  assert.equal(bp(128, 91).status, 'alert');
});

test('hypertensive crisis: systolic above 180 or diastolic above 120, with the CMO action first', () => {
  assert.equal(bp(180, 110).crisis, false, '180 is not above 180');
  assert.equal(bp(180, 110).status, 'alert');
  assert.equal(bp(150, 120).crisis, false, '120 is not above 120');

  const high = bp(181, 100);
  assert.equal(high.status, 'alert');
  assert.equal(high.crisis, true);
  assert.equal(high.action, 'Tell the Crew Medical Officer now');
  assert.equal(high.action, CRISIS_ACTION);

  const dia = bp(160, 121);
  assert.equal(dia.crisis, true);
  assert.equal(dia.action, CRISIS_ACTION);

  const shown = applyRangeStatus({ id: 'blood-pressure', value: '185/124', limitKey: 'blood_pressure' });
  assert.equal(shown.status, 'alert');
  assert.equal(shown.crisis, true);
  assert.equal(shown.action, CRISIS_ACTION);
});

test('low blood pressure lines are team-set', () => {
  assert.equal(bp(89, 70).status, 'watch');
  assert.equal(bp(79, 55).status, 'alert');
  assert.equal(bp(100, 59).status, 'watch');
  assert.equal(bp(100, 49).status, 'alert');
  for (const l of LIMITS.filter((x) => x.label === 'Low' && x.indicator.endsWith('_bp'))) assert.equal(l.team_set, true);
});

test('fasting blood sugar: high 100 / 126, low 70 / 54', () => {
  assert.equal(status('fasting_glucose', 92), 'normal');
  assert.equal(status('fasting_glucose', 99), 'normal');
  assert.equal(status('fasting_glucose', 100), 'watch');
  assert.equal(status('fasting_glucose', 125), 'watch');
  assert.equal(status('fasting_glucose', 126), 'alert');
  assert.equal(status('fasting_glucose', 70), 'normal');
  assert.equal(status('fasting_glucose', 69), 'watch');
  assert.equal(status('fasting_glucose', 54), 'watch');
  assert.equal(status('fasting_glucose', 53), 'alert');
});

test('temperature: watch from 37.5, alert from 38.0, alert below 35.0', () => {
  assert.equal(status('temperature', 37.4), 'normal');
  assert.equal(status('temperature', 37.5), 'watch');
  assert.equal(status('temperature', 37.9), 'watch');
  assert.equal(status('temperature', 38.0), 'alert');
  assert.equal(status('temperature', 35.0), 'watch', '35.0 is not below 35.0; it is under the team-set low watch');
  assert.equal(status('temperature', 34.9), 'alert');
  assert.equal(limitOf('temperature', 'watch', 'Low').team_set, true);
  assert.equal(limitOf('temperature', 'alert', 'Hypothermia').team_set, false);
});

test('resting heart rate: watch above 100 (cited); 120 / 50 / 40 team-set', () => {
  assert.equal(status('resting_hr', 72), 'normal');
  assert.equal(status('resting_hr', 100), 'normal');
  assert.equal(status('resting_hr', 101), 'watch');
  assert.equal(status('resting_hr', 120), 'watch');
  assert.equal(status('resting_hr', 121), 'alert');
  assert.equal(status('resting_hr', 50), 'normal');
  assert.equal(status('resting_hr', 49), 'watch');
  assert.equal(status('resting_hr', 40), 'watch');
  assert.equal(status('resting_hr', 39), 'alert');
});

test('sleep: watch at or below 6.0 h, alert below 4.5 h; 7 h target is guidance only', () => {
  assert.equal(status('sleep_hours', 6.1), 'normal');
  assert.equal(status('sleep_hours', 6.0), 'watch');
  assert.equal(status('sleep_hours', 4.5), 'watch');
  assert.equal(status('sleep_hours', 4.4), 'alert');
  // 6.5 h is under the 7 h target but the target never sets a status.
  assert.equal(status('sleep_hours', 6.5), 'normal');
  const target = limitOf('sleep_hours', 'guidance');
  assert.equal(target.value, 7);
  assert.equal(describeLimit(target), 'Target: 7.0 h or more');
});

test('PVT-B values', () => {
  assert.deepEqual(PVT_B, { durationMs: 180000, gapMinMs: 1000, gapMaxMs: 4000, lapseMs: 355, falseStartMs: 100 });
});

test('describeLimit wording', () => {
  assert.equal(describeLimit(limitOf('systolic_bp', 'watch')), 'Watch from 130 mmHg');
  assert.equal(describeLimit(limitOf('resting_hr', 'watch', undefined)), 'Watch above 100 bpm');
  assert.equal(describeLimit(limitOf('sleep_hours', 'watch')), 'Watch at or below 6.0 h');
  assert.equal(describeLimit(limitOf('temperature', 'alert', 'Hypothermia')), 'Alert below 35.0 °C (hypothermia)');
});

test('Sources lists each cited URL once', () => {
  const urls = SOURCES.map((s) => s.url);
  assert.equal(new Set(urls).size, urls.length);
  assert.ok(SOURCES.length >= 9);
});

test('non-numbers give no status', () => {
  assert.equal(status('temperature', Number.NaN), null);
  assert.equal(parseBloodPressure('abc'), null);
  assert.throws(() => rangeStatus('nope', 1), /No range limits/);
});
