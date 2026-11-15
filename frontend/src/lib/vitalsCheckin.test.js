// Daily vitals check-in: validation and scoring against a crew member's history. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CRISIS_ACTION } from '../content/limits.js';
import { baselineAfter } from './baseline.js';
import { VITALS_SCREENS } from '../constants/vitals.js';
import {
  READING_FIELDS,
  buildHistory,
  evaluateCheckin,
  usualByRow,
  validateExtraHistory,
  validateReading,
} from './vitalsCheckin.js';

const here = dirname(fileURLToPath(import.meta.url));
const crew = JSON.parse(readFileSync(join(here, '../data/crew.json'), 'utf8')).crew;
const daysOf = (id) => crew.find((c) => c.id === id).days;
const history = buildHistory(daysOf('crew-01'));
const usual = usualByRow(history);

/** A reading at the person's own usual values: normal on both checks. */
const usualReading = () => ({
  systolic: usual.blood_pressure.mean.systolic,
  diastolic: usual.blood_pressure.mean.diastolic,
  heart_rate: Math.round(usual.heart_rate.mean),
  glucose: Math.round(usual.glucose.mean),
  temperature: usual.temperature.mean,
  sleep_hours: usual.sleep_hours.mean,
  mood: Math.round(usual.mood.mean),
});

test('manual check-in omits device blood pressure and still validates and scores', () => {
  const { systolic, diastolic, ...reading } = usualReading();
  assert.ok(VITALS_SCREENS.every((screen) => screen.fields.every(({ key }) => !['systolic', 'diastolic'].includes(key))));
  assert.equal(validateReading(reading), null);
  assert.equal(validateExtraHistory([{ ...reading, recorded_at: '2026-11-15T08:00:00Z' }]), null);
  const result = evaluateCheckin(reading, history);
  assert.equal(result.indicators.blood_pressure, undefined);
  assert.equal(result.order.includes('blood_pressure'), false);
  assert.equal(result.order.length, 5);
  assert.match(validateReading({ ...reading, systolic }), /diastolic.*missing/);
  assert.match(validateReading({ ...reading, diastolic }), /systolic.*missing/);
});

test('crew-01’s sleep has drifted down in crew.json: the drift check flags it at their usual value', () => {
  const sleep = evaluateCheckin(usualReading(), history).indicators.sleep_hours;
  assert.equal(sleep.range_status, 'normal');
  assert.equal(sleep.baseline_status, 'normal');
  assert.equal(sleep.drift_status, 'watch');
  assert.match(sleep.reasons[0], /Sleep has drifted down from your mission-start average of 7.1 h/);
});

test('a reading at the person’s usual values (with a good night) is normal everywhere', () => {
  const r = evaluateCheckin({ ...usualReading(), sleep_hours: 7.5 }, history);
  assert.equal(r.status, 'normal');
  assert.equal(r.action, null);
  for (const row of Object.values(r.indicators)) assert.equal(row.status, 'normal', row.id);
});

test('fever reading → temperature alert from the CDC line', () => {
  const r = evaluateCheckin({ ...usualReading(), temperature: 38.4 }, history);
  const t = r.indicators.temperature;
  assert.equal(t.status, 'alert');
  assert.equal(t.range_status, 'alert');
  assert.ok(t.reasons.some((x) => /at or above the CDC fever line \(38\.0 °C\)/.test(x)));
  assert.equal(r.status, 'alert');
  assert.equal(r.needs_attention, true);
  assert.equal(t.action.status, 'alert');
  assert.ok(r.action.steps.length > 0);
});

test('185/125 → hypertensive crisis with the CMO action first', () => {
  const r = evaluateCheckin({ ...usualReading(), systolic: 185, diastolic: 125 }, history);
  const bp = r.indicators.blood_pressure;
  assert.equal(bp.status, 'alert');
  assert.equal(bp.crisis, true);
  assert.deepEqual(bp.value, { systolic: 185, diastolic: 125 });
  assert.equal(r.crisis, true);
  assert.equal(r.action.urgent, CRISIS_ACTION);
  assert.equal(r.action.urgent, 'Tell the Crew Medical Officer now');
  assert.deepEqual(r.action.indicators, ['blood_pressure']);
  assert.ok(bp.reasons.some((x) => /hypertensive crisis line/.test(x)));
});

test('normal for Earth ranges but 2.5 SD above the person’s baseline → watch with a "your usual" reason', () => {
  // The same 14 clean days the engine uses for the personal check.
  const { mean, sd } = baselineAfter(history).systolic;
  const systolic = Math.round((mean + 2.5 * sd) * 10) / 10;

  const r = evaluateCheckin({ ...usualReading(), systolic }, history);
  const bp = r.indicators.blood_pressure;
  assert.ok(systolic < 130, `${systolic} is under the AHA watch line`);
  assert.ok(bp.z.systolic >= 2.4 && bp.z.systolic <= 2.6, `z = ${bp.z.systolic}`);
  assert.equal(bp.range_status, 'normal');
  assert.equal(bp.baseline_status, 'watch');
  assert.equal(bp.status, 'watch');
  assert.ok(bp.reasons.some((x) => /SD above your 14-day average of \d+ mmHg, outside your usual range/.test(x)), bp.reasons.join(' | '));
  assert.equal(bp.action.status, 'watch');
});

test('mood 1 shows watch even when it is usual for that person', () => {
  // Someone whose mood has always been 1: the personal check sees nothing new.
  const lowMood = Array.from({ length: 14 }, (_, i) => ({ day: i + 1, mood: 1 }));
  const r = evaluateCheckin({ ...usualReading(), mood: 1 }, lowMood);
  assert.equal(r.indicators.mood.baseline_status, 'normal');
  assert.equal(r.indicators.mood.range_status, 'watch');
  assert.equal(r.indicators.mood.status, 'watch');
});

test('readings saved on this device are added to the history', () => {
  const saved = [{ recorded_at: '2026-11-01T07:00:00.000Z', ...usualReading() }];
  const h = buildHistory(daysOf('crew-01'), saved);
  assert.equal(h.length, daysOf('crew-01').length + 1);
  assert.equal(h.at(-1).systolic, saved[0].systolic);
  assert.equal(h.at(-1).sleepHours, saved[0].sleep_hours);
});

test('usual line text', () => {
  assert.match(usual.blood_pressure.text, /^\d+\/\d+ mmHg$/);
  assert.equal(usual.blood_pressure.days, 14);
});

test('validation: plausibility ranges and clear messages', () => {
  assert.equal(validateReading(usualReading()), null);
  assert.match(validateReading(null), /must be an object/);
  assert.match(validateReading({ ...usualReading(), temperature: 47 }), /temperature \(temperature\) is 47; expected 30–43 °C/);
  assert.match(validateReading({ ...usualReading(), mood: 3.5 }), /whole number/);
  assert.match(validateReading({ ...usualReading(), heart_rate: '70' }), /must be a number/);
  const { glucose, ...noGlucose } = usualReading();
  void glucose;
  assert.match(validateReading(noGlucose), /glucose .* is missing/);
  assert.match(validateReading({ ...usualReading(), systolic: 80, diastolic: 90 }), /diastolic \(90\) must be lower than systolic \(80\)/);
  for (const f of Object.values(READING_FIELDS)) assert.ok(f.min < f.max);
});

test('validation: extra_history', () => {
  assert.equal(validateExtraHistory(undefined), null);
  assert.match(validateExtraHistory({}), /must be an array/);
  assert.match(validateExtraHistory([{ ...usualReading() }]), /recorded_at/);
  assert.match(validateExtraHistory([{ recorded_at: '2026-11-01T07:00:00Z', ...usualReading(), mood: 9 }]), /extra_history\[0\]\.mood/);
});
