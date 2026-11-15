// Activities: Reaction Run scoring and baseline, the Calm Orbit record, Crew Journey routes and
// milestones, quiet hours, the daily cap, the store and what Vitals / the body map show. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  breathPhase,
  calmOrbitData,
  crewMinutesTotal,
  exerciseRow,
  gate,
  isActivity,
  journeyProgress,
  makeActivity,
  median,
  myMinutes,
  nextWaitMs,
  reactionBaseline,
  reactionHistory,
  reactionPanel,
  routeFor,
  scoreReactionRun,
  validateJourney,
  weekSessions,
} from './activities.js';
import { ACTIVITIES_KEY, readActivities, writeActivity } from './activityStore.js';
import { ACTIVITY_SETTINGS, GAME_SCALE_LABEL, LOGGED_NOT_SCORED, ROUTES } from '../content/activities.js';
import { memoryStorage } from '../ground/lib/testFixtures.js';

const MAYA = 'crew-01';
const TOMAS = 'crew-02';
const LENA = 'crew-03';
let n = 0;
const rec = (crewId, kind, date, data, hm = '09:00') => {
  n += 1;
  return makeActivity({ id: `a${n}`, crewId, kind, recordedAt: `${date}T${hm}:00.000Z`, data });
};
const run = (crewId, date, median_ms, hm) => rec(crewId, 'reaction_run', date, { median_ms, lapses: 0, false_starts: 0, trials: 20 }, hm);
const calm = (crewId, date, hm) => rec(crewId, 'calm_orbit', date, { minutes: 2, feeling: 'calmer' }, hm);
const ex = (crewId, date, minutes, hm, type = 'bike') => rec(crewId, 'crew_journey', date, { type, minutes }, hm);
const at = (date, hm) => new Date(`${date}T${hm}:00.000Z`);

// ---------- Reaction Run ----------

test('median of odd and even lists, ignoring non-numbers', () => {
  assert.equal(median([300, 200, 250]), 250);
  assert.equal(median([200, 300, 250, 400]), 275);
  assert.equal(median([null, 220, undefined]), 220);
  assert.equal(median([]), null);
});

test('scoring a session: median, lapses over 500 ms, timeouts, false starts, trials', () => {
  const s = scoreReactionRun({ reactions: [250, 260, 240, 510, null, 270], falseStarts: 2 });
  // times 240 250 260 270 510 → median 260; lapses: 510 and the timeout
  assert.deepEqual(s, { median_ms: 260, lapses: 2, false_starts: 2, trials: 6 });
});

test('exactly 500 ms is not a lapse; 501 ms is', () => {
  assert.equal(scoreReactionRun({ reactions: [500] }).lapses, 0);
  assert.equal(scoreReactionRun({ reactions: [501] }).lapses, 1);
});

test('a session with only timeouts or false starts has no median', () => {
  assert.deepEqual(scoreReactionRun({ reactions: [null, null], falseStarts: 0 }), { median_ms: null, lapses: 2, false_starts: 0, trials: 2 });
  assert.deepEqual(scoreReactionRun({ reactions: [], falseStarts: 5 }), { median_ms: null, lapses: 0, false_starts: 5, trials: 0 });
});

test('the median is rounded to whole ms', () => {
  assert.equal(scoreReactionRun({ reactions: [251, 252] }).median_ms, 252);
});

test('waits are 2–10 s', () => {
  assert.equal(nextWaitMs(0), 2000);
  assert.equal(nextWaitMs(0.5), 6000);
  assert.ok(nextWaitMs(0.9999) <= 10000);
  assert.equal(ACTIVITY_SETTINGS.reaction.sessionMs, 180000);
});

test('baseline: median of the last 7 sessions, from 3 sessions on', () => {
  const two = [run(MAYA, '2026-11-01', 300), run(MAYA, '2026-11-02', 280)];
  assert.equal(reactionBaseline(two, MAYA, '2026-11-10'), null);
  const nine = [
    run(MAYA, '2026-11-01', 900), // dropped: older than the last 7
    run(MAYA, '2026-11-02', 900), // dropped
    ...[260, 250, 240, 270, 230, 280, 255].map((m, i) => run(MAYA, `2026-11-0${i + 3}`, m)),
  ];
  assert.deepEqual(reactionBaseline(nine, MAYA, '2026-11-10'), { usual_ms: 255, sessions: 7 });
});

test('baseline ignores other people, null medians and records after the demo date', () => {
  const list = [
    run(MAYA, '2026-11-01', 250),
    run(MAYA, '2026-11-02', 260),
    run(MAYA, '2026-11-03', null),
    run(TOMAS, '2026-11-03', 400),
    run(MAYA, '2026-11-04', 270),
    run(MAYA, '2026-11-20', 900),
  ];
  assert.deepEqual(reactionBaseline(list, MAYA, '2026-11-10'), { usual_ms: 260, sessions: 3 });
  assert.deepEqual(reactionHistory(list, MAYA, '2026-11-10'), [250, 260, 270]);
});

// ---------- Calm Orbit ----------

test('the Calm Orbit record is 2 minutes plus the feeling, nothing else', () => {
  assert.deepEqual(calmOrbitData('calmer'), { minutes: 2, feeling: 'calmer' });
  assert.deepEqual(calmOrbitData('worse'), { minutes: 2, feeling: 'worse' });
  assert.equal(calmOrbitData('happy'), null);
  const r = calm(MAYA, '2026-11-05');
  assert.equal(isActivity(r), true);
  assert.deepEqual(Object.keys(r), ['id', 'crew_id', 'kind', 'recorded_at', 'data']);
  assert.equal('mood' in r.data, false);
});

test('breathing: 5 s in, 5 s out, six breaths a minute', () => {
  assert.equal(breathPhase(0).phase, 'in');
  assert.equal(breathPhase(4999).phase, 'in');
  assert.equal(breathPhase(5000).phase, 'out');
  assert.equal(breathPhase(9999).phase, 'out');
  assert.equal(breathPhase(10000).phase, 'in');
  assert.equal(breathPhase(0).secondsLeft, 5);
  assert.equal(breathPhase(5500).secondsLeft, 5);
  assert.equal(breathPhase(9100).secondsLeft, 1);
  assert.equal(60 / (ACTIVITY_SETTINGS.calm.inhaleS + ACTIVITY_SETTINGS.calm.exhaleS), 6);
});

// ---------- Crew Journey ----------

test('exercise validation: type and 5–120 whole minutes', () => {
  assert.equal(validateJourney({ type: 'bike', minutes: 30 }), null);
  assert.equal(validateJourney({ type: 'treadmill', minutes: 5 }), null);
  assert.equal(validateJourney({ type: 'resistance', minutes: 120 }), null);
  assert.match(validateJourney({ type: 'bike', minutes: 4 }), /5 to 120/);
  assert.match(validateJourney({ type: 'bike', minutes: 121 }), /5 to 120/);
  assert.match(validateJourney({ type: 'bike', minutes: 30.5 }), /whole/);
  assert.match(validateJourney({ type: 'swim', minutes: 30 }), /type/);
  assert.match(validateJourney({ type: 'bike', minutes: '' }), /minutes/);
});

test('the route follows the mission profile', () => {
  for (const id of ['iss', 'lunar_transit', 'moon']) assert.equal(routeFor(id).id, 'moon', id);
  for (const id of ['mars', 'mars_surface']) assert.equal(routeFor(id).id, 'mars', id);
  assert.equal(routeFor('unknown').id, 'moon');
  assert.equal(ROUTES.moon.totalKm, 384_400);
  assert.equal(ROUTES.moon.kmPerMinute, 1_000);
  assert.equal(ROUTES.mars.kmPerMinute, 500_000);
  assert.equal(ROUTES.mars.totalKm, 225_000_000);
  assert.equal(GAME_SCALE_LABEL, 'Team-set · game scale');
});

test('milestone notes are exactly the four per route', () => {
  assert.deepEqual(ROUTES.moon.milestones.map((m) => m.note), ['Left low Earth orbit', 'Passed the Van Allen belts', 'Halfway to the Moon', 'Arrived at the Moon']);
  assert.deepEqual(ROUTES.mars.milestones.map((m) => m.note), ['Left Earth orbit', 'Passed the Moon’s distance', 'Halfway to Mars', 'Arrived at Mars']);
});

test('the whole crew moves one ship: Maya 30 min, then Tomas 20 min', () => {
  const list = [ex(MAYA, '2026-11-05', 30)];
  const a = journeyProgress(list, 'iss', '2026-11-05');
  assert.equal(a.totalMinutes, 30);
  assert.equal(a.km, 30_000);
  list.push(ex(TOMAS, '2026-11-05', 20, '10:00'));
  const b = journeyProgress(list, 'iss', '2026-11-05');
  assert.equal(b.totalMinutes, 50);
  assert.equal(b.km, 50_000);
  assert.ok(b.fraction > a.fraction);
  assert.deepEqual(b.milestones.map((m) => m.reached), [true, false, false, false]);
  // Each person's own contribution
  assert.equal(myMinutes(list, MAYA, '2026-11-05'), 30);
  assert.equal(myMinutes(list, TOMAS, '2026-11-05'), 20);
});

test('switching to Mars keeps the minutes and changes the route and scale', () => {
  const list = [ex(MAYA, '2026-11-05', 30), ex(TOMAS, '2026-11-05', 20, '10:00')];
  const mars = journeyProgress(list, 'mars', '2026-11-05');
  assert.equal(mars.route.id, 'mars');
  assert.equal(mars.totalMinutes, 50);
  assert.equal(mars.km, 25_000_000);
  assert.deepEqual(mars.milestones.map((m) => m.reached), [true, true, false, false]);
});

test('milestones reached at halfway and arrival; progress is capped at the route end', () => {
  const half = journeyProgress([ex(MAYA, '2026-11-05', 120), ex(TOMAS, '2026-11-05', 73, '10:00')], 'moon', '2026-11-05');
  assert.equal(half.km, 193_000);
  assert.deepEqual(half.milestones.map((m) => m.reached), [true, true, true, false]);
  const far = journeyProgress([ex(MAYA, '2026-11-05', 120), ex(TOMAS, '2026-11-05', 120, '10:00'), ex(LENA, '2026-11-05', 120, '11:00'), ex(MAYA, '2026-11-06', 120)], 'moon', '2026-11-06');
  assert.equal(far.fraction, 1);
  assert.equal(far.km, 384_400);
  assert.ok(far.milestones.every((m) => m.reached));
});

test('journey ignores sessions after the demo date', () => {
  const list = [ex(MAYA, '2026-11-05', 30), ex(TOMAS, '2026-11-09', 60)];
  assert.equal(crewMinutesTotal(list, '2026-11-05'), 30);
  assert.equal(crewMinutesTotal(list, '2026-11-09'), 90);
});

// ---------- Quiet hours and the daily cap ----------

test('quiet hours lock Reaction Run and Crew Journey; Calm Orbit stays open', () => {
  const args = (kind, hm) => ({ kind, records: [], crewId: MAYA, demoDate: '2026-11-05', now: at('2026-11-05', hm) });
  for (const hm of ['22:00', '23:30', '00:00', '05:59']) {
    assert.equal(gate(args('reaction_run', hm)), 'rest', hm);
    assert.equal(gate(args('crew_journey', hm)), 'rest', hm);
    assert.equal(gate(args('calm_orbit', hm)), 'open', hm);
  }
  for (const hm of ['06:00', '12:00', '21:59']) {
    assert.equal(gate(args('reaction_run', hm)), 'open', hm);
    assert.equal(gate(args('crew_journey', hm)), 'open', hm);
  }
});

test('at most 3 sessions of each game per demo day', () => {
  const day = '2026-11-05';
  const now = at(day, '12:00');
  const three = [run(MAYA, day, 250, '08:00'), run(MAYA, day, 250, '09:00'), run(MAYA, day, 250, '10:00')];
  assert.equal(gate({ kind: 'reaction_run', records: three.slice(0, 2), crewId: MAYA, demoDate: day, now }), 'open');
  assert.equal(gate({ kind: 'reaction_run', records: three, crewId: MAYA, demoDate: day, now }), 'done');
  // Other games, other people and other days are separate
  assert.equal(gate({ kind: 'calm_orbit', records: three, crewId: MAYA, demoDate: day, now }), 'open');
  assert.equal(gate({ kind: 'reaction_run', records: three, crewId: TOMAS, demoDate: day, now }), 'open');
  assert.equal(gate({ kind: 'reaction_run', records: three, crewId: MAYA, demoDate: '2026-11-06', now }), 'open');
  const calms = [calm(MAYA, day, '01:00'), calm(MAYA, day, '02:00'), calm(MAYA, day, '03:00')];
  assert.equal(gate({ kind: 'calm_orbit', records: calms, crewId: MAYA, demoDate: day, now: at(day, '23:00') }), 'done');
});

// ---------- Store ----------

test('the store keeps valid records only, newest first', () => {
  const storage = memoryStorage();
  assert.deepEqual(writeActivity(storage, run(MAYA, '2026-11-05', 250)), { ok: true });
  assert.deepEqual(writeActivity(storage, ex(MAYA, '2026-11-06', 30)), { ok: true });
  assert.equal(writeActivity(storage, ex(MAYA, '2026-11-06', 3)).ok, false);
  assert.equal(writeActivity(storage, { ...calm(MAYA, '2026-11-06'), kind: 'chess' }).ok, false);
  const list = readActivities(storage);
  assert.deepEqual(list.map((r) => r.kind), ['crew_journey', 'reaction_run']);
  storage.setItem(ACTIVITIES_KEY, '{not json');
  assert.deepEqual(readActivities(storage), []);
});

// ---------- What others see ----------

test('the CMO view of someone else: session counts and dates only', () => {
  const list = [run(MAYA, '2026-11-03', 250), run(MAYA, '2026-11-05', 260), calm(MAYA, '2026-11-05'), ex(MAYA, '2026-10-20', 30), ex(TOMAS, '2026-11-05', 40)];
  const w = weekSessions(list, MAYA, '2026-11-05');
  assert.deepEqual(w, {
    reaction_run: { count: 2, dates: ['2026-11-03', '2026-11-05'] },
    calm_orbit: { count: 1, dates: ['2026-11-05'] },
    crew_journey: { count: 0, dates: [] },
  });
  assert.equal(JSON.stringify(w).includes('median'), false);
  assert.equal(JSON.stringify(w).includes('minutes'), false);
});

test('the Vitals panel and the drawer row are labelled Logged · not scored', () => {
  const list = [run(MAYA, '2026-11-01', 250), run(MAYA, '2026-11-02', 260), run(MAYA, '2026-11-03', 270), ex(MAYA, '2026-11-02', 30), ex(MAYA, '2026-11-03', 45)];
  const p = reactionPanel(list, MAYA, '2026-11-05');
  assert.equal(p.label, 'From Reaction Run · Logged · not scored');
  assert.deepEqual(p.history, [250, 260, 270]);
  assert.equal(p.usual.usual_ms, 260);
  const mock = { id: 'exercise-time', name: 'Exercise time', value: 2.1, unit: 'h/day', status: 'normal', trend: 'flat', trendText: 'x', history: [1, 2] };
  const own = exerciseRow(mock, list, MAYA, '2026-11-05');
  assert.equal(own.value, 75);
  assert.equal(own.unit, 'min this week');
  assert.equal(own.notScoredText, LOGGED_NOT_SCORED);
  const other = exerciseRow(mock, list, MAYA, '2026-11-05', { own: false });
  assert.equal(other.value, 2);
  assert.equal(other.unit, 'sessions this week');
});
