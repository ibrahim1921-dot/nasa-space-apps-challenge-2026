import test from 'node:test';
import assert from 'node:assert/strict';
import { getObservationHistory } from './observationHistory.js';

test('uses authenticated API identity and preserves activity and pagination filters', async () => {
  const calls = [];
  const data = { content: [{ id: 'observation', context: { activityContext: 'EXERCISING' } }], page: 1, hasNext: false };
  const result = await getObservationHistory('crew-code', { activity: 'EXERCISING', page: 1 }, async (url, init) => {
    calls.push({ url, init }); return { ok: true, json: async () => calls.length === 1 ? { astronautId: 'server-uuid', crewCode: 'crew-code' } : data };
  });
  assert.equal(result, data);
  assert.ok(calls[1].url.includes('/server-uuid/observations?page=1&size=10&activity=EXERCISING'));
  assert.ok(calls.every(({ init }) => init.credentials === 'include' && init.cache === 'no-store'));
});

test('no sample fallback on unavailable or unauthorized backends, and no cross-identity reads', async () => {
  await assert.rejects(getObservationHistory('me', {}, async () => ({ ok: false, status: 401 })), /Sign in/);
  await assert.rejects(getObservationHistory('me', {}, async () => { throw new Error('offline'); }), /unavailable/);
  await assert.rejects(getObservationHistory('me', {}, async () => ({ ok: true, json: async () => ({ astronautId: 'other', crewCode: 'someone-else' }) })), /different crew/);
});

test('default browser fetch keeps its global receiver and requests remain cancellable', async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  let calls = 0;
  try {
    globalThis.fetch = function (url, init) {
      assert.equal(this, globalThis);
      assert.ok(init.signal instanceof AbortSignal);
      calls++;
      return Promise.resolve({ ok: true, json: async () => calls === 1 ? { astronautId: 'server-id', crewCode: 'me' } : { content: [] } });
    };
    assert.deepEqual(await getObservationHistory('me', { signal: controller.signal }), { content: [] });
  } finally { globalThis.fetch = original; }
});
