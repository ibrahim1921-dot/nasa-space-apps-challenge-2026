// Cabin air checks use the NASA-STD-3001 lines in content/limits.js. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cabinDayStatus, countByStatus } from './environmentStatus.js';
import { RANGE_INDICATORS } from './rangeCheck.js';

const calm = { co2_max_1h: 2.4, co2_7d_mean: 2.1, temp_min: 22, temp_max: 23.5, rh_min: 40, rh_max: 50, unusual: [] };

test('a calm day is normal', () => {
  const r = cabinDayStatus(calm);
  assert.equal(r.status, 'normal');
  assert.deepEqual(r.reasons, []);
});

test('one hour over 3 mmHg CO2 is an alert, with the NASA line in the reason', () => {
  const r = cabinDayStatus({ ...calm, co2_max_1h: 3.21 });
  assert.equal(r.co2.status, 'alert');
  assert.equal(r.status, 'alert');
  assert.equal(r.reasons[0], 'Highest 1-hour CO₂ 3.21 mmHg is above the NASA-STD-3001 alert line (3.0 mmHg)');
});

test('exactly 3 mmHg is not over the line; a 7-day average of 2.5 is watch', () => {
  assert.equal(cabinDayStatus({ ...calm, co2_max_1h: 3 }).co2.status, 'normal');
  const r = cabinDayStatus({ ...calm, co2_7d_mean: 2.5 });
  assert.equal(r.co2.status, 'watch');
  assert.match(r.reasons[0], /at or above the NASA OCHMO watch line \(2\.5 mmHg\)/);
});

test('temperature and humidity outside the operating range are alerts', () => {
  assert.equal(cabinDayStatus({ ...calm, temp_max: 27.4 }).temperature.status, 'alert');
  assert.equal(cabinDayStatus({ ...calm, temp_min: 17.5 }).temperature.status, 'alert');
  assert.equal(cabinDayStatus({ ...calm, rh_max: 76 }).humidity.status, 'alert');
  assert.equal(cabinDayStatus({ ...calm, rh_min: 24 }).humidity.status, 'alert');
});

test('an unusual-for-this-cabin flag is a watch on the measure it names', () => {
  const r = cabinDayStatus({ ...calm, unusual: ['CO2 2.88 mmHg is 3.5 spreads above this cabin\'s usual of 2.53 mmHg (previous 7 days)'] });
  assert.equal(r.co2.status, 'watch');
  assert.equal(r.temperature.status, 'normal');
});

test('the cabin lines are checkable, and the bundled RR-1 data has real alert days', () => {
  for (const id of ['cabin_co2_1h', 'cabin_co2_7d', 'cabin_temp', 'cabin_rh']) assert.ok(RANGE_INDICATORS.includes(id));
  const env = JSON.parse(readFileSync(new URL('../data/environment.json', import.meta.url), 'utf8'));
  const counts = countByStatus(env.cabin.days);
  assert.equal(counts.normal + counts.watch + counts.alert, env.cabin.days.length);
  assert.ok(counts.alert > 0, 'RR-1 has hours over 3 mmHg CO2');
});
