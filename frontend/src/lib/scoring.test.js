// Device scoring matches server scoring. Run with: npm test
// "Device" = what CheckinForm / StandTest do: bundled crew.json days + readings saved on this device.
// "Server" = POST /api/sync: the seeded rows in the database + readings already stored there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCORED_ON, scoreCheckin, scoreStandTest } from './scoring.js';
import { processBatch } from './syncCore.js';
import { toSyncReading } from './outbox.js';
import { NOW, crewDaysOf, fakeDb, preflightOf, testUuid } from './testSupport.js';

const ENGINE_FIELDS = ['engine_version', 'status', 'needs_attention', 'crisis', 'summary', 'indicators', 'order', 'action', 'reasons', 'history_days'];
const pick = (o) => Object.fromEntries(ENGINE_FIELDS.map((k) => [k, o[k]]));

const READINGS = [
  { systolic: 113, diastolic: 76, heart_rate: 64, glucose: 87, temperature: 36.7, sleep_hours: 7.2, mood: 4 },
  { systolic: 138, diastolic: 88, heart_rate: 79, glucose: 101, temperature: 37.6, sleep_hours: 5.1, mood: 2 }, // a bad day
  { systolic: 186, diastolic: 121, heart_rate: 70, glucose: 90, temperature: 36.8, sleep_hours: 6.8, mood: 3 }, // crisis line
  { systolic: 115, diastolic: 77, heart_rate: 66, glucose: 88, temperature: 36.7, sleep_hours: 7.0, mood: 4 },
];

/** Save readings one after another on a simulated device, scoring each with what is saved before it. */
function onDevice(crewId, readings) {
  const saved = [];
  return readings.map((reading, i) => {
    const at = new Date(Date.parse('2026-11-10T08:00:00.000Z') + i * 86_400_000).toISOString();
    const result = scoreCheckin({ crewId, reading, crewDays: crewDaysOf(crewId), saved, at, scoredOn: SCORED_ON.device });
    saved.push({ recorded_at: at, ...reading });
    return {
      id: testUuid(),
      crew_id: crewId,
      kind: 'daily_vitals',
      recorded_at: at,
      payload: { reading, context: null, result },
      status: result.status,
      reasons: result.reasons,
      engine_version: result.engine_version,
      synced_at: null,
    };
  });
}

for (const crewId of ['crew-01', 'crew-02', 'crew-03', 'crew-04']) {
  test(`${crewId}: four check-ins scored on the device match the server's official result exactly`, async () => {
    const records = onDevice(crewId, READINGS);
    const db = fakeDb();
    const { results } = await processBatch({
      readings: records.map(toSyncReading),
      crewId,
      db,
      preflightFor: preflightOf,
      clock: () => NOW,
    });
    results.forEach((res, i) => {
      assert.equal(res.code, 201);
      assert.equal(res.server_differs, false, `reading ${i}: server and device disagree`);
      assert.deepEqual(pick(res.official), pick(records[i].payload.result));
      assert.equal(res.official.scored_on, 'server');
    });
    // The statuses really vary, so this is not trivially "all normal".
    assert.ok(new Set(results.map((r) => r.status)).size > 1);
  });
}

test('server history is the seeded rows: 60 crew.json days, matching the device', async () => {
  const [record] = onDevice('crew-01', READINGS.slice(0, 1));
  const { results } = await processBatch({ readings: [toSyncReading(record)], crewId: 'crew-01', db: fakeDb(), preflightFor: preflightOf, clock: () => NOW });
  assert.equal(results[0].official.history_days, 60);
  assert.equal(record.payload.result.history_days, 60);
});

test('when the server knows more (a reading from another device), the server wins and says so', async () => {
  const db = fakeDb();
  // Another device stored a fever day for Maya earlier.
  const [other] = onDevice('crew-01', [{ ...READINGS[0], temperature: 38.6 }]);
  await processBatch({ readings: [toSyncReading(other)], crewId: 'crew-01', db, preflightFor: preflightOf, clock: () => NOW });
  // This device never saw it; its result for the next day is based on less history.
  const at = '2026-11-12T08:00:00.000Z';
  const reading = { ...READINGS[0], temperature: 37.4 };
  const device = scoreCheckin({ crewId: 'crew-01', reading, crewDays: crewDaysOf('crew-01'), saved: [], at, scoredOn: 'device' });
  const tampered = { status: device.status === 'normal' ? 'alert' : 'normal', reasons: [], engine_version: device.engine_version };
  const item = { id: testUuid(), crew_id: 'crew-01', kind: 'daily_vitals', recorded_at: at, payload: { reading }, device_result: tampered };
  const { results } = await processBatch({ readings: [item], crewId: 'crew-01', db, preflightFor: preflightOf, clock: () => NOW });
  assert.equal(results[0].server_differs, true);
  assert.equal(results[0].device_status, tampered.status);
  assert.notEqual(results[0].status, tampered.status);
  const stored = db.rows.get(item.id);
  assert.equal(stored.status, results[0].status, 'the server result is what is stored');
  assert.deepEqual(stored.payload.device_result, tampered, 'the device result is kept for audit');
});

test('stand tests: device and server agree, including a stopped test with symptoms', async () => {
  const tests = [
    {
      supine: { heart_rate: 60, systolic: 118, diastolic: 76 },
      standing_1min: { heart_rate: 82, systolic: 104, diastolic: 70 },
      standing_3min: { heart_rate: 88, systolic: 101, diastolic: 69 },
      symptoms: ['dizzy'],
      partial: false,
      timing_skipped: true,
    },
    { supine: { heart_rate: 62, systolic: 115, diastolic: 75 }, standing_1min: null, standing_3min: null, symptoms: ['felt_faint'], partial: true, timing_skipped: false },
  ];
  for (const crewId of ['crew-01', 'crew-04']) {
    const records = tests.map((t, i) => {
      const r = scoreStandTest({ test: t, preflightTests: preflightOf(crewId), scoredOn: 'device' });
      return {
        id: testUuid(),
        crew_id: crewId,
        kind: 'stand_test',
        recorded_at: `2026-11-1${i}T08:00:00.000Z`,
        payload: t,
        status: r.status,
        reasons: r.reasons,
        engine_version: r.engine_version,
      };
    });
    const { results } = await processBatch({ readings: records.map(toSyncReading), crewId, db: fakeDb(), preflightFor: preflightOf, clock: () => NOW });
    results.forEach((res, i) => {
      assert.equal(res.code, 201);
      assert.equal(res.server_differs, false);
      assert.equal(res.status, records[i].status);
      assert.deepEqual(res.reasons, records[i].reasons);
    });
  }
});
