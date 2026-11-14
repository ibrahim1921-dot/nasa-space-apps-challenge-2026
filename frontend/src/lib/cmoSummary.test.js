// Crew Medical Officer view logic. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCrewCards, flaggedFeed, mergeReadings, preflightVsNow, statusCounts } from './cmoSummary.js';
import { seedAll } from './seedRows.js';
import { crewFile, standFile } from './testSupport.js';

const seed = seedAll(crewFile, standFile);
const withIds = seed.readings.map((r) => ({ ...r, id: r.key }));

const entered = (crew_id, status, recorded_at, reading = {}) => ({
  id: `${crew_id}-${recorded_at}`,
  crew_id,
  kind: 'daily_vitals',
  recorded_at,
  status,
  reasons: [`${status} reason`],
  payload: { reading: { systolic: 120, diastolic: 80, heart_rate: 70, sleep_hours: 6, ...reading } },
});

test('one card per crew member, worst first', () => {
  const readings = [
    ...withIds,
    entered('crew-04', 'alert', '2026-11-13T08:00:00.000Z'),
    entered('crew-02', 'watch', '2026-11-13T08:00:00.000Z'),
    entered('crew-01', 'normal', '2026-11-13T08:00:00.000Z'),
    entered('crew-03', 'normal', '2026-11-13T08:00:00.000Z'),
  ];
  const cards = buildCrewCards({ crew: seed.crew, readings, baselines: seed.baselines });
  assert.deepEqual(cards.map((c) => c.id), ['crew-04', 'crew-02', 'crew-01', 'crew-03']);
  assert.deepEqual(statusCounts(cards), { alert: 1, watch: 1, normal: 2 });
});

test('a seeded preflight stand test is shown for reference but does not set the card status', () => {
  const cards = buildCrewCards({ crew: seed.crew, readings: withIds, baselines: seed.baselines });
  for (const c of cards) {
    assert.equal(c.standIsPreflight, true);
    assert.equal(c.stand.payload.timepoint, 'L-90');
    assert.equal(c.status, c.vitals.status);
  }
  const inFlight = { id: 'st1', crew_id: 'crew-01', kind: 'stand_test', recorded_at: '2026-11-13T09:00:00.000Z', status: 'alert', reasons: [], payload: {} };
  const maya = buildCrewCards({ crew: seed.crew, readings: [...withIds, inFlight], baselines: seed.baselines }).find((c) => c.id === 'crew-01');
  assert.equal(maya.status, 'alert');
  assert.equal(maya.standIsPreflight, false);
});

test('"Preflight vs now" for sleep, resting heart rate and blood pressure, from the baseline row', () => {
  const baseline = seed.baselines.find((b) => b.crew_id === 'crew-01');
  const rows = preflightVsNow(baseline, entered('crew-01', 'normal', '2026-11-13T08:00:00.000Z', { sleep_hours: 6.2, heart_rate: 71, systolic: 121, diastolic: 79 }));
  assert.deepEqual(rows.map((r) => [r.id, r.before, r.now]), [
    ['sleep', baseline.payload.sleepHours.toFixed(1), '6.2'],
    ['heart_rate', String(Math.round(baseline.payload.heartRate)), '71'],
    ['blood_pressure', `${Math.round(baseline.payload.systolic)}/${Math.round(baseline.payload.diastolic)}`, '121/79'],
  ]);
  // Works with a seeded crew.json-shaped row too.
  const seededRow = withIds.find((r) => r.crew_id === 'crew-01' && r.kind === 'daily_vitals');
  assert.equal(preflightVsNow(baseline, seededRow)[0].now, seededRow.payload.day.sleepHours.toFixed(1));
  assert.deepEqual(preflightVsNow(undefined, seededRow), []);
});

test('feed: newest watch/alert readings only', () => {
  const feed = flaggedFeed([...withIds, entered('crew-02', 'alert', '2026-11-13T10:00:00.000Z')], 5);
  assert.equal(feed.length, 5);
  assert.equal(feed[0].crew_id, 'crew-02');
  assert.ok(feed.every((r) => r.status !== 'normal'));
  assert.ok(feed.every((r, i) => i === 0 || Date.parse(feed[i - 1].recorded_at) >= Date.parse(r.recorded_at)));
});

test('merge: server rows win; device-only records are added', () => {
  const server = [{ id: 'a', status: 'alert' }];
  const local = [{ id: 'a', status: 'normal' }, { id: 'b', status: 'watch' }];
  assert.deepEqual(mergeReadings(server, local), [{ id: 'a', status: 'alert' }, { id: 'b', status: 'watch' }]);
});
