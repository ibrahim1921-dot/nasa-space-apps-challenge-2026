// POST /api/sync with sensor provenance: accepted, checked, stored; old records still work; device and
// server agree when the check-in was scored with simulated sensor days. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processBatch } from './syncCore.js';
import { SCORED_ON, sameResult, scoreCheckin } from './scoring.js';
import { addDays, sensorDaysUntil } from './sensorFeed.js';
import { NOW, crewDaysOf, fakeDb, preflightOf, testUuid } from './testSupport.js';

const READING = { systolic: 112, diastolic: 76, heart_rate: 64, glucose: 88, temperature: 36.7, sleep_hours: 7.1, mood: 4 };
const PROVENANCE = { systolic: 'sensor', diastolic: 'sensor', heart_rate: 'sensor', glucose: 'sensor', temperature: 'manual', sleep_hours: 'sensor', mood: 'manual' };
const DEVICES = { shirt: 'ok', cgm: 'ok', headband: 'not worn', actigraph: 'ok' };
const MAYA = { crew_id: 'crew-01', name: 'Maya Okafor', role: 'crew' };
const AT = '2026-11-03T07:20:00.000Z';

const daily = (payload = {}, extra = {}) => ({
  id: testUuid(),
  crew_id: 'crew-01',
  kind: 'daily_vitals',
  recorded_at: AT,
  payload: { reading: { ...READING }, context: null, provenance: PROVENANCE, devices: DEVICES, entered_by: MAYA, ...payload },
  ...extra,
});
const run = (db, readings, crewId = 'crew-01') => processBatch({ readings, crewId, db, preflightFor: preflightOf, clock: () => NOW });

test('provenance, devices and entered_by are accepted and stored with the reading', async () => {
  const db = fakeDb();
  const item = daily();
  const { results } = await run(db, [item]);
  assert.equal(results[0].code, 201);
  const row = db.rows.get(item.id);
  assert.deepEqual(row.payload.provenance, PROVENANCE);
  assert.deepEqual(row.payload.devices, DEVICES);
  assert.deepEqual(row.payload.entered_by, MAYA);
  assert.equal(row.payload.origin, 'device');
});

test('only allowed values: bad provenance, devices or entered_by come back 400 and are not stored', async () => {
  const db = fakeDb();
  const bad = [
    daily({ provenance: { ...PROVENANCE, systolic: 'guessed' } }),
    daily({ provenance: { mood: 'sensor' } }), // sensors cannot know mood
    daily({ provenance: { pulse: 'sensor' } }),
    daily({ provenance: 'sensor' }),
    daily({ devices: { ...DEVICES, watch: 'ok' } }),
    daily({ devices: { shirt: 'broken' } }),
    daily({ entered_by: { crew_id: 'crew-01', name: '', role: 'crew' } }),
    daily({ demo_events: [{ crewId: 'crew-01', type: 'flu', startOffset: 1 }] }),
  ];
  const { results } = await run(db, bad);
  assert.deepEqual(results.map((r) => r.code), bad.map(() => 400), results.map((r) => r.error).join(' | '));
  assert.equal(db.insertCalls, 0);
});

test('entered_by must be the signed-in crew member (403); events for someone else are refused (400)', async () => {
  const db = fakeDb();
  const { results } = await run(db, [
    daily({ entered_by: { crew_id: 'crew-02', name: 'Tomas Reyes', role: 'crew' } }),
    daily({ demo_events: [{ crewId: 'crew-02', type: 'fever', startOffset: 1 }] }),
  ]);
  assert.deepEqual(results.map((r) => r.code), [403, 400]);
  assert.equal(db.insertCalls, 0);
});

test('a reading with a sensor gap and no mood answer is stored, and the missing rows are listed', async () => {
  const db = fakeDb();
  const item = daily({
    reading: { ...READING, systolic: null, diastolic: null, heart_rate: null, mood: null },
    provenance: { glucose: 'sensor', temperature: 'sensor', sleep_hours: 'sensor' },
    devices: { ...DEVICES, shirt: 'not worn', headband: 'ok' },
  });
  const { results } = await run(db, [item]);
  assert.equal(results[0].code, 201);
  assert.deepEqual(results[0].official.missing, ['blood_pressure', 'heart_rate', 'mood']);
});

test('old records without provenance still sync exactly as before', async () => {
  const db = fakeDb();
  const old = { id: testUuid(), crew_id: 'crew-01', kind: 'daily_vitals', recorded_at: '2026-11-13T09:00:00.000Z', payload: { reading: { ...READING }, context: null } };
  const { results } = await run(db, [old]);
  assert.equal(results[0].code, 201);
  const stored = db.rows.get(old.id).payload;
  assert.equal('provenance' in stored, false);
  assert.equal('entered_by' in stored, false);
  // Scored against the seed only (no sensor days), as before this feature.
  assert.equal(results[0].official.history_source, 'Synthetic');
});

test('device and server agree on a check-in scored with simulated sensor days and a demo event', async () => {
  const events = [{ crewId: 'crew-01', type: 'fever', startOffset: 2 }];
  const crewDays = crewDaysOf('crew-01');
  const sensorDays = sensorDaysUntil({ crewId: 'crew-01', crewDays, untilDate: AT.slice(0, 10), demo: { events } });
  assert.equal(sensorDays.at(-1).date, addDays('2026-10-30', 4));
  const device = scoreCheckin({ crewId: 'crew-01', reading: READING, crewDays, sensorDays, at: AT, scoredOn: SCORED_ON.device });
  assert.match(device.history_source, /3 simulated sensor days/);

  const db = fakeDb();
  const item = daily({ result: device, demo_events: events }, { device_result: device });
  const { results } = await run(db, [item]);
  assert.equal(results[0].code, 201);
  assert.equal(results[0].server_differs, false, 'server rebuilt the same sensor days');
  assert.ok(sameResult(device, results[0].official));
  assert.deepEqual(db.rows.get(item.id).payload.demo_events, events);

  // Without the events, the server's sensor days differ (no fever) and it says so.
  const plain = daily({ result: device }, { device_result: device });
  const second = await run(fakeDb(), [plain]);
  assert.equal(second.results[0].server_differs, true);
});

test('the outbox sends provenance, devices, entered_by and demo events; older records send what they did before', async () => {
  const { toSyncReading } = await import('./outbox.js');
  const record = {
    id: testUuid(),
    crew_id: 'crew-01',
    kind: 'daily_vitals',
    recorded_at: AT,
    payload: { reading: READING, context: null, result: {}, provenance: PROVENANCE, devices: DEVICES, entered_by: MAYA, demo_events: [] },
    status: 'normal',
    reasons: [],
    engine_version: 'x',
  };
  const sent = toSyncReading(record).payload;
  assert.deepEqual(sent, { reading: READING, context: null, provenance: PROVENANCE, devices: DEVICES, entered_by: MAYA, demo_events: [] });
  const old = toSyncReading({ ...record, payload: { reading: READING, context: null, result: {} } }).payload;
  assert.deepEqual(old, { reading: READING, context: null });
});
