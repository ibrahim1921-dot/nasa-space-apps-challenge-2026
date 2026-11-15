import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DeliveryClient, checkedBackendOrigin } from '../src/delivery.js';
import { parseOriginalJson, planPage, exportUrl, makeBatches, MAX_BODY, utf8Bytes } from '../src/delivery-export.js';
import { stripPythonCredentials, pythonProxy } from '../src/python-proxy.js';

const exampleText = readFileSync(new URL('../../examples/export-page.json', import.meta.url), 'utf8');
const original = parseOriginalJson(exampleText);
const span = original.tree.fields.get('items').elements[0].fields.get('envelope');
const ORIGINAL = exampleText.slice(span.start, span.end);
const WORKSPACE = original.value.workspace_id;
const RUN = original.value.items[0].envelope.observation.simulation_metadata.run_id;
const SOURCE = original.value.items[0].envelope.observation.astronaut_id;
const ID = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';
const ACCOUNT = '10000000-0000-4000-8000-000000000003';
const ORIGIN = 'http://127.0.0.1:18080';
const response = (value, status = 200) => new Response(status === 204 ? null : JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const safeId = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = (sequence, changes = {}) => {
  const envelope = JSON.parse(ORIGINAL);
  envelope.observation.source_record_id = `original-record-${sequence}`;
  if (changes.run) envelope.observation.simulation_metadata.run_id = changes.run;
  if (changes.source) envelope.observation.astronaut_id = changes.source;
  if (changes.padding) envelope.observation.source_name = changes.padding;
  return { sequence, envelope };
};
class MemoryStorage {
  data = new Map(); failWrites = false;
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { if (this.failWrites) throw Error('Quota'); this.data.set(key, value); }
}
class Locks {
  held = new Set();
  async request(name, options, callback) {
    assert.equal(options.ifAvailable, true);
    if (this.held.has(name)) return callback(null);
    this.held.add(name);
    try { return await callback({ name }); } finally { this.held.delete(name); }
  }
}
function fixture() {
  const storage = new MemoryStorage(), locks = new Locks();
  const account = { accountId: ACCOUNT, role: 'NASA_OFFICER' };
  const capture = { captureId: ID, createdByAccountId: ACCOUNT, workspaceId: WORKSPACE, runId: RUN, status: 'ACTIVE',
    mappings: [{ mappingId: safeId(1), simulationAstronautId: SOURCE, simulationCrewCode: original.value.items[0].envelope.crew_code,
      astronautId: safeId(2), targetCrewCode: 'crew-01' }] };
  const state = { workspace: WORKSPACE, rows: [row(1)], account, capture, calls: [], posts: [], receipts: new Map(), reject: 0, token: 'csrf-contract-token-000000000001',
    afterCommit: null, malformedAck: false };
  const fetchImpl = async (path, options) => {
    state.calls.push({ path, options }); options.signal?.throwIfAborted();
    if (path.startsWith('/api/state?')) {
      assert.equal(options.credentials, 'omit'); assert.equal(options.headers, undefined);
      const query = new URL(path, 'http://lab.invalid').searchParams;
      const runs = [...new Set([RUN, ...state.rows.map(row => row.envelope.observation.simulation_metadata.run_id)])];
      if (!runs.includes(query.get('run_id'))) return response({ error: 'unknown run' }, 404);
      return response({ workspace_id: state.workspace, selected_run_id: query.get('run_id'), astronaut_id: query.get('astronaut_id'),
        runs: runs.map(run_id => ({ run_id })) });
    }
    if (path.startsWith('/api/')) {
      assert.equal(options.credentials, 'omit'); assert.equal(options.headers, undefined);
      const query = new URL(path, 'http://lab.invalid').searchParams;
      if (query.get('workspace_id') !== state.workspace) return response({ error: 'workspace changed' }, 409);
      const after = Number(query.get('after')), limit = Number(query.get('limit'));
      const through = query.has('through') ? Number(query.get('through')) : state.rows.length;
      const last = Math.min(after + limit, through);
      if (after > through || through > state.rows.length) return response({ error: 'range' }, 400);
      return response({ schema_version: 'astrohealth.simulation.export.v1', synthetic: true, durable: false, workspace_id: state.workspace,
        after, through, last_sequence: last, retained_observations: state.rows.length, record_limit: 50000,
        items: state.rows.slice(after, last), next_url: last < through ? exportUrl(state.workspace, last, through) : null,
        checkpoint_url: last === through ? exportUrl(state.workspace, last) : null });
    }
    assert.ok(path.startsWith(ORIGIN)); assert.equal(options.credentials, 'include'); assert.equal(options.mode, 'cors');
    const route = new URL(path).pathname;
    if (route === '/api/auth/csrf') return response({ headerName: 'X-CSRF-TOKEN', token: state.token });
    if (route === '/api/auth/login') {
      assert.equal(options.headers['X-CSRF-TOKEN'], state.token);
      state.token = 'rotated-csrf-contract-token-000002'; return response(account);
    }
    if (route === '/api/auth/logout') return response(null, 204);
    if (route === '/api/auth/me') return state.accountStatus ? response({ error: 'unauthorized' }, state.accountStatus) : response(account);
    if (route === `/api/simulation/captures/${capture.captureId}`) return response(capture);
    if (route.endsWith('/observations')) {
      assert.equal(options.headers['X-CSRF-TOKEN'], state.token); state.posts.push(options.body);
      if (state.reject) return response({ error: state.reject === 409 ? 'receipt_conflict' : state.reject === 422 ? 'missing_scope' : 'access_denied' }, state.reject);
      const batch = JSON.parse(options.body); let created = 0, duplicates = 0;
      const results = [];
      for (const item of batch.items) {
        const key = item.envelope.observation.source_record_id;
        const payload = JSON.stringify(item.envelope), existing = state.receipts.get(key);
        if (existing && (existing.payload !== payload || existing.sequence !== item.sequence)) return response({ error: 'receipt_conflict' }, 409);
        const receipt = existing || { payload, sequence: item.sequence, id: safeId(10 + state.receipts.size) };
        state.receipts.set(key, receipt); if (existing) duplicates++; else created++;
        results.push({ sequence: item.sequence, sourceRecordId: key, observationId: receipt.id, duplicate: Boolean(existing) });
      }
      if (state.afterCommit) await state.afterCommit(batch, options.signal);
      return response({ captureId: state.malformedAck ? OTHER : capture.captureId, created, duplicates, results });
    }
    throw Error(`Unexpected mock route ${route}`);
  };
  const client = (extra = {}) => new DeliveryClient({ enabled: true, backendOrigin: ORIGIN, labOrigin: 'http://127.0.0.1:5173', storage, locks, fetchImpl, ...extra });
  return { state, storage, locks, client };
}

test('delivery is disabled by default and refuses incompatible or credential-bearing origins', async () => {
  const disabled = new DeliveryClient({ fetchImpl: () => assert.fail('Disabled delivery must not fetch') });
  await assert.rejects(disabled.connect(ID), { code: 'disabled' });
  for (const url of ['https://remote.example', 'http://u:p@127.0.0.1:8080', 'http://127.0.0.1:8080/api', 'http://127.0.0.1:8765',
    'http://127.0.0.1:5173', 'http://localhost:8080', 'https://127.0.0.1:8080']) {
    assert.throws(() => checkedBackendOrigin(url, 'http://127.0.0.1:5173'), { code: 'configuration' });
  }
});

test('actual Python fixture retains exact original envelope text and rejects ambiguous JSON', () => {
  const page = planPage(exampleText, `${'/api/v1/observations'}?workspace_id=${WORKSPACE}&after=0&limit=1`,
    { workspaceId: WORKSPACE, runId: RUN, mappings: [{ simulationAstronautId: SOURCE, simulationCrewCode: original.value.items[0].envelope.crew_code }] });
  assert.equal(page.batches[0].items[0].rawEnvelope, ORIGINAL);
  assert.ok(page.batches[0].body.includes(ORIGINAL));
  for (const text of ['{"a":1,"a":2}', '{"a": [1,]}', '{} {}', '{"x":NaN}']) assert.throws(() => parseOriginalJson(text));
});

test('large seed integers and original decimals are transported without JS number reserialization', () => {
  const text = exampleText.replace('"seed": 42', '"seed": 9007199254740993').replace('58.219207', '58.219207000000000001');
  const plan = planPage(text, `/api/v1/observations?workspace_id=${WORKSPACE}&after=0&limit=1`,
    { workspaceId: WORKSPACE, runId: RUN, mappings: [{ simulationAstronautId: SOURCE, simulationCrewCode: original.value.items[0].envelope.crew_code }] });
  assert.ok(plan.batches[0].body.includes('9007199254740993')); assert.ok(plan.batches[0].body.includes('58.219207000000000001'));
});

test('snapshot continuation stays frozen as new observations arrive; next click uses checkpoint_url', async () => {
  const f = fixture(); f.state.rows = Array.from({ length: 120 }, (_, i) => row(i + 1));
  let appended = false;
  f.state.afterCommit = () => { if (!appended) { appended = true; f.state.rows.push(row(121)); } };
  const client = f.client(); await client.connect(ID); assert.equal(f.state.posts.length, 0);
  await assert.rejects(client.deliver(), { code: 'approval_required' });
  await client.deliver({ approved: true });
  assert.equal(client.state.confirmed.sequence, 120); assert.equal(client.state.counts.created, 120);
  assert.equal(new URL(client.state.resumeUrl, 'http://lab').searchParams.has('through'), false);
  const continuation = f.state.calls.find(call => call.path === exportUrl(WORKSPACE, 100, 120)); assert.ok(continuation);
  assert.equal(f.state.posts.length, 2);
  await client.deliver({ approved: true }); assert.equal(client.state.confirmed.sequence, 121); assert.equal(client.state.counts.created, 121);
});

test('network loss after commit preserves pending originals and reload retries exactly, using receipt duplicates', async () => {
  const f = fixture(); const first = f.client(); await first.connect(ID);
  f.state.afterCommit = () => { throw new TypeError('lost acknowledgement'); };
  await assert.rejects(first.deliver({ approved: true }), { code: 'connection' });
  assert.equal(first.state.confirmed.sequence, 0); assert.ok(first.state.pending); assert.equal(f.state.receipts.size, 1);
  const body = f.state.posts[0]; f.state.afterCommit = null;
  const restored = f.client(); await restored.connect(ID);
  assert.equal(f.state.posts.length, 1, 'connect/reload must not deliver automatically');
  await restored.deliver({ approved: true });
  assert.equal(f.state.posts[1], body); assert.equal(restored.state.counts.duplicates, 1); assert.equal(restored.state.confirmed.sequence, 1);
});

test('100-record and UTF-8 1 MiB limits split complete records without dropping data', async () => {
  const f = fixture(); f.state.rows = Array.from({ length: 100 }, (_, i) => row(i + 1, { padding: '界'.repeat(4000) }));
  const client = f.client(); await client.connect(ID); await client.deliver({ approved: true });
  assert.ok(f.state.posts.length > 1); assert.equal(client.state.confirmed.sequence, 100);
  assert.equal(f.state.posts.reduce((n, text) => n + JSON.parse(text).items.length, 0), 100);
  f.state.posts.forEach(text => { assert.ok(utf8Bytes(text) <= MAX_BODY); assert.ok(JSON.parse(text).items.length <= 100); });
  const rows = Array.from({ length: 201 }, (_, i) => ({ sequence: i + 1, rawEnvelope: ORIGINAL }));
  assert.deepEqual(makeBatches(WORKSPACE, rows).map(batch => batch.items.length), [100, 100, 1]);
  assert.throws(() => makeBatches(WORKSPACE, [{ sequence: 1, rawEnvelope: ' '.repeat(65537) }]), { code: 'record_size' });
});

for (const status of [401, 403, 409, 422, 503]) test(`${status} stops without checkpoint advancement or automatic retries`, async () => {
  const f = fixture(); f.state.reject = status; const client = f.client(); await client.connect(ID);
  await assert.rejects(client.deliver({ approved: true }), error => error.status === status);
  assert.equal(client.state.confirmed.sequence, 0); assert.ok(client.state.pending); assert.equal(f.state.posts.length, 1);
});

test('changed payload with the same source identity receives a conflict and retains the checkpoint', async () => {
  const f = fixture(); const client = f.client(); await client.connect(ID);
  f.state.afterCommit = () => { throw TypeError('lost reply'); };
  await assert.rejects(client.deliver({ approved: true })); f.state.afterCommit = null;
  const saved = JSON.parse(f.storage.getItem(client.key())); const page = JSON.parse(saved.pending.text);
  page.items[0].envelope.observation.simulation_metadata.tick = 999;
  saved.pending.text = JSON.stringify(page); f.storage.setItem(client.key(), JSON.stringify(saved));
  const restored = f.client(); await restored.connect(ID);
  await assert.rejects(restored.deliver({ approved: true }), { status: 409, code: 'receipt_conflict' });
  assert.equal(restored.state.confirmed.sequence, 0); assert.equal(f.state.receipts.size, 1);
});

test('restart/workspace change stops before any POST and never resets a saved cursor', async () => {
  const f = fixture(); const client = f.client(); await client.connect(ID);
  const saved = f.storage.getItem(client.key()); f.state.workspace = OTHER;
  await assert.rejects(client.deliver({ approved: true }), { code: 'workspace_changed' });
  assert.equal(f.state.posts.length, 0); assert.equal(f.storage.getItem(client.key()), saved);
  await assert.rejects(f.client().connect(ID), { code: 'workspace_changed' });
});

test('closed captures, wrong creator and unapproved profiles fail before submitting even valid earlier records', async () => {
  for (const problem of ['closed', 'owner', 'profile']) {
    const f = fixture(); const client = f.client(); await client.connect(ID);
    if (problem === 'closed') f.state.capture.status = 'CLOSED';
    if (problem === 'owner') f.state.capture.createdByAccountId = OTHER;
    if (problem === 'profile') f.state.rows.push(row(2, { source: OTHER }));
    await assert.rejects(client.deliver({ approved: true })); assert.equal(f.state.posts.length, 0); assert.equal(client.state.confirmed.sequence, 0);
  }
});

test('other run history is excluded with a separate scan cursor, never redirected or falsely confirmed', async () => {
  const f = fixture(); f.state.rows = [row(1), row(2, { run: OTHER })];
  const client = f.client(); await client.connect(ID); await client.deliver({ approved: true });
  assert.equal(client.state.counts.excluded, 1); assert.equal(client.state.confirmed.sequence, 1);
  assert.equal(new URL(client.state.resumeUrl, 'http://lab').searchParams.get('after'), '2');
  assert.equal(JSON.parse(f.state.posts[0]).items.length, 1);
  assert.equal(JSON.parse(f.state.posts[0]).items[0].envelope.observation.simulation_metadata.run_id, RUN);
});

test('malformed acknowledgements never advance confirmation; unchanged retry resolves the ambiguous commit', async () => {
  const f = fixture(); f.state.malformedAck = true; const client = f.client(); await client.connect(ID);
  await assert.rejects(client.deliver({ approved: true }), { code: 'backend_response' });
  assert.equal(client.state.confirmed.sequence, 0); f.state.malformedAck = false;
  await client.deliver({ approved: true }); assert.equal(client.state.counts.duplicates, 1);
});

test('storage quota failure before POST fails closed, and after commit retains the old durable outbox', async () => {
  const f = fixture(); const client = f.client(); await client.connect(ID); f.storage.failWrites = true;
  await assert.rejects(client.deliver({ approved: true }), { code: 'checkpoint_storage' }); assert.equal(f.state.posts.length, 0);
  f.storage.failWrites = false;
  f.state.afterCommit = () => { f.storage.failWrites = true; };
  await assert.rejects(client.deliver({ approved: true }), { code: 'checkpoint_storage' });
  assert.equal(JSON.parse(f.storage.getItem(client.key())).confirmed.sequence, 0);
  f.storage.failWrites = false; f.state.afterCommit = null;
  const next = f.client(); await next.connect(ID); await next.deliver({ approved: true }); assert.equal(next.state.counts.duplicates, 1);
});

test('Web Locks prevent competing workers, and stale tabs reload the latest durable checkpoint', async () => {
  const f = fixture(); let entered, release;
  const inside = new Promise(resolve => { entered = resolve; }), wait = new Promise(resolve => { release = resolve; });
  const a = f.client(), b = f.client(); await a.connect(ID); await b.connect(ID);
  f.state.afterCommit = async () => { entered(); await wait; };
  const running = a.deliver({ approved: true }); await inside;
  await assert.rejects(b.deliver({ approved: true }), { code: 'worker_locked' }); assert.equal(f.state.posts.length, 1);
  release(); await running; f.state.afterCommit = null;
  await b.deliver({ approved: true }); assert.equal(f.state.posts.length, 1, 'stale tab must resume after the confirmed page');
  const noLocks = f.client({ locks: null }); await assert.rejects(noLocks.connect(ID), { code: 'locks_unavailable' });
});

test('officer login rotates CSRF and secrets never enter Python calls or checkpoint storage', async () => {
  const f = fixture(); const client = f.client();
  await client.signIn('operator', 'ephemeral-test-password'); await client.connect(ID); await client.deliver({ approved: true });
  assert.ok(f.state.calls.filter(c => c.path.endsWith('/api/auth/csrf')).length >= 3);
  const stored = [...f.storage.data.values()].join('');
  assert.ok(!stored.includes('ephemeral-test-password')); assert.ok(!stored.includes(f.state.token));
  f.state.calls.filter(call => call.path.startsWith('/api/')).forEach(call => {
    assert.equal(call.options.credentials, 'omit'); assert.equal(call.options.body, undefined); assert.equal(call.options.headers, undefined);
  });
  await client.signOut(); assert.equal(client.state, null); assert.ok(f.storage.data.size > 0);
});

test('astronaut or unauthenticated browser sessions cannot authorize delivery', async () => {
  const f = fixture(); f.state.account.role = 'ASTRONAUT'; await assert.rejects(f.client().connect(ID), { code: 'officer_required' });
  f.state.accountStatus = 401; await assert.rejects(f.client().connect(ID), { status: 401 }); assert.equal(f.state.posts.length, 0);
});

test('malicious continuation links and mismatched stored capture bindings fail closed', async () => {
  const f = fixture(); const client = f.client(); await client.connect(ID);
  const saved = JSON.parse(f.storage.getItem(client.key())); saved.binding.runId = OTHER; f.storage.setItem(client.key(), JSON.stringify(saved));
  await assert.rejects(f.client().connect(ID), { code: 'checkpoint_binding' });
  for (const link of ['https://evil.invalid/api/v1/observations', '//evil.invalid/api/v1/observations', '/api/auth/login?x=1']) {
    const page = JSON.parse(exampleText); page.next_url = link;
    assert.throws(() => planPage(JSON.stringify(page), `/api/v1/observations?workspace_id=${WORKSPACE}&after=0&limit=1`,
      { workspaceId: WORKSPACE, runId: RUN, mappings: [{ simulationAstronautId: SOURCE, simulationCrewCode: page.items[0].envelope.crew_code }] }), { code: 'export_link' });
  }
});

test('Python proxy strips host-scoped session and CSRF/auth headers in dev and preview', () => {
  const removed = []; stripPythonCredentials({ removeHeader: key => removed.push(key) });
  assert.deepEqual(removed, ['cookie', 'authorization', 'proxy-authorization', 'x-csrf-token']);
  const hooks = {}; pythonProxy.configure({ on: (name, callback) => { hooks[name] = callback; } });
  const reply = { headers: { 'set-cookie': ['unwanted=value'], 'content-type': 'application/json' } }; hooks.proxyRes(reply);
  assert.equal(reply.headers['set-cookie'], undefined); assert.equal(reply.headers['content-type'], 'application/json');
});

test('reload after a later split-batch failure resumes only the unchanged unconfirmed batch', async () => {
  const f = fixture(); f.state.rows = Array.from({ length: 100 }, (_, i) => row(i + 1, { padding: '界'.repeat(4000) }));
  const first = f.client(); await first.connect(ID); let posts = 0;
  f.state.afterCommit = () => { if (++posts === 2) throw TypeError('second acknowledgement lost'); };
  await assert.rejects(first.deliver({ approved: true }));
  assert.equal(first.state.pending.batchIndex, 1); const confirmed = first.state.confirmed.sequence;
  assert.ok(confirmed > 0 && confirmed < 100); const pendingBody = f.state.posts[1];
  f.state.afterCommit = null; const next = f.client(); await next.connect(ID); await next.deliver({ approved: true });
  assert.equal(f.state.posts[2], pendingBody); assert.equal(next.state.confirmed.sequence, 100);
  assert.equal(next.state.counts.created, confirmed); assert.equal(next.state.counts.duplicates, 100 - confirmed);
});

test('explicit stop aborts an ambiguous POST and leaves durable originals for receipt-safe retry', async () => {
  const f = fixture(); const client = f.client(); await client.connect(ID); let entered;
  const inside = new Promise(resolve => { entered = resolve; });
  f.state.afterCommit = (batch, signal) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true }); entered();
  });
  const run = client.deliver({ approved: true }); await inside; client.stop();
  await assert.rejects(run, { name: 'AbortError' }); assert.equal(client.state.confirmed.sequence, 0); assert.ok(client.state.pending);
  assert.equal(client.running, false); f.state.afterCommit = null;
  await client.deliver({ approved: true }); assert.equal(client.state.counts.duplicates, 1);
});

test('different existing captures retain independent run cursors and are never automatically retargeted', async () => {
  const f = fixture(); f.state.rows = [row(1), row(2, { run: OTHER })]; const client = f.client();
  await client.connect(ID); await client.deliver({ approved: true }); const firstKey = client.key();
  f.state.capture.captureId = OTHER; f.state.capture.runId = OTHER;
  await client.connect(OTHER); assert.equal(client.state.confirmed.sequence, 0); assert.equal(f.state.posts.length, 1);
  await client.deliver({ approved: true });
  assert.equal(JSON.parse(f.state.posts[1]).items[0].envelope.observation.simulation_metadata.run_id, OTHER);
  assert.equal(JSON.parse(f.storage.getItem(firstKey)).confirmed.sequence, 1); assert.equal(f.storage.data.size, 2);
});

test('an incompatible CSRF endpoint is rejected before sending any officer password', async () => {
  const calls = [];
  const client = new DeliveryClient({ enabled: true, backendOrigin: ORIGIN, labOrigin: 'http://127.0.0.1:5173',
    fetchImpl: async (url, options) => { calls.push(options); return response({ synthetic: true }); } });
  await assert.rejects(client.signIn('operator', 'must-not-be-posted'), { code: 'csrf_contract' });
  assert.equal(calls.length, 1); assert.equal(calls[0].body, undefined);
});

test('default browser fetch retains its Window/global receiver', async () => {
  const originalFetch = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = function () { assert.equal(this, globalThis); calls++; return Promise.resolve(response({ synthetic: true })); };
    const client = new DeliveryClient({ enabled: true, backendOrigin: ORIGIN, labOrigin: 'http://127.0.0.1:5173' });
    await assert.rejects(client.signIn('operator', 'never-posted'), { code: 'csrf_contract' }); assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('unknown runs are refused even with no exported observations; retained history is not rebound', async () => {
  const f = fixture(); f.state.rows = []; f.state.capture.runId = OTHER;
  await assert.rejects(f.client().connect(ID), { status: 404 }); assert.equal(f.state.posts.length, 0); assert.equal(f.storage.data.size, 0);
});

test('first-time checkpoint initialization cannot overwrite progress while another worker holds the capture lock', async () => {
  const f = fixture(), owner = f.client(); await owner.connect(ID);
  const before = f.storage.getItem(owner.key());
  f.locks.held.add(`astrohealth.simulation.delivery|${owner.key()}`);
  await assert.rejects(f.client().connect(ID), { code: 'worker_locked' });
  assert.equal(f.storage.getItem(owner.key()), before);
});

test('null or duplicate capture mappings and malformed export items fail with stable public errors', async () => {
  for (const mappings of [null, [null], 'duplicate']) {
    const f = fixture();
    f.state.capture.mappings = mappings === 'duplicate' ? [f.state.capture.mappings[0], f.state.capture.mappings[0]] : mappings;
    await assert.rejects(f.client().connect(ID), { code: 'mapping_mismatch' }); assert.equal(f.state.posts.length, 0);
  }
  const page = JSON.parse(exampleText); page.items = [null];
  assert.throws(() => planPage(JSON.stringify(page), `/api/v1/observations?workspace_id=${WORKSPACE}&after=0&limit=1`,
    { workspaceId: WORKSPACE, runId: RUN, mappings: [] }), { code: 'export_format' });
});

test('a custom Python proxy port cannot be selected as Spring Boot or receive an officer session', () => {
  assert.throws(() => new DeliveryClient({ enabled: true, backendOrigin: 'http://127.0.0.1:18765', labOrigin: 'http://127.0.0.1:5173',
    pythonPort: 18765, fetchImpl: () => assert.fail('No request or cookie may reach Python') }), { code: 'configuration' });
  assert.throws(() => checkedBackendOrigin('http://127.0.0.1', 'http://127.0.0.1:5173', 80), { code: 'configuration' });
});
