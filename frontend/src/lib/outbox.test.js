// Outbox: check-ins saved on the device reach the backend once, retry with backoff when it is
// unreachable, and stop retrying on a permanent error. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backoffMs, dueRecords, nextDueAt, syncOnce } from './outbox.js';
import { makeBackendSender } from './backendSync.js';

const NOW = Date.parse('2026-11-14T12:00:00.000Z');

function record(id, crewId = 'crew-01', minutesAgo = 10) {
  return {
    id,
    crew_id: crewId,
    kind: 'daily_vitals',
    recorded_at: new Date(NOW - minutesAgo * 60_000).toISOString(),
    status: 'normal',
    reasons: [],
    synced_at: null,
    payload: { reading: { heart_rate: 64, systolic: 118, diastolic: 76, sleep_hours: 6.4 }, result: { indicators: {} } },
  };
}

/** A stand-in for the Java backend: stores by Idempotency-Key, answers like docs/samples. */
function fakeBackend({ down = false, status = null } = {}) {
  const stored = new Map();
  const post = async (path, init) => {
    if (down) throw new Error('Onboard server unreachable');
    if (status) throw Object.assign(new Error(`Onboard server answered ${status}`), { status });
    stored.set(init.headers['Idempotency-Key'], JSON.parse(init.body));
    return { overall: 'watch', indicators: { sleep_hours: { status: 'watch', reasons: ['Short sleep'] } }, guidance: { steps: [], escalateTo: null } };
  };
  return { stored, post };
}

test('a check-in is sent once and the backend status becomes official', async () => {
  const records = [record('a')];
  const backend = fakeBackend();
  const out = await syncOnce({ records, crewId: 'crew-01', state: {}, now: NOW, send: makeBackendSender({ post: backend.post, savedRecords: () => records }) });
  assert.equal(backend.stored.size, 1);
  assert.equal(out.updated.length, 1);
  assert.equal(out.updated[0].status, 'watch');
  assert.ok(out.updated[0].synced_at);
  assert.equal(out.updated[0].payload.result.indicators.sleep_hours.status, 'watch');
  assert.deepEqual(out.state, {});
});

test('backend unreachable: the record stays on the device and retries back off', async () => {
  const records = [record('a')];
  const send = makeBackendSender({ post: fakeBackend({ down: true }).post, savedRecords: () => records });
  const out = await syncOnce({ records, crewId: 'crew-01', state: {}, now: NOW, send, random: () => 1 });
  assert.equal(out.updated.length, 0);
  assert.equal(out.state.a.attempts, 1);
  assert.equal(out.state.a.next_at, NOW + 2000);
  assert.equal(dueRecords(records, 'crew-01', out.state, NOW).length, 0, 'not due again straight away');
  assert.equal(nextDueAt(records, 'crew-01', out.state), NOW + 2000);
});

test('a 400 is final: the record is marked rejected and not retried', async () => {
  const records = [record('a')];
  const send = makeBackendSender({ post: fakeBackend({ status: 400 }).post, savedRecords: () => records });
  const out = await syncOnce({ records, crewId: 'crew-01', state: {}, now: NOW, send });
  assert.equal(out.state.a.rejected, 400);
  assert.equal(nextDueAt(records, 'crew-01', out.state), null);
});

test('backoff doubles, is capped at 5 minutes and has 50–100% jitter', () => {
  assert.equal(backoffMs(1, () => 1), 2000);
  assert.equal(backoffMs(3, () => 1), 8000);
  assert.equal(backoffMs(30, () => 1), 300000);
  assert.equal(backoffMs(1, () => 0), 1000);
});

test('only the signed-in person’s unsynced records are sent, oldest first', () => {
  const records = [record('new', 'crew-01', 1), record('old', 'crew-01', 30), record('other', 'crew-02'), { ...record('done'), synced_at: 'x' }];
  assert.deepEqual(dueRecords(records, 'crew-01', {}, NOW).map((r) => r.id), ['old', 'new']);
});
