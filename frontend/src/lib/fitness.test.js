// Bones and muscles: grip strength vs the person's own preflight value. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitnessFor, ordinal, percentileOf } from './fitness.js';
import { limitOf } from '../content/limits.js';

const file = {
  ages: [21, 64],
  quantiles: [5, 10, 25, 50, 75, 90, 95],
  tests: {
    grip_force: { by_sex: { female: Array(44).fill([20, 21, 24, 27, 30, 33, 35]), male: Array(44).fill([33, 36, 40, 44, 48, 52, 55]) } },
    broad_jump: { by_sex: { female: Array(44).fill([120, 130, 145, 160, 175, 185, 195]), male: Array(44).fill([170, 180, 195, 210, 225, 240, 250]) } },
    sit_ups: { by_sex: { female: Array(44).fill([15, 18, 24, 30, 36, 41, 44]), male: Array(44).fill([25, 29, 35, 41, 47, 52, 55]) } },
  },
  crew: [
    { crewId: 'a', sex: 'female', age: 30, preflight: { grip_force: 30, broad_jump: 160, sit_ups: 30 }, inflight_grip: [{ week: 1, grip_force: 29.5 }, { week: 2, grip_force: 28.0 }] },
    { crewId: 'b', sex: 'male', age: 70, preflight: { grip_force: 50, broad_jump: 210, sit_ups: 41 }, inflight_grip: [{ week: 1, grip_force: 44.5 }] },
    { crewId: 'c', sex: 'male', age: 40, preflight: { grip_force: 50, broad_jump: 210, sit_ups: 41 }, inflight_grip: [{ week: 1, grip_force: 40.0 }] },
  ],
};

test('percentiles and ordinals', () => {
  assert.equal(percentileOf(27, [20, 21, 24, 27, 30, 33, 35], [5, 10, 25, 50, 75, 90, 95]), 50);
  assert.equal(percentileOf(40, [20, 21, 24, 27, 30, 33, 35], [5, 10, 25, 50, 75, 90, 95]), 99);
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 75].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '75th']);
});

test('a small drop is normal and the card says how far from preflight', () => {
  const { grip } = fitnessFor('a', file);
  assert.equal(grip.status, 'normal');
  assert.equal(grip.dropPct, 6.7);
  assert.match(grip.trendText, /Down 6\.7% from your preflight 30\.0 kg/);
  assert.match(grip.preflightAverage.text, /75th percentile for a 30-year-old woman/);
});

test('the watch and alert lines come from limits.js', () => {
  assert.equal(limitOf('grip_drop', 'watch').value, 10);
  assert.equal(limitOf('grip_drop', 'alert').value, 20);
  const watch = fitnessFor('b', file).grip; // 11% drop; age 70 uses the age-64 curve
  assert.equal(watch.status, 'watch');
  assert.match(watch.reasons[0], /11\.0% drop from preflight is at or above the team-set watch line/);
  const alert = fitnessFor('c', file).grip; // 20% drop
  assert.equal(alert.status, 'alert');
  assert.match(alert.reasons[0], /Canadian Space Agency/);
});

test('every bundled crew member has a fitness record', async () => {
  const { default: crewFile } = await import('../data/crew.json', { with: { type: 'json' } });
  for (const c of crewFile.crew) assert.ok(fitnessFor(c.id), c.id);
  assert.equal(fitnessFor('nobody'), null);
});
