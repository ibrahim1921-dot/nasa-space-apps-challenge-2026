// The app's check-ins match the API contract samples (docs/samples). Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromCheckinResponse, toCheckinRequest } from './contractMap.js';

const sample = (name) => JSON.parse(readFileSync(new URL(`../../../docs/samples/${name}`, import.meta.url), 'utf8'));

const record = {
  id: 'r1',
  crew_id: 'crew-01',
  recorded_at: '2026-11-14T08:00:00Z',
  status: 'normal',
  reasons: [],
  payload: {
    reading: { systolic: 118, diastolic: 76, heart_rate: 64, glucose: 92, temperature: 36.8, sleep_hours: 6.4, mood: 4 },
    result: { indicators: { sleep_hours: { status: 'normal', reasons: [] }, heart_rate: { status: 'normal', reasons: [] } } },
  },
};

test('a saved check-in becomes exactly the contract request sample', () => {
  assert.deepEqual(toCheckinRequest(record), sample('checkin-request.json'));
});

test('missing readings are left out, not sent as null', () => {
  const body = toCheckinRequest({ ...record, payload: { reading: { heart_rate: 70, systolic: 120 } } });
  assert.deepEqual(body.readings, { heart_rate: 70 });
});

test('the backend result replaces the device status, and the device rows it did not mention stay', () => {
  const res = fromCheckinResponse(record, sample('checkin-response.json'), '2026-11-14T08:00:05Z');
  assert.equal(res.result, 'stored');
  assert.equal(res.status, 'watch');
  assert.equal(res.server_differs, true);
  assert.equal(res.official.indicators.sleep_hours.status, 'watch');
  assert.match(res.official.indicators.sleep_hours.reasons[0], /14-day average/);
  assert.equal(res.official.indicators.heart_rate.status, 'normal');
  assert.deepEqual(res.official.guidance.steps.length, 2);
});
