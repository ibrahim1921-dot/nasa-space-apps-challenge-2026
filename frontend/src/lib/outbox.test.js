// Outbox: saved on the device first, synced later, and a retried sync never duplicates. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKOFF, backoffMs, dueRecords, syncOnce, syncStateOf } from './outbox.js';
import { processBatch } from './syncCore.js';
import { SCORED_ON, scoreCheckin } from './scoring.js';
import { NOW, crewDaysOf, fakeDb, preflightOf, testUuid } from './testSupport.js';

const READING = { systolic: 114, diastolic: 77, heart_rate: 65, glucose: 86, temperature: 36.8, sleep_hours: 7.0, mood: 4 };

/** A daily-vitals record exactly as CheckinForm saves it on the device. */
function deviceRecord(crewId = 'crew-01', recordedAt = '2026-11-13T08:30:00.000Z') {
  const result = scoreCheckin({ crewId, reading: READING, crewDays: crewDaysOf(crewId), saved: [], at: recordedAt, scoredOn: SCORED_ON.device });
  return {
    id: testUuid(),
    crew_id: crewId,
    kind: 'daily_vitals',
    recorded_at: recordedAt,
    payload: { reading: READING, context: { notes: '' }, result },
    status: result.status,
    reasons: result.reasons,
    engine_version: result.engine_version,
    synced_at: null,
    scored_on: 'device',
  };
}

/** /api/sync over the fake table. `loseNext` drops the next response after the server has stored it. */
function fakeServer(db, crewId = 'crew-01') {
  const server = {
    calls: 0,
    loseNext: false,
    offline: false,
    async send(readings) {
      server.calls += 1;
      if (server.offline) throw new Error('Failed to fetch');
      const body = JSON.parse(JSON.stringify(readings)); // over the wire
      const out = await processBatch({ readings: body, crewId, db, preflightFor: preflightOf, clock: () => NOW });
      if (server.loseNext) {
        server.loseNext = false;
        throw new Error('Connection reset after the server stored the batch');
      }
      return out;
    },
  };
  return server;
}

const t0 = NOW.getTime();
const half = () => 0.5;

test('a retried sync does not duplicate: response lost after storing, then the retry is "already_stored"', async () => {
  const db = fakeDb();
  const server = fakeServer(db);
  const record = deviceRecord();
  const seededCount = db.rows.size;

  server.loseNext = true;
  const first = await syncOnce({ records: [record], crewId: 'crew-01', state: {}, now: t0, send: server.send, random: half });
  assert.equal(first.updated.length, 0, 'the device did not hear back, so it still holds the record');
  assert.equal(first.state[record.id].attempts, 1);
  assert.ok(first.state[record.id].next_at > t0);
  assert.equal(db.rows.size, seededCount + 1, 'the server did store it');

  // Not due yet: nothing is sent.
  const early = await syncOnce({ records: [record], crewId: 'crew-01', state: first.state, now: t0 + 100, send: server.send });
  assert.equal(early.sent, 0);

  const later = first.state[record.id].next_at;
  const second = await syncOnce({ records: [record], crewId: 'crew-01', state: first.state, now: later, send: server.send, random: half });
  assert.equal(second.updated.length, 1);
  assert.ok(second.updated[0].synced_at);
  assert.equal(second.updated[0].scored_on, 'server');
  assert.equal(second.state[record.id], undefined, 'retry bookkeeping cleared');
  assert.equal(db.rows.size, seededCount + 1, 'still exactly one row for this id');
  assert.equal([...db.rows.values()].filter((r) => r.id === record.id).length, 1);

  // A third send of the same record (e.g. two tabs) is still a no-op on the server.
  const third = await server.send([{ ...second.updated[0], payload: { reading: READING } }].map((r) => ({ ...r, kind: 'daily_vitals' })));
  assert.equal(third.results[0].result, 'already_stored');
  assert.equal(db.rows.size, seededCount + 1);
});

test('the same id twice in one batch is stored once', async () => {
  const db = fakeDb();
  const server = fakeServer(db);
  const record = deviceRecord();
  const seededCount = db.rows.size;
  const sync = (await import('./outbox.js')).toSyncReading(record);
  const { results } = await server.send([sync, sync]);
  assert.deepEqual(results.map((r) => r.result), ['stored', 'already_stored']);
  assert.equal(db.rows.size, seededCount + 1);
});

test('offline: the record stays on the device and retries back off, capped at 5 minutes', async () => {
  const db = fakeDb();
  const server = fakeServer(db);
  server.offline = true;
  const record = deviceRecord();
  let state = {};
  let now = t0;
  const delays = [];
  for (let i = 0; i < 10; i += 1) {
    const out = await syncOnce({ records: [record], crewId: 'crew-01', state, now, send: server.send, random: () => 1 });
    state = out.state;
    delays.push(state[record.id].next_at - now);
    now = state[record.id].next_at;
  }
  assert.deepEqual(delays.slice(0, 4), [2000, 4000, 8000, 16000]);
  assert.equal(Math.max(...delays), BACKOFF.maxMs);
  assert.equal(syncStateOf(record, state), 'on_device');

  server.offline = false;
  const back = await syncOnce({ records: [record], crewId: 'crew-01', state, now, send: server.send });
  assert.equal(back.updated.length, 1);
  assert.equal(syncStateOf(back.updated[0], back.state), 'synced');
});

test('backoff has 50–100% jitter', () => {
  assert.equal(backoffMs(1, () => 0), 1000);
  assert.equal(backoffMs(1, () => 1), 2000);
  assert.equal(backoffMs(30, () => 1), BACKOFF.maxMs);
});

test('only the signed-in person’s unsynced records are sent, oldest first', () => {
  const a = deviceRecord('crew-01', '2026-11-13T10:00:00.000Z');
  const b = deviceRecord('crew-01', '2026-11-13T08:00:00.000Z');
  const tomas = deviceRecord('crew-02');
  const done = { ...deviceRecord('crew-01'), synced_at: '2026-11-13T09:00:00.000Z' };
  assert.deepEqual(dueRecords([a, b, tomas, done], 'crew-01', {}, t0).map((r) => r.id), [b.id, a.id]);
});

test('a 403 is final: the record is marked rejected and not retried', async () => {
  const db = fakeDb();
  const server = fakeServer(db, 'crew-01');
  const forTomas = deviceRecord('crew-02');
  // Pretend the device thinks it is Tomas, but the server knows the user is Maya.
  const out = await syncOnce({ records: [forTomas], crewId: 'crew-02', state: {}, now: t0, send: server.send });
  assert.equal(out.state[forTomas.id].rejected, 403);
  assert.equal(syncStateOf(forTomas, out.state), 'rejected');
  const again = await syncOnce({ records: [forTomas], crewId: 'crew-02', state: out.state, now: t0 + 10 * 60_000, send: server.send });
  assert.equal(again.sent, 0);
});
