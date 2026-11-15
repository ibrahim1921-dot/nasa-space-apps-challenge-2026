// CMO exams through POST /api/sync and the outbox: who may store an exam for whom, what an exam may
// hold, idempotent retries, and device/server agreement on the merged day. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorize, checkAuthor, processBatch } from './syncCore.js';
import { SCORED_ON, sameResult, scoreCheckin } from './scoring.js';
import { addDays, sensorDaysUntil } from './sensorFeed.js';
import { sensorRecords } from './sensorRecords.js';
import { validateProvenance } from './provenance.js';
import { dueRecords, nextDueAt, senderOf, syncOnce, toSyncReading } from './outbox.js';
import { NOW, crewDaysOf, fakeDb, preflightOf, testUuid } from './testSupport.js';

const AT = `${addDays('2026-10-30', 4)}T14:02:00.000Z`;
const NULLS = { systolic: null, diastolic: null, heart_rate: null, glucose: null, temperature: null, sleep_hours: null, mood: null };
const FULL = { systolic: 112, diastolic: 76, heart_rate: 64, glucose: 88, temperature: 36.7, sleep_hours: 7.1, mood: 4 };
const LENA = { crew_id: 'crew-03', name: 'Lena Kowalski', role: 'cmo' };
const MAYA = { crew_id: 'crew-01', name: 'Maya Okafor', role: 'crew' };
const DEVICES = { shirt: 'ok', cgm: 'ok', headband: 'ok', actigraph: 'ok' };

const exam = (payload = {}, extra = {}) => ({
  id: testUuid(),
  crew_id: 'crew-02',
  kind: 'daily_vitals',
  recorded_at: AT,
  payload: {
    reading: { ...NULLS, temperature: 38.4 },
    context: null,
    kind_detail: 'cmo_exam',
    entered_by: LENA,
    provenance: { temperature: 'cmo_exam' },
    devices: DEVICES,
    demo_events: [],
    note: 'Feels warm, headache since noon.',
    ...payload,
  },
  ...extra,
});
const asLena = (db, readings) => processBatch({ readings, crewId: 'crew-03', role: 'cmo', name: 'Lena Kowalski', db, preflightFor: preflightOf, clock: () => NOW });
const asMaya = (db, readings) => processBatch({ readings, crewId: 'crew-01', role: 'crew', name: 'Maya Okafor', db, preflightFor: preflightOf, clock: () => NOW });

// ---------- Server authorisation ----------

test('a CMO exam for a crew member is accepted and stored for the patient, entered by the CMO', async () => {
  const db = fakeDb();
  const item = exam();
  const { results } = await asLena(db, [item]);
  assert.equal(results[0].code, 201, results[0].error);
  const row = db.rows.get(item.id);
  assert.equal(row.crew_id, 'crew-02');
  assert.equal(row.payload.kind_detail, 'cmo_exam');
  assert.deepEqual(row.payload.entered_by, LENA);
  assert.deepEqual(row.payload.provenance, { temperature: 'cmo_exam' });
  assert.equal(row.payload.note, 'Feels warm, headache since noon.');
  assert.equal(row.payload.context, null);
  assert.equal(row.status, 'alert');
});

test('the examiner stored is the signed-in CMO from crew_members, not the name the device sent', async () => {
  const db = fakeDb();
  const item = exam({ entered_by: { crew_id: 'crew-03', name: 'Somebody Else', role: 'crew' } });
  await asLena(db, [item]);
  assert.deepEqual(db.rows.get(item.id).payload.entered_by, LENA);
});

test('a crew member posting a reading for someone else is rejected (403), with a clear message', async () => {
  const db = fakeDb();
  const item = { id: testUuid(), crew_id: 'crew-02', kind: 'daily_vitals', recorded_at: AT, payload: { reading: FULL, context: null } };
  const { results } = await asMaya(db, [item]);
  assert.equal(results[0].code, 403);
  assert.match(results[0].error, /Only the Crew Medical Officer can record an exam for another crew member/);
  assert.equal(db.insertCalls, 0);
});

test('a forged entered_by is rejected: crew claiming to be the CMO, or the CMO naming someone else', async () => {
  const db = fakeDb();
  const { results } = await asMaya(db, [exam(), exam({}, { crew_id: 'crew-01' })]);
  assert.deepEqual(results.map((r) => r.code), [403, 403]);
  const second = await asLena(db, [exam({ entered_by: MAYA })]);
  assert.equal(second.results[0].code, 403);
  assert.equal(db.insertCalls, 0);
});

test('a CMO reading for someone else without kind_detail is rejected (403)', async () => {
  const db = fakeDb();
  const { kind_detail: _k, note: _n, ...payload } = exam().payload;
  const plain = { ...exam(), payload: { ...payload, provenance: { temperature: 'manual' } } };
  const { results } = await asLena(db, [plain]);
  assert.equal(results[0].code, 403);
  assert.match(results[0].error, /must be an exam/);
});

test('the CMO cannot examine herself (403)', async () => {
  const { results } = await asLena(fakeDb(), [exam({}, { crew_id: 'crew-03' })]);
  assert.equal(results[0].code, 403);
  assert.equal(results[0].error, 'An exam must be for another crew member.');
});

test('the role comes from crew_members: the same exam from a non-CMO session is rejected', () => {
  assert.equal(checkAuthor(exam(), { crewId: 'crew-03', role: 'cmo' }), null);
  assert.equal(checkAuthor(exam(), { crewId: 'crew-03', role: 'crew' }).code, 403);
  assert.equal(checkAuthor(exam(), { crewId: 'crew-03' }).code, 403);
});

test('authorize passes on the crew_members role when given one, and keeps the old shape otherwise', async () => {
  const getUser = async () => ({ id: 'u3' });
  const who = await authorize({ token: 't', getUser, crewForUser: async () => ({ id: 'crew-03', role: 'cmo', name: 'Lena Kowalski' }) });
  assert.deepEqual(who, { status: 200, crewId: 'crew-03', userId: 'u3', role: 'cmo', name: 'Lena Kowalski' });
});

test('an idempotent retry returns already_stored; the same id from anyone else is refused without details', async () => {
  const db = fakeDb();
  const item = exam();
  await asLena(db, [item]);
  const again = await asLena(db, [item]);
  assert.equal(again.results[0].code, 200);
  assert.equal(again.results[0].result, 'already_stored');
  assert.equal(db.insertCalls, 1);

  // Tomas posting the same id as his own reading: no status, no reasons, just 403.
  const tomas = await processBatch({
    readings: [{ ...item, payload: { reading: FULL, context: null } }],
    crewId: 'crew-02',
    role: 'crew',
    db,
    preflightFor: preflightOf,
    clock: () => NOW,
  });
  assert.equal(tomas.results[0].code, 403);
  assert.equal(tomas.results[0].status, undefined);
});

test('device and server agree on an exam merged into a sensor day, and match the dashboard’s merged day', async () => {
  const events = [{ crewId: 'crew-02', type: 'fever', startOffset: 3 }];
  const crewDays = crewDaysOf('crew-02');
  const sensorDays = sensorDaysUntil({ crewId: 'crew-02', crewDays, untilDate: AT.slice(0, 10), demo: { events } });
  const reading = { ...NULLS, temperature: 38.4 };
  const device = scoreCheckin({ crewId: 'crew-02', reading, crewDays, sensorDays, at: AT, scoredOn: SCORED_ON.device, kindDetail: 'cmo_exam' });

  const db = fakeDb();
  const item = exam({ result: device, demo_events: events }, { device_result: device });
  const { results } = await asLena(db, [item]);
  assert.equal(results[0].code, 201, results[0].error);
  assert.equal(results[0].server_differs, false);
  assert.ok(sameResult(device, results[0].official));
  for (const k of ['status', 'indicators', 'order', 'reasons', 'needs_attention', 'missing', 'history_days', 'day_reading']) {
    assert.deepEqual(results[0].official[k], device[k], k);
  }
  const record = { ...item, payload: { ...item.payload, result: device } };
  const merged = sensorRecords({ crewId: 'crew-02', crewDays, sensorDays, saved: [record] }).at(-1);
  assert.equal(merged.payload.day.date, AT.slice(0, 10));
  for (const k of ['status', 'indicators', 'reasons', 'needs_attention', 'missing']) {
    assert.deepEqual(merged.payload.result[k], results[0].official[k], `dashboard ${k}`);
  }
});

test('the server scores an exam against the patient’s history, not the CMO’s', async () => {
  const db = fakeDb();
  const { results } = await asLena(db, [exam({ devices: undefined, demo_events: undefined })]);
  const tomas = scoreCheckin({ crewId: 'crew-02', reading: { ...NULLS, temperature: 38.4 }, crewDays: crewDaysOf('crew-02'), at: AT, scoredOn: SCORED_ON.server, kindDetail: 'cmo_exam' });
  assert.ok(sameResult(results[0].official, tomas));
  assert.equal(results[0].official.crew_id, 'crew-02');
});

// ---------- Provenance validation ----------

test('exam provenance: only measured fields, all cmo_exam; no mood, sleep or context; note ≤ 280', () => {
  const ok = exam().payload;
  assert.equal(validateProvenance(ok), null);
  const bad = {
    'cmo_exam on a check-in': { ...ok, kind_detail: undefined },
    'unknown kind_detail': { ...ok, kind_detail: 'cmo_visit' },
    'sensor value in an exam': { ...ok, reading: { ...ok.reading, heart_rate: 70 }, provenance: { temperature: 'cmo_exam', heart_rate: 'sensor' } },
    'measured value without provenance': { ...ok, reading: { ...ok.reading, heart_rate: 70 } },
    'provenance without a value': { ...ok, provenance: { temperature: 'cmo_exam', glucose: 'cmo_exam' } },
    'mood in an exam': { ...ok, reading: { ...ok.reading, mood: 3 } },
    'sleep in an exam': { ...ok, reading: { ...ok.reading, sleep_hours: 6 } },
    'context in an exam': { ...ok, context: { notes: 'x' } },
    'nothing measured': { ...ok, reading: { ...NULLS }, provenance: {} },
    'no entered_by': { ...ok, entered_by: undefined },
    'note too long': { ...ok, note: 'x'.repeat(281) },
    'note not text': { ...ok, note: 42 },
  };
  for (const [name, payload] of Object.entries(bad)) assert.notEqual(validateProvenance(payload), null, name);
  assert.equal(validateProvenance({ ...ok, note: 'x'.repeat(280) }), null);
});

test('old records are unchanged: no kind_detail, sensor/manual provenance still valid', () => {
  assert.equal(validateProvenance({ reading: FULL, provenance: { systolic: 'sensor', mood: 'manual' }, entered_by: MAYA }), null);
  assert.equal(validateProvenance({ reading: FULL }), null);
});

test('invalid exams come back 400 from the server and are not stored', async () => {
  const db = fakeDb();
  const { results } = await asLena(db, [exam({ reading: { ...NULLS, temperature: 38.4, mood: 2 } }), exam({ provenance: { temperature: 'sensor' } })]);
  assert.deepEqual(results.map((r) => r.code), [400, 400]);
  assert.equal(db.insertCalls, 0);
});

// ---------- Outbox ----------

const local = (over = {}) => ({ id: testUuid(), crew_id: 'crew-01', kind: 'daily_vitals', recorded_at: AT, payload: { reading: FULL, context: null }, status: 'normal', reasons: [], engine_version: 'x', synced_at: null, ...over });

test('the outbox sends an exam with the CMO who entered it, never with the patient or anyone else', () => {
  const examRecord = local({ crew_id: 'crew-02', payload: exam().payload });
  const mine = local();
  const tomasOwn = local({ crew_id: 'crew-02' });
  const records = [examRecord, mine, tomasOwn];
  const now = Date.parse(AT);
  assert.equal(senderOf(examRecord), 'crew-03');
  assert.deepEqual(dueRecords(records, 'crew-03', {}, now).map((r) => r.id), [examRecord.id]);
  assert.deepEqual(dueRecords(records, 'crew-02', {}, now).map((r) => r.id), [tomasOwn.id]);
  assert.deepEqual(dueRecords(records, 'crew-01', {}, now).map((r) => r.id), [mine.id]);
  assert.equal(nextDueAt(records, 'crew-03', { [examRecord.id]: { next_at: now + 5000 } }), now + 5000);
  assert.equal(nextDueAt([examRecord], 'crew-02', {}), null);
  // A record that only claims an author without being an exam goes with its crew member, as before.
  assert.equal(senderOf(local({ crew_id: 'crew-02', payload: { reading: FULL, entered_by: LENA } })), 'crew-02');
});

test('the outbox sends kind_detail and the note, and the server answer is applied to the exam', async () => {
  const examRecord = local({ crew_id: 'crew-02', payload: { ...exam().payload, result: {} } });
  const sent = toSyncReading(examRecord);
  assert.equal(sent.crew_id, 'crew-02');
  assert.equal(sent.payload.kind_detail, 'cmo_exam');
  assert.equal(sent.payload.note, 'Feels warm, headache since noon.');
  assert.deepEqual(sent.payload.entered_by, LENA);

  const db = fakeDb();
  const out = await syncOnce({
    records: [examRecord],
    crewId: 'crew-03',
    state: {},
    now: Date.parse(AT),
    send: (readings) => asLena(db, readings),
  });
  assert.equal(out.sent, 1);
  assert.equal(out.updated.length, 1);
  assert.ok(out.updated[0].synced_at);
  assert.equal(out.updated[0].scored_on, 'server');
});
