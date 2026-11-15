// Access log: local list (throttled, last 50), unsynced entries retried, and the server rule that only
// the CMO logs views, as themselves, of someone else. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LOCAL_ENTRIES,
  THROTTLE_MS,
  accessText,
  addAccess,
  markSynced,
  mergeLog,
  processAccess,
  readLog,
  recentAccess,
  unsyncedEntries,
  viewsOf,
  writeLog,
} from './accessLog.js';
import { crewNameFor } from './provenance.js';
import { NOW, testUuid } from './testSupport.js';

const T0 = Date.parse('2026-11-13T11:00:00.000Z');
const at = (ms) => new Date(ms).toISOString();
const view = (patient, ms, viewer = 'crew-03') => ({ id: testUuid(), viewer, patient, at: at(ms) });

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('one entry per viewer and patient every 10 minutes; other patients are logged', () => {
  let list = [];
  list = addAccess(list, view('crew-02', T0)).list;
  const again = addAccess(list, view('crew-02', T0 + THROTTLE_MS - 1000));
  assert.equal(again.added, null);
  list = addAccess(list, view('crew-01', T0 + 60_000)).list;
  list = addAccess(list, view('crew-02', T0 + THROTTLE_MS)).list;
  assert.deepEqual(list.map((e) => e.patient), ['crew-02', 'crew-01', 'crew-02']);
  assert.ok(list.every((e) => e.synced === false));
});

test('opening your own data is never logged; the list keeps the newest 50', () => {
  assert.equal(addAccess([], view('crew-03', T0)).added, null);
  let list = [];
  for (let i = 0; i < 60; i += 1) list = addAccess(list, view('crew-02', T0 + i * THROTTLE_MS)).list;
  assert.equal(list.length, MAX_LOCAL_ENTRIES);
  assert.equal(list[0].at, at(T0 + 59 * THROTTLE_MS));
});

test('unsynced entries are sent oldest first; a failed POST keeps them for the next open', () => {
  let list = [];
  for (const [p, ms] of [['crew-02', T0], ['crew-01', T0 + 1000], ['crew-04', T0 + 2000]]) list = addAccess(list, view(p, ms)).list;
  const pending = unsyncedEntries(list);
  assert.deepEqual(pending.map((e) => e.patient), ['crew-02', 'crew-01', 'crew-04']);
  // POST failed: nothing is marked, so the same entries are pending next time.
  assert.equal(unsyncedEntries(list).length, 3);
  list = markSynced(list, [pending[0].id, pending[1].id]);
  assert.deepEqual(unsyncedEntries(list).map((e) => e.patient), ['crew-04']);
});

test('stored locally and read back; broken or blocked storage gives an empty list', () => {
  const storage = memoryStorage();
  const { list } = addAccess([], view('crew-02', T0));
  assert.equal(writeLog(storage, list), true);
  assert.deepEqual(readLog(storage), list);
  storage.setItem('ahm.accessLog.v1', '{not json');
  assert.deepEqual(readLog(storage), []);
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(readLog(blocked), []);
  assert.equal(writeLog(blocked, list), false);
});

test('recent access, views of one person, merging with the server, and the line text', () => {
  const local = [view('crew-02', T0 + 2000), view('crew-01', T0 + 1000)].map((e) => ({ ...e, synced: false }));
  const server = [{ ...local[0] }, view('crew-02', T0)];
  const merged = mergeLog(server, local);
  assert.equal(merged.length, 3);
  assert.ok(merged.find((e) => e.id === local[0].id).synced);
  assert.equal(recentAccess(merged, 2).length, 2);
  assert.deepEqual(viewsOf(merged, 'crew-02').map((e) => e.at), [at(T0 + 2000), at(T0)]);
  assert.match(accessText(merged[0], crewNameFor), /^Lena viewed Tomas · /);
});

test('server: only the CMO logs, only as themselves, only someone else; bad entries are 400', async () => {
  const rows = [];
  const db = { insertAccess: async (r) => rows.push(r) };
  const good = view('crew-02', T0);
  const run = (entries, crewId, role) => processAccess({ entries, crewId, role, db, clock: () => NOW });

  assert.deepEqual((await run([good], 'crew-03', 'cmo')).results.map((r) => r.code), [201]);
  assert.deepEqual(rows, [{ id: good.id, viewer: 'crew-03', patient: 'crew-02', at: good.at }]);

  const refused = await run([view('crew-02', T0, 'crew-01')], 'crew-01', 'crew');
  assert.equal(refused.results[0].code, 403);
  const forged = await run([view('crew-02', T0, 'crew-01')], 'crew-03', 'cmo');
  assert.equal(forged.results[0].code, 403);
  const bad = await run([{ ...good, id: 'x' }, view('crew-03', T0), { ...good, at: '2027-01-01T00:00:00Z' }], 'crew-03', 'cmo');
  assert.deepEqual(bad.results.map((r) => r.code), [400, 400, 400]);
  assert.equal(rows.length, 1);
});
