// POST /api/emergency rules (lib/emergency.js processEmergencies), with an in-memory emergency_events
// table that does compare-and-set on `revision` like the route. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorize } from './syncCore.js';
import { addEvent, endEmergency, forServer, newEmergency, processEmergencies, switchToCollapse } from './emergency.js';

const NOW = new Date('2026-11-14T14:30:00.000Z');
const clock = () => NOW;
const T0 = '2026-11-14T14:02:00.000Z';
const at = (s) => new Date(Date.parse(T0) + s * 1000).toISOString();
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CREW = ['crew-01', 'crew-02', 'crew-03', 'crew-04'];
const MAYA = { crewId: 'crew-01', role: 'crew', name: 'Maya Okafor' };
const LENA = { crewId: 'crew-03', role: 'cmo', name: 'Lena Kowalski' };
const KWAME = { crewId: 'crew-04', role: 'crew', name: 'Kwame Asante' };

function fakeTable() {
  const rows = new Map();
  const copy = (v) => JSON.parse(JSON.stringify(v));
  return {
    rows,
    async find(id) {
      return rows.has(id) ? copy(rows.get(id)) : null;
    },
    async insert(row) {
      if (rows.has(row.id)) return false;
      rows.set(row.id, copy(row));
      return true;
    },
    async update(row, prev) {
      if (rows.get(row.id)?.revision !== prev) return false;
      rows.set(row.id, copy(row));
      return true;
    },
  };
}

const send = (db, who, ...ems) => processEmergencies({ emergencies: ems.map(forServer), ...who, db, knownCrew: CREW, clock });

const mayaReports = () =>
  newEmergency({ id: uuid(1), eventId: uuid(100), patientCrewId: 'crew-02', reporter: { crew_id: 'crew-01', name: 'Maya Okafor' }, flow: 'chest_pain', environment: 'station', drill: true, at: T0 });

test('the reporter must be the signed-in person; the server rebuilds the reporter from the session', async () => {
  const db = fakeTable();
  const forged = { ...mayaReports(), reporter: { crew_id: 'crew-02', name: 'Tomas Reyes' } };
  const [bad] = (await send(db, MAYA, forged)).results;
  assert.equal(bad.code, 403);
  assert.equal(db.rows.size, 0);

  const renamed = { ...mayaReports(), reporter: { crew_id: 'crew-01', name: 'Someone Else' } };
  const [ok] = (await send(db, MAYA, renamed)).results;
  assert.equal(ok.code, 201);
  assert.equal(db.rows.get(uuid(1)).reporter_crew_id, 'crew-01');
  assert.equal(db.rows.get(uuid(1)).reporter_name, 'Maya Okafor', 'name from the session, not the client');
  assert.deepEqual(ok.emergency.reporter, { crew_id: 'crew-01', name: 'Maya Okafor' });
});

test('any signed-in crew member may report for any crew id; unknown patients are rejected', async () => {
  const db = fakeTable();
  const forLena = { ...mayaReports(), patient_crew_id: 'crew-03' };
  assert.equal((await send(db, MAYA, forLena)).results[0].code, 201);
  const unknown = { ...mayaReports(), id: uuid(2), patient_crew_id: 'crew-99' };
  assert.equal((await send(db, MAYA, unknown)).results[0].code, 400);
});

test('upsert keeps one row: later events update the same row, a resent event is not duplicated', async () => {
  const db = fakeTable();
  let em = mayaReports();
  await send(db, MAYA, em);
  em = addEvent(em, { id: uuid(101), at: at(20), type: 'alert_sent', by: 'crew-01' });
  em = switchToCollapse(em, { id: uuid(102), at: at(60), by: 'crew-01' });
  const [r1] = (await send(db, MAYA, em)).results;
  assert.equal(r1.code, 200);
  const [r2] = (await send(db, MAYA, em)).results; // resent unchanged (e.g. a retry)
  assert.equal(r2.code, 200);
  assert.equal(db.rows.size, 1);
  const row = db.rows.get(uuid(1));
  assert.deepEqual(row.events.map((e) => e.id), [uuid(100), uuid(101), uuid(102)]);
  assert.equal(row.flow, 'collapse');
  assert.equal(row.started_at, T0);
});

test('the server sets `by` to the signed-in id on new events and ignores the client value; stored events never change', async () => {
  const db = fakeTable();
  let em = mayaReports();
  em = addEvent(em, { id: uuid(101), at: at(20), type: 'alert_sent', by: 'crew-02' }); // lies about who
  await send(db, MAYA, em);
  assert.equal(db.rows.get(uuid(1)).events.find((e) => e.id === uuid(101)).by, 'crew-01');
  // Lena resends Maya's event claiming it as hers with a new time and detail: the stored one is kept.
  const tampered = { ...em, events: em.events.map((e) => (e.id === uuid(101) ? { ...e, at: at(5), detail: 'changed', by: 'crew-03' } : e)) };
  await send(db, LENA, tampered);
  const stored = db.rows.get(uuid(1)).events.find((e) => e.id === uuid(101));
  assert.deepEqual(stored, { id: uuid(101), at: at(20), type: 'alert_sent', by: 'crew-01' });
});

test('the CMO appends events and ends it; the stored reporter never changes', async () => {
  const db = fakeTable();
  await send(db, MAYA, mayaReports());
  let lena = { ...mayaReports(), on_server: true };
  lena = addEvent(lena, { id: uuid(200), at: at(240), type: 'aed_arrived', by: 'crew-03' });
  lena = endEmergency(lena, { at: at(600), by: 'crew-03', note: 'Handed over to flight surgeon.', noteId: uuid(201) });
  const [r] = (await send(db, LENA, { ...lena, reporter: { crew_id: 'crew-03', name: 'Lena Kowalski' } })).results;
  assert.equal(r.code, 200);
  const row = db.rows.get(uuid(1));
  assert.equal(row.reporter_crew_id, 'crew-01');
  assert.equal(row.reporter_name, 'Maya Okafor');
  assert.equal(row.ended_at, at(600));
  assert.deepEqual(row.events.filter((e) => e.by === 'crew-03').map((e) => e.type), ['aed_arrived', 'note']);
});

test('crew who is neither the reporter nor the CMO gets 403 and changes nothing', async () => {
  const db = fakeTable();
  await send(db, MAYA, mayaReports());
  const before = JSON.stringify(db.rows.get(uuid(1)));
  const kwame = addEvent(mayaReports(), { id: uuid(300), at: at(30), type: 'note', detail: 'x' });
  const [r] = (await send(db, KWAME, kwame)).results;
  assert.equal(r.code, 403);
  assert.equal(JSON.stringify(db.rows.get(uuid(1))), before);
  // Even claiming to be the reporter does not help: the stored reporter decides.
  const [r2] = (await send(db, KWAME, { ...kwame, reporter: { crew_id: 'crew-04', name: 'Kwame Asante' } })).results;
  assert.equal(r2.code, 403);
});

test('two devices append different events and both are kept (also when they race)', async () => {
  const db = fakeTable();
  const base = mayaReports();
  await send(db, MAYA, base);
  const mayaCopy = addEvent(base, { id: uuid(401), at: at(120), type: 'compressions_started', by: 'crew-01' });
  const lenaCopy = addEvent({ ...base, on_server: true }, { id: uuid(402), at: at(100), type: 'note', by: 'crew-03', detail: 'Coming with AED' });
  await send(db, MAYA, mayaCopy);
  await send(db, LENA, lenaCopy);
  assert.deepEqual(db.rows.get(uuid(1)).events.map((e) => e.id), [uuid(100), uuid(402), uuid(401)], 'merged and sorted by time');

  // Race: Lena's write lands between Maya's read and Maya's write; Maya's compare-and-set retries.
  const raceDb = fakeTable();
  await send(raceDb, MAYA, base);
  const realFind = raceDb.find.bind(raceDb);
  let once = true;
  raceDb.find = async (id) => {
    const row = await realFind(id);
    if (once) {
      once = false;
      await send({ ...raceDb, find: realFind }, LENA, lenaCopy);
    }
    return row;
  };
  const [r] = (await send(raceDb, MAYA, mayaCopy)).results;
  assert.equal(r.code, 200);
  assert.deepEqual(raceDb.rows.get(uuid(1)).events.map((e) => e.id).sort(), [uuid(100), uuid(401), uuid(402)].sort());
});

test('ended_at cannot be cleared (409); a second end keeps the first', async () => {
  const db = fakeTable();
  const ended = endEmergency(mayaReports(), { at: at(300), by: 'crew-01' });
  await send(db, MAYA, ended);
  const [r] = (await send(db, MAYA, { ...ended, ended_at: null })).results;
  assert.equal(r.code, 409);
  await send(db, LENA, { ...ended, ended_at: at(500) });
  assert.equal(db.rows.get(uuid(1)).ended_at, at(300));
});

test('validation: bad shapes are 400; times more than 5 minutes ahead of the server clock are rejected', async () => {
  const db = fakeTable();
  const ok = mayaReports();
  const cases = [
    { ...ok, id: 'nope' },
    { ...ok, flow: 'headache' },
    { ...ok, environment: 'mars' },
    { ...ok, drill: 'yes' },
    { ...ok, events: [{ id: uuid(5), at: T0, type: 'teleport' }] },
    { ...ok, events: [{ id: 'x', at: T0, type: 'note' }] },
    { ...ok, events: [{ id: uuid(5), at: T0, type: 'note', detail: 'x'.repeat(501) }] },
    { ...ok, started_at: new Date(NOW.getTime() + 6 * 60 * 1000).toISOString() },
    { ...ok, ended_at: '2026-11-14T13:00:00.000Z' },
  ];
  for (const c of cases) assert.equal((await send(db, MAYA, c)).results[0].code, 400, JSON.stringify(c).slice(0, 80));
  const skewed = { ...ok, started_at: new Date(NOW.getTime() + 4 * 60 * 1000).toISOString(), events: [] };
  assert.equal((await send(db, MAYA, skewed)).results[0].code, 201, 'within 5 minutes of clock difference');
  assert.equal(db.rows.size, 1);
});

test('the route uses the same authorize(): no token is 401, an unlinked account is 403', async () => {
  const none = await authorize({ token: null, getUser: async () => null, crewForUser: async () => null });
  assert.equal(none.status, 401);
  const unlinked = await authorize({ token: 't', getUser: async () => ({ id: 'u1' }), crewForUser: async () => null });
  assert.equal(unlinked.status, 403);
  const lena = await authorize({ token: 't', getUser: async () => ({ id: 'u3' }), crewForUser: async () => ({ id: 'crew-03', role: 'cmo', name: 'Lena Kowalski' }) });
  assert.deepEqual([lena.crewId, lena.role, lena.name], ['crew-03', 'cmo', 'Lena Kowalski']);
});
