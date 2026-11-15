import test from 'node:test';
import assert from 'node:assert/strict';
import { chartGeometry, groupByUnit, number, cadence } from '../src/model.js';

test('grip force and muscle mass never share a numeric axis', () => {
  assert.equal(groupByUnit([{ unit: 'kgf' }, { unit: 'kg' }]).length, 2);
  assert.equal(groupByUnit([{ unit: 'mmHg' }, { unit: 'mmHg' }]).length, 1);
});
test('empty readings stay empty; a real zero dose is displayed', () => {
  assert.equal(number(null, 'mGy'), '—');
  assert.equal(number(0, 'mGy'), '0');
  assert.equal(chartGeometry([{ points: [] }]), null);
});
test('episodic chart uses measured timestamps, not refresh ticks or invented samples', () => {
  const points = [{ at: '2026-01-08T08:00:00Z', value: 36, original: 36, activity: 36 },
    { at: '2026-01-15T08:00:00Z', value: 35.8, original: 36, activity: 36 }];
  const chart = chartGeometry([{ points }]);
  assert.equal(chart.last - chart.first, 7 * 86400000);
  assert.equal(chart.path(points, 'value').split('L').length, 2);
  assert.equal(cadence(40320), '28 days');
});
