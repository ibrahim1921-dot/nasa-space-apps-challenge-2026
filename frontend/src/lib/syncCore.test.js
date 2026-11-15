// POST /api/sync core: who may store what. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorize, processBatch } from './syncCore.js';
import { NOW, fakeDb, preflightOf, testUuid } from './testSupport.js';

const READING = { systolic: 112, diastolic: 76, heart_rate: 64, glucose: 88, temperature: 36.7, sleep_hours: 7.1, mood: 4 };
const daily = (crewId, extra = {}) => ({
  id: testUuid(),
  crew_id: crewId,
  kind: 'daily_vitals',
  recorded_at: '2026-11-13T09:00:00.000Z',
  payload: { reading: { ...READING }, context: null },
  ...extra,
});
const run = (db, readings, crewId = 'crew-01') =>
  processBatch({ readings, crewId, db, preflightFor: preflightOf, clock: () => NOW });

test('Maya submitting a reading for Tomas gets 403 for that reading, and nothing is stored', async () => {
  const db = fakeDb();
  const before = db.rows.size;
  const item = daily('crew-02');
  const { results } = await run(db, [item], 'crew-01');
  assert.equal(results.length, 1);
  assert.equal(results[0].id, item.id);
  assert.equal(results[0].code, 403);
  assert.equal(results[0].result, 'rejected');
  assert.match(results[0].error, /for crew-02, but you are signed in as crew-01/);
  assert.equal(db.rows.size, before);
  assert.equal(db.insertCalls, 0);
});

test('a mixed batch: Maya’s own reading is stored (201), the one for Tomas is refused (403)', async () => {
  const db = fakeDb();
  const mine = daily('crew-01');
  const his = daily('crew-02');
  const { results } = await run(db, [his, mine]);
  assert.deepEqual(
    results.map((r) => [r.id, r.code, r.result]),
    [
      [his.id, 403, 'rejected'],
      [mine.id, 201, 'stored'],
    ],
  );
  assert.equal(db.rows.get(mine.id).crew_id, 'crew-01');
  assert.equal(db.rows.has(his.id), false);
});

test('an id that belongs to another crew member is refused with 403, not echoed', async () => {
  const db = fakeDb();
  const tomas = daily('crew-02');
  await run(db, [tomas], 'crew-02');
  const { results } = await run(db, [{ ...tomas, crew_id: 'crew-01' }], 'crew-01');
  assert.equal(results[0].code, 403);
  assert.equal(results[0].status, undefined);
});

test('invalid readings come back 400 per reading and are not stored', async () => {
  const db = fakeDb();
  const bad = [
    { ...daily('crew-01'), id: 'not-a-uuid' },
    { ...daily('crew-01'), kind: 'sleep_night' },
    { ...daily('crew-01'), payload: { reading: { ...READING, systolic: 400 } } },
    { ...daily('crew-01'), recorded_at: '2027-01-01T00:00:00.000Z' },
    { ...daily('crew-01'), kind: 'stand_test', payload: { symptoms: ['dizzy'] } },
  ];
  const { results } = await run(db, bad);
  assert.deepEqual(results.map((r) => r.code), [400, 400, 400, 400, 400]);
  assert.equal(db.insertCalls, 0);
});

test('authorize: no token → 401, bad token → 401, account without a crew member → 403', async () => {
  const getUser = async (t) => (t === 'good' || t === 'orphan' ? { id: t } : null);
  const crewForUser = async (id) => (id === 'good' ? 'crew-01' : null);
  assert.equal((await authorize({ token: null, getUser, crewForUser })).status, 401);
  assert.equal((await authorize({ token: 'expired', getUser, crewForUser })).status, 401);
  assert.equal((await authorize({ token: 'orphan', getUser, crewForUser })).status, 403);
  assert.deepEqual(await authorize({ token: 'good', getUser, crewForUser }), { status: 200, crewId: 'crew-01', userId: 'good' });
});

test('stored rows are marked origin "device", so the demo reset can tell them from the seed', async () => {
  const db = fakeDb();
  const item = daily('crew-01');
  item.payload.origin = 'seed'; // a device cannot pass its reading off as seeded
  await run(db, [item]);
  assert.equal(db.rows.get(item.id).payload.origin, 'device');
});
