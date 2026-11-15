// The ground data adapter, over the bundled data and an in-memory browser storage. Run with: npm test
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildCrewCards, mergeReadings } from '../../lib/cmoSummary.js';
import { sensorRecords } from '../../lib/sensorRecords.js';
import { sensorDaysUntil } from '../../lib/sensorFeed.js';
import { DEMO_KEY } from '../../lib/demoState.js';
import { EMERGENCY_KEY } from '../../lib/emergency.js';
import { getProfile } from '../../constants/mission.js';
import { createLocalGroundSource } from './groundSource.js';
import { LAST_CREW_DATE, crewDaysOf, deviceSeed } from './data.js';
import { PROFILE_KEY } from './delay.js';
import { VITALS_KEY, checkin, emergency, exam, memoryStorage, useWindowStorage } from './testFixtures.js';
import { addDays } from '../../lib/sensorFeed.js';

const REAL = new Date('2026-11-14T15:00:00.000Z');
const DAY1 = addDays(LAST_CREW_DATE, 1); // the demo's first "today" (dayOffset 1)
let storage;
let restore;

const source = () => createLocalGroundSource({ storage, realNow: () => REAL, newId: () => 'msg-1' });

beforeEach(() => {
  storage = memoryStorage();
  restore = useWindowStorage(storage);
});
afterEach(() => restore());

test('crew list matches the Crew tab (buildCrewCards over the same readings)', () => {
  const seed = deviceSeed();
  const demo = { dayOffset: 1, events: [] };
  const sensors = seed.crew.flatMap((c) =>
    sensorRecords({ crewId: c.id, crewDays: crewDaysOf(c.id), sensorDays: sensorDaysUntil({ crewId: c.id, crewDays: crewDaysOf(c.id), untilDate: DAY1, demo }), saved: [] }),
  );
  const expected = buildCrewCards({ crew: seed.crew, readings: [...mergeReadings(seed.readings, []), ...sensors], baselines: seed.baselines });
  const got = source().crewList();
  assert.equal(got.length, 4);
  assert.deepEqual(got.map((m) => [m.id, m.status]), expected.map((c) => [c.id, c.status]));
  assert.deepEqual(got[0].reasons, expected[0].vitals.reasons);
});

test('an open emergency sorts first, then alert, watch, normal', () => {
  storage.setItem(EMERGENCY_KEY, JSON.stringify([emergency({ id: 'em-1', patient: 'crew-03', started: '2026-11-14T14:50:00.000Z' })]));
  const list = source().crewList();
  assert.equal(list[0].id, 'crew-03');
  assert.deepEqual(list[0].openEmergency, { id: 'em-1', drill: false });
  const rank = { alert: 0, watch: 1, normal: 2 };
  const rest = list.slice(1).map((m) => rank[m.status]);
  assert.deepEqual(rest, [...rest].sort());
});

test('arrival and freshness use the profile delay and the demo clock', () => {
  storage.setItem(PROFILE_KEY, JSON.stringify('mars'));
  const maya = source().crewMember('crew-01');
  assert.equal(maya.lastRecordedAt, `${DAY1}T06:00:00.000Z`); // the simulated sensor day
  assert.equal(Date.parse(maya.lastArrivedAt) - Date.parse(maya.lastRecordedAt), getProfile('mars').delaySeconds * 1000);
  assert.equal(maya.freshness.state, 'fresh'); // demo now = DAY1 at 15:00
  const info = source().info();
  assert.equal(info.today, DAY1);
  assert.equal(info.delayLabel, 'Mars transit · signal about 20 min one way');
});

test('advancing the demo day moves the timeline and the trends', () => {
  const before = source().timelineFor('crew-01').at(-1).date;
  storage.setItem(DEMO_KEY, JSON.stringify({ dayOffset: 3, events: [] }));
  const after = source().timelineFor('crew-01');
  assert.equal(before, DAY1);
  assert.equal(after.at(-1).date, addDays(LAST_CREW_DATE, 3));
  const trends = source().trendsFor('crew-01');
  assert.equal(trends.length, 6);
  assert.equal(trends[0].values.length, 14);
  assert.equal(trends[0].dates.at(-1), addDays(LAST_CREW_DATE, 3));
});

test('records: check-ins and exams with provenance and entered_by; future ones hidden', () => {
  const at = `${DAY1}T09:00:00.000Z`;
  storage.setItem(
    VITALS_KEY,
    JSON.stringify([
      checkin({ id: 'c1', crewId: 'crew-02', at, reading: { systolic: 120, diastolic: 80, heart_rate: 70 }, provenance: { systolic: 'sensor', diastolic: 'sensor', heart_rate: 'manual' }, enteredBy: { crew_id: 'crew-02', name: 'Tomas Reyes', role: 'crew' } }),
      exam({ id: 'x1', crewId: 'crew-02', at: `${DAY1}T10:00:00.000Z`, reading: { heart_rate: 72, temperature: 36.9 }, note: 'Resting' }),
      checkin({ id: 'later', crewId: 'crew-02', at: `${addDays(DAY1, 5)}T09:00:00.000Z`, reading: { heart_rate: 70 } }),
    ]),
  );
  const recs = source().recordsFor('crew-02');
  assert.deepEqual(recs.map((r) => [r.id, r.kind]), [['x1', 'exam'], ['c1', 'checkin']]);
  assert.equal(recs[0].entered_by.name, 'Lena Kowalski');
  assert.equal(recs[0].note, 'Resting');
  assert.deepEqual(recs[0].chips.map((c) => c.kind), ['exam']);
  assert.deepEqual(recs[1].chips.map((c) => c.kind), ['sensor', 'manual']);
  assert.deepEqual(recs[1].values.map((v) => v.value), ['120/80', '70']);
  // The exam lands in the timeline exactly as buildTimeline merges it.
  const day = source().timelineFor('crew-02').find((d) => d.date === DAY1);
  assert.equal(day.provenance.temperature, 'cmo_exam');
});

test('emergencies come with their handoff summary; band follows the open one', () => {
  storage.setItem(EMERGENCY_KEY, JSON.stringify([emergency({ id: 'em-1', started: '2026-11-14T14:50:00.000Z', drill: true })]));
  const [em] = source().emergencies();
  assert.equal(em.id, 'em-1');
  assert.match(em.summary, /DRILL/);
  assert.match(em.summary, /Latest readings for Tomas/);
  assert.equal(source().band().kind, 'drill');
});

test('sendMessage validates, stamps the arrival and saves; messages() adds status', () => {
  storage.setItem(PROFILE_KEY, JSON.stringify('mars'));
  assert.equal(source().sendMessage({ to: 'cmo', subject: '', body: 'x' }).ok, false);
  assert.match(source().sendMessage({ to: 'cmo', subject: 'Hi', body: 'x'.repeat(1001) }).error, /1000/);
  const res = source().sendMessage({ to: 'cmo', subject: 'Exam', body: 'Please record an exam.', priority: 'urgent', related: { kind: 'emergency', id: 'em-1' } });
  assert.equal(res.ok, true);
  assert.equal(res.message.arrives_at, '2026-11-14T15:20:00.000Z');
  const [m] = source().messages();
  assert.equal(m.id, 'msg-1');
  assert.equal(m.status.text, 'In transit (arrives in 20 min)');
});

test('one source notices new check-ins and a new demo day (cache follows storage)', () => {
  const src = source();
  const before = src.crewMember('crew-04').lastRecordedAt;
  const at = `${DAY1}T12:00:00.000Z`;
  storage.setItem(VITALS_KEY, JSON.stringify([checkin({ id: 'c9', crewId: 'crew-04', at, reading: { heart_rate: 66 } })]));
  assert.notEqual(before, at);
  assert.equal(src.crewMember('crew-04').lastRecordedAt, at);
  storage.setItem(DEMO_KEY, JSON.stringify({ dayOffset: 2, events: [] }));
  assert.equal(src.info().today, addDays(LAST_CREW_DATE, 2));
  assert.equal(src.timelineFor('crew-01').at(-1).date, addDays(LAST_CREW_DATE, 2));
});

test('environment is environment.json', () => {
  assert.match(source().environment().source, /Environment/);
});
