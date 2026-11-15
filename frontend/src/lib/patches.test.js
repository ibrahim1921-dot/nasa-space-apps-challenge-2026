// Mission patches: every rule, tough days, grace days (2 per mission month), never taken away once earned,
// and never earned from a score. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { earnedFromRecords, monthOf, patchShelf, toughDays } from './patches.js';
import { PATCHES_KEY, noteEmergencyDay, parsePatchState, patchesOf, readPatchState, recordEarned, writePatchState } from './patchStore.js';
import { makeActivity } from './activities.js';
import { PATCHES, TOUGH_DAYS_TEXT } from '../content/activities.js';
import { crewDaysOf } from './testSupport.js';
import { memoryStorage } from '../ground/lib/testFixtures.js';

const MAYA = 'crew-01';
const TOMAS = 'crew-02';
const LENA = 'crew-03';
const DAYS = crewDaysOf(MAYA); // last crew.json day 2026-10-30 = mission day 142; month 5 starts at day 151 (2026-11-08)

let n = 0;
const rec = (crewId, kind, date, data) => {
  n += 1;
  return makeActivity({ id: `p${n}`, crewId, kind, recordedAt: `${date}T09:${String(n % 60).padStart(2, '0')}:00.000Z`, data });
};
const run = (date, crewId = MAYA, median_ms = 250) => rec(crewId, 'reaction_run', date, { median_ms, lapses: 0, false_starts: 0, trials: 20 });
const calm = (date, crewId = MAYA, feeling = 'calmer') => rec(crewId, 'calm_orbit', date, { minutes: 2, feeling });
const ex = (date, minutes = 30, crewId = MAYA) => rec(crewId, 'crew_journey', date, { type: 'bike', minutes });
const checkin = (date, { mood = 4, status = 'normal' } = {}) => ({ id: `c${date}`, crew_id: MAYA, kind: 'daily_vitals', recorded_at: `${date}T07:30:00.000Z`, payload: { reading: { mood } }, status });
const nov = (d) => `2026-11-${String(d).padStart(2, '0')}`;
const earned = (over) => earnedFromRecords({ crewId: MAYA, activities: [], checkins: [], emergencyDays: [], crewDays: DAYS, profileId: 'iss', demoDate: nov(20), ...over });

test('there are exactly the eight patches, and the tough-days line', () => {
  assert.deepEqual(PATCHES.map((p) => p.name), [
    'First Reaction Run',
    'Reaction Run 5 days in a row',
    'First Calm Orbit',
    '7 Calm Orbits',
    'First exercise logged',
    'Crew reached halfway',
    'Crew arrived',
    'Full week: a Reaction Run, a Calm Orbit and exercise on 5 of 7 days',
  ]);
  assert.equal(TOUGH_DAYS_TEXT, 'Tough days don’t break your run');
});

test('nothing earned with no sessions', () => {
  assert.ok(Object.values(earned({})).every((v) => v === null));
});

test('first Reaction Run, first Calm Orbit, first exercise', () => {
  const e = earned({ activities: [run(nov(3)), run(nov(4)), calm(nov(5)), ex(nov(6))] });
  assert.equal(e.first_reaction, nov(3));
  assert.equal(e.first_calm, nov(5));
  assert.equal(e.first_exercise, nov(6));
});

test('7 Calm Orbits: earned on the seventh session, any days', () => {
  const six = [1, 1, 3, 5, 8, 9].map((d) => calm(nov(d)));
  assert.equal(earned({ activities: six }).calm_seven, null);
  assert.equal(earned({ activities: [...six, calm(nov(12))] }).calm_seven, nov(12));
});

test('Reaction Run 5 days in a row', () => {
  assert.equal(earned({ activities: [1, 2, 3, 4].map((d) => run(nov(d))) }).reaction_streak, null);
  assert.equal(earned({ activities: [1, 2, 3, 4, 5].map((d) => run(nov(d))) }).reaction_streak, nov(5));
});

test('a grace day keeps the run going', () => {
  // 2 Nov missed (grace)
  assert.equal(earned({ activities: [1, 3, 4, 5].map((d) => run(nov(d))) }).reaction_streak, nov(5));
});

test('a third missed day in one mission month breaks the run', () => {
  // 2, 3 grace; 4 Nov breaks it (still mission month 4); 5–7 played is only 3 days
  assert.equal(earned({ activities: [1, 5, 6, 7].map((d) => run(nov(d))), demoDate: nov(7) }).reaction_streak, null);
});

test('grace days reset each mission month', () => {
  assert.equal(monthOf(nov(7), { crewDays: DAYS }), 4);
  assert.equal(monthOf(nov(8), { crewDays: DAYS }), 5);
  // Month 4: 2, 3 grace, 4 breaks. Then 5, 6, 7 played; 8 Nov is missed but month 5 has fresh grace; 9 Nov makes 5.
  assert.equal(earned({ activities: [1, 5, 6, 7, 9].map((d) => run(nov(d))) }).reaction_streak, nov(9));
});

test('tough days: low mood, alert status, or an emergency as patient', () => {
  const t = toughDays({
    checkins: [checkin(nov(1), { mood: 2 }), checkin(nov(2), { mood: 1 }), checkin(nov(3), { mood: 3 }), checkin(nov(4), { status: 'alert' }), checkin(nov(5), { status: 'watch' })],
    emergencyDays: [nov(6)],
    demoDate: nov(20),
  });
  assert.deepEqual([...t].sort(), [nov(1), nov(2), nov(4), nov(6)]);
});

test('a tough day does not break the run when grace is used up', () => {
  // 2, 3 grace; 4 Nov would break it, but it is a tough day
  const activities = [1, 5].map((d) => run(nov(d)));
  assert.equal(earned({ activities, demoDate: nov(5) }).reaction_streak, null);
  assert.equal(earned({ activities, checkins: [checkin(nov(4), { mood: 2 })], demoDate: nov(5) }).reaction_streak, nov(5));
  assert.equal(earned({ activities, checkins: [checkin(nov(4), { status: 'alert' })], demoDate: nov(5) }).reaction_streak, nov(5));
  assert.equal(earned({ activities, emergencyDays: [nov(4)], demoDate: nov(5) }).reaction_streak, nov(5));
});

test('tough days never earn a patch by themselves', () => {
  const checkins = [1, 2, 3, 4, 5, 6, 7].map((d) => checkin(nov(d), { mood: 1, status: 'alert' }));
  assert.ok(Object.values(earned({ checkins, emergencyDays: [nov(1), nov(2)] })).every((v) => v === null));
  // A run of tough days only earns once the person actually plays
  const e = earned({ activities: [run(nov(1))], checkins: [2, 3, 4, 5].map((d) => checkin(nov(d), { mood: 2 })), demoDate: nov(5) });
  assert.equal(e.reaction_streak, null);
  assert.equal(earned({ activities: [run(nov(1)), run(nov(6))], checkins: [2, 3, 4, 5].map((d) => checkin(nov(d), { mood: 2 })), demoDate: nov(6) }).reaction_streak, nov(6));
});

test('the demo’s today is not a missed day until it is over', () => {
  // Played 1–4, today (5 Nov) not yet: no grace spent, no patch yet
  assert.equal(earned({ activities: [1, 2, 3, 4].map((d) => run(nov(d))), demoDate: nov(5) }).reaction_streak, null);
});

test('full week: all three games on 5 of 7 days', () => {
  const day = (d) => [run(nov(d)), calm(nov(d)), ex(nov(d))];
  assert.equal(earned({ activities: [1, 2, 3, 4].flatMap(day), demoDate: nov(4) }).full_week, null);
  assert.equal(earned({ activities: [1, 2, 3, 4, 5].flatMap(day) }).full_week, nov(5));
  // Two of the seven days with only a Reaction Run still make a full week (grace)
  assert.equal(earned({ activities: [...[1, 2, 4, 5].flatMap(day), run(nov(3))] }).full_week, nov(5));
});

test('full week counts grace days; two complete days are not enough', () => {
  const day = (d) => [run(nov(d)), calm(nov(d)), ex(nov(d))];
  // 1, 4, 7 complete; 2, 3 grace; 5, 6 missed (grace used up): the 1–7 window counts 1, 2, 3, 4, 7 = 5
  assert.equal(earned({ activities: [1, 4, 7].flatMap(day), demoDate: nov(7) }).full_week, nov(7));
  // With only two complete days it is never earned
  assert.equal(earned({ activities: [1, 7].flatMap(day), demoDate: nov(7) }).full_week, null);
});

test('crew halfway and arrival: earned by everyone who logged exercise', () => {
  // Moon route: halfway at 192.2 crew-minutes, arrival at 384.4
  const activities = [ex(nov(1), 100), ex(nov(2), 100, TOMAS), ex(nov(3), 120, TOMAS), ex(nov(4), 70)];
  const maya = earned({ activities });
  assert.equal(maya.crew_halfway, nov(2));
  assert.equal(maya.crew_arrived, nov(4));
  const lena = earnedFromRecords({ crewId: LENA, activities, crewDays: DAYS, profileId: 'iss', demoDate: nov(20) });
  assert.equal(lena.crew_halfway, null);
  assert.equal(lena.crew_arrived, null);
  // Someone who joins later earns it on their own first exercise day
  const late = earnedFromRecords({ crewId: LENA, activities: [...activities, ex(nov(9), 10, LENA)], crewDays: DAYS, profileId: 'iss', demoDate: nov(20) });
  assert.equal(late.crew_halfway, nov(9));
});

test('earned on the Moon route, still earned after switching to Mars', () => {
  const storage = memoryStorage();
  const activities = [ex(nov(1), 100), ex(nov(2), 100, TOMAS)];
  const moon = earned({ activities, profileId: 'iss' });
  assert.equal(moon.crew_halfway, nov(2));
  writePatchState(storage, recordEarned(readPatchState(storage), MAYA, moon));

  const mars = earned({ activities, profileId: 'mars' });
  assert.equal(mars.crew_halfway, null); // not halfway on the longer route …
  const shelf = patchShelf(mars, patchesOf(readPatchState(storage), MAYA).earned);
  const half = shelf.find((p) => p.id === 'crew_halfway');
  assert.equal(half.earned, true); // … but a patch, once earned, is never taken away
  assert.equal(half.earnedOn, nov(2));
});

test('the store keeps the first earnedOn and never removes a patch', () => {
  let s = recordEarned({}, MAYA, { first_reaction: nov(3), first_calm: null });
  s = recordEarned(s, MAYA, { first_reaction: nov(1), first_calm: nov(5) });
  assert.deepEqual(patchesOf(s, MAYA).earned, { first_reaction: nov(3), first_calm: nov(5) });
  s = recordEarned(s, MAYA, { first_reaction: null, first_calm: null });
  assert.deepEqual(patchesOf(s, MAYA).earned, { first_reaction: nov(3), first_calm: nov(5) });
  assert.deepEqual(patchesOf(s, TOMAS).earned, {});
  // Unknown ids and bad dates are dropped on read
  assert.deepEqual(parsePatchState({ [MAYA]: { earned: { top_score: nov(1), first_calm: 'soon' } } })[MAYA].earned, {});
  const storage = memoryStorage({ [PATCHES_KEY]: '{oops' });
  assert.deepEqual(readPatchState(storage), {});
});

test('emergency days are noted once per demo day', () => {
  let s = noteEmergencyDay({}, MAYA, nov(4));
  s = noteEmergencyDay(s, MAYA, nov(4));
  s = noteEmergencyDay(s, MAYA, nov(2));
  assert.deepEqual(patchesOf(s, MAYA).emergencyDays, [nov(2), nov(4)]);
});

test('patches never look at a score: times, feelings and minutes do not matter', () => {
  const build = (median_ms, feeling, minutes) => [1, 2, 3, 4, 5, 6, 7].flatMap((d) => [run(nov(d), MAYA, median_ms), calm(nov(d), MAYA, feeling), ex(nov(d), minutes)]);
  const fast = earned({ activities: build(180, 'calmer', 30) });
  const slow = earned({ activities: build(480, 'worse', 30) });
  assert.deepEqual(fast, slow);
  // Session counts, not minutes, drive everything except the shared crew distance
  const { crew_halfway: _a, crew_arrived: _b, ...short } = earned({ activities: build(250, 'same', 5) });
  const { crew_halfway: _c, crew_arrived: _d, ...long } = earned({ activities: build(250, 'same', 120) });
  assert.deepEqual(short, long);
});
