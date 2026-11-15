import test from 'node:test';
import assert from 'node:assert/strict';
import { sleepSummary } from './sleepSummary.js';

test('uses the previous calendar day, deduplicates dates, and excludes the day being recorded', () => {
  const nights = [
    { date: '2026-11-14', night: { total_sleep_h: 8 } },
    { rec_start_et: '2026-11-14 22:00:00', total_sleep_h: 4 },
    { date: '2026-11-15', total_sleep_h: 12 },
    { date: '2026-11-13', total_sleep_h: 6 },
    { date: '2026-11-12', total_sleep_h: 1, status: 'data quality issue' },
    { date: '2026-10-01', total_sleep_h: 4 },
  ];
  const result = sleepSummary(nights, '2026-11-15', '7');
  assert.equal(result.previous, nights[0]);
  assert.deepEqual(result.hours, { value: 7, count: 2 });
  assert.equal(result.heartRate.value, null);
  assert.equal(sleepSummary(nights, '2026-11-15', 'all').count, 3);
});

test('does not substitute older data when the previous day is missing', () => {
  const result = sleepSummary([{ date: '2026-11-12', total_sleep_h: 8 }], '2026-11-15');
  assert.equal(result.previous, undefined);
  assert.equal(result.previousDate, '2026-11-14');
});
