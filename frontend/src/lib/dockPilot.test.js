// Dock Pilot: the step-by-step physics, docking and hard contacts, levels, the precision score, "Your usual",
// "Best today", the record, the daily cap and quiet hours, the patches, and that no result changes any
// status. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVELS,
  approachOffset,
  createRound,
  dockBestToday,
  dockUsual,
  nextRandom,
  offsetOf,
  precisionScore,
  roundResult,
  speedOf,
  step,
  timeLeft,
  unlockedLevels,
} from './dockPilot.js';
import { gate, isActivity, makeActivity, weekSessions } from './activities.js';
import { ACTIVITIES_KEY, readActivities, writeActivity } from './activityStore.js';
import { earnedFromRecords, patchShelf } from './patches.js';
import { parsePatchState, recordEarned } from './patchStore.js';
import { buildPersonDashboard } from './personCards.js';
import {
  ACTIVITY_KINDS,
  ACTIVITY_SETTINGS,
  ALL_PATCHES,
  DOCK_PILOT_PATCHES,
  DOCK_WHY,
  GAME_KINDS,
  GAMES,
  PATCHES,
} from '../content/activities.js';
import { sourceFor } from '../content/limits.js';
import { crewDaysOf, preflightOf } from './testSupport.js';
import { memoryStorage } from '../ground/lib/testFixtures.js';

const D = ACTIVITY_SETTINGS.dock;
const MAYA = 'crew-01';
const TOMAS = 'crew-02';
const DAYS = crewDaysOf(MAYA);
const nov = (d) => `2026-11-${String(d).padStart(2, '0')}`;
const at = (date, hm) => new Date(`${date}T${hm}:00.000Z`);
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

/** Run `n` steps with the same input. */
const hold = (s, input, n) => {
  for (let i = 0; i < n; i += 1) s = step(s, input);
  return s;
};
const STEPS_PER_S = Math.round(1 / D.stepS);

/** A careful test pilot: per axis, aim for a velocity toward the port and pulse thrust when off by a margin. */
function fly(level, seed) {
  let s = createRound({ level, seed });
  const axis = (pos, target, v) => {
    const want = Math.max(-20, Math.min(20, (target - pos) * 0.25));
    const d = want - v;
    return Math.abs(d) > 1.5 ? Math.sign(d) : 0;
  };
  while (!s.over) s = step(s, { x: axis(s.x, D.port.x, s.vx), y: axis(s.y, D.port.y, s.vy) });
  return s;
}

let n = 0;
const rec = (crewId, date, data, hm) => {
  n += 1;
  const time = hm ?? `09:${String(n % 60).padStart(2, '0')}`;
  return makeActivity({ id: `d${n}`, crewId, kind: 'dock_pilot', recordedAt: `${date}T${time}:00.000Z`, data });
};
const result = (over = {}) => ({ level: 1, docked: true, time_s: 20, final_offset_px: 0, final_speed: 0, hard_contacts: 0, fuel_used: 0, ...over });
const dock = (date, over = {}, crewId = MAYA, hm) => rec(crewId, date, result(over), hm);

// ---------- Random numbers ----------

test('the random numbers are seeded: same seed, same sequence, always in [0, 1)', () => {
  let a = 7;
  let b = 7;
  for (let i = 0; i < 200; i += 1) {
    let va;
    let vb;
    [va, a] = nextRandom(a);
    [vb, b] = nextRandom(b);
    assert.equal(va, vb);
    assert.ok(va >= 0 && va < 1);
  }
  assert.notEqual(nextRandom(1)[0], nextRandom(2)[0]);
});

// ---------- Physics ----------

test('a new round: at rest at the start, full fuel, 60 s left; same seed gives the same round', () => {
  const s = createRound({ level: 2, seed: 99 });
  assert.equal(s.x, D.start.x);
  assert.equal(s.y, D.start.y);
  assert.equal(speedOf(s), 0);
  assert.equal(s.fuel, D.fuelMax);
  assert.equal(timeLeft(s), 60);
  assert.deepEqual(createRound({ level: 2, seed: 99 }), s);
  assert.throws(() => createRound({ level: 4 }));
});

test('level 1: no input, no drift, no friction: the capsule stays where it is', () => {
  const s = hold(createRound({ level: 1, seed: 5 }), {}, 5 * STEPS_PER_S);
  assert.equal(s.x, D.start.x);
  assert.equal(s.y, D.start.y);
  assert.equal(s.fuel, D.fuelMax);
});

test('thrust adds velocity; letting go keeps it (no friction)', () => {
  let s = hold(createRound({ level: 1 }), { x: 1 }, STEPS_PER_S); // 1 s of right thrust
  close(s.vx, D.thrust, 1e-6);
  assert.equal(s.vy, 0);
  const x1 = s.x;
  s = hold(s, {}, STEPS_PER_S); // coast 1 s
  close(s.vx, D.thrust, 1e-6);
  close(s.x - x1, D.thrust, 1e-6);
  // Opposite thrust cancels it again
  s = hold(s, { x: -1 }, STEPS_PER_S);
  close(s.vx, 0, 1e-6);
});

test('step does not change the state it is given', () => {
  const s = createRound({ level: 3, seed: 3 });
  const copy = JSON.parse(JSON.stringify(s));
  step(s, { x: 1, y: -1 });
  assert.deepEqual(JSON.parse(JSON.stringify(s)), copy);
});

test('fuel: 8 per second per axis at level 1, 12 at levels 2 and 3; two axes burn double', () => {
  close(D.fuelMax - hold(createRound({ level: 1 }), { x: 1 }, STEPS_PER_S).fuel, 8);
  close(D.fuelMax - hold(createRound({ level: 2 }), { y: 1 }, STEPS_PER_S).fuel, 12);
  close(D.fuelMax - hold(createRound({ level: 3 }), { x: 1 }, STEPS_PER_S).fuel, 12);
  close(D.fuelMax - hold(createRound({ level: 1 }), { x: 1, y: 1 }, STEPS_PER_S).fuel, 16);
  // Left and right together cancel: no input, no fuel
  assert.equal(hold(createRound({ level: 1 }), { x: 0 }, STEPS_PER_S).fuel, D.fuelMax);
});

test('out of fuel ends thrust, not the round: the capsule keeps drifting', () => {
  let s = createRound({ level: 1 });
  s = { ...s, y: 40, x: 40 }; // away from the port
  s = hold(s, { y: 1 }, 13 * STEPS_PER_S); // 12.5 s of fuel at 8/s
  assert.equal(s.fuel, 0);
  assert.equal(s.over, false);
  const v = s.vy;
  const y = s.y;
  s = step(s, { y: 1 });
  assert.equal(s.thrusting.y, 0, 'no flame without fuel');
  if (v > 0 && s.y < D.world.h - D.capsuleR) {
    close(s.vy, v);
    assert.ok(s.y > y, 'still drifting');
  }
});

test('the out_of_fuel event fires once, on the step the tank empties', () => {
  let s = { ...createRound({ level: 1 }), fuel: 0.1 };
  s = step(s, { x: 1 });
  assert.equal(s.fuel, 0);
  assert.deepEqual(s.events, ['out_of_fuel']);
  assert.deepEqual(step(s, { x: 1 }).events, []);
});

test('level 2 drifts with no input; level 1 does not', () => {
  const two = createRound({ level: 2, seed: 11 });
  close(Math.hypot(two.drift.ax, two.drift.ay), D.levels[2].drift);
  const later = hold(two, {}, STEPS_PER_S);
  close(speedOf(later), D.levels[2].drift, 1e-6);
  assert.deepEqual(createRound({ level: 1, seed: 11 }).drift, { ax: 0, ay: 0 });
});

test('level 3: a solar-wind nudge every 4–6 s; none at levels 1 and 2', () => {
  const windTimes = (level) => {
    let s = createRound({ level, seed: 21 });
    s = { ...s, drift: { ax: 0, ay: 0 }, x: 120, y: 60 }; // no drift, away from the ring, to see the wind alone
    const times = [];
    for (let i = 0; i < 30 * STEPS_PER_S; i += 1) {
      const before = speedOf(s);
      s = step(s, {});
      if (s.events.includes('wind')) {
        times.push(s.t);
        assert.notEqual(speedOf(s), before);
      }
    }
    return times;
  };
  const times = windTimes(3);
  assert.ok(times.length >= 4, `${times.length} nudges in 30 s`);
  assert.ok(times[0] >= 4 - 1e-9 && times[0] <= 6 + D.stepS);
  for (let i = 1; i < times.length; i += 1) {
    const gap = times[i] - times[i - 1];
    assert.ok(gap >= 4 - 1e-9 && gap <= 6 + D.stepS, `gap ${gap}`);
  }
  assert.deepEqual(windTimes(1), []);
  assert.deepEqual(windTimes(2), []);
});

test('the capsule stops at the edge of the play area', () => {
  let s = { ...createRound({ level: 1 }), vx: -50 };
  s = hold(s, {}, 3 * STEPS_PER_S);
  assert.equal(s.x, D.capsuleR);
  assert.equal(s.vx, 0);
});

// ---------- Docking and hard contacts ----------

test('levels: ring and capture zone shrink at level 3', () => {
  assert.deepEqual(LEVELS, [1, 2, 3]);
  assert.ok(D.levels[3].ringR < D.levels[1].ringR);
  assert.ok(D.levels[3].captureR < D.levels[1].captureR);
  assert.equal(D.levels[1].guide, true);
  assert.equal(D.levels[2].guide, false);
  assert.equal(D.levels[3].guide, false);
});

test('docks when inside the capture zone under the speed limit', () => {
  const s0 = { ...createRound({ level: 1 }), x: D.port.x - D.levels[1].captureR - 1, y: D.port.y, vx: 10 };
  let s = s0;
  while (!s.over) s = step(s, {});
  assert.ok(s.events.includes('docked'));
  assert.equal(s.docked, true);
  assert.equal(s.over, true);
  assert.equal(s.hardContacts, 0);
  // Once over, steps change nothing
  const after = step(s, { x: 1 });
  assert.equal(after.x, s.x);
  assert.equal(after.fuel, s.fuel);
});

test('slow inside the ring but outside the capture zone is not docked yet', () => {
  const L = D.levels[1];
  const s = step({ ...createRound({ level: 1 }), x: D.port.x, y: D.port.y - (L.captureR + L.ringR) / 2 }, {});
  assert.equal(s.docked, false);
  assert.equal(s.inRing, true);
});

test('entering the ring too fast is a hard contact: counted, bounced, the round goes on', () => {
  const L = D.levels[1];
  const s0 = { ...createRound({ level: 1 }), x: D.port.x - L.ringR - 1, y: D.port.y, vx: 60 };
  let s = hold(s0, {}, 5);
  assert.equal(s.hardContacts, 1);
  assert.equal(s.docked, false);
  assert.equal(s.over, false);
  assert.ok(s.vx < 0, 'bounced back');
  close(Math.abs(s.vx), 60 * D.bounce);
  // Counted once per entry: it only counts again after leaving and coming back fast
  s = hold(s, {}, 2 * STEPS_PER_S);
  assert.equal(s.hardContacts, 1);
  assert.equal(s.inRing, false);
  s = hold({ ...s, vx: 60 }, {}, 2 * STEPS_PER_S);
  assert.equal(s.hardContacts, 2);
});

test('exactly at the speed limit docks; just over is a hard contact', () => {
  const L = D.levels[1];
  const near = (vx) => ({ ...createRound({ level: 1 }), x: D.port.x - L.captureR - 0.01, y: D.port.y, vx, inRing: true });
  assert.equal(step(near(D.dockSpeed), {}).docked, true);
  const fast = { ...createRound({ level: 1 }), x: D.port.x - L.ringR - 0.1, y: D.port.y, vx: D.dockSpeed + 1 };
  assert.deepEqual(step(fast, {}).events, ['hard_contact']);
});

test('a round lasts at most 60 s', () => {
  let s = { ...createRound({ level: 1 }), x: 40, y: 40 };
  s = hold(s, {}, 61 * STEPS_PER_S);
  assert.equal(s.over, true);
  assert.equal(s.docked, false);
  assert.equal(timeLeft(s), 0);
  assert.equal(roundResult(s).time_s, 60);
});

test('the test pilot docks at every level, with the same result for the same seed', () => {
  for (const level of LEVELS)
    for (const seed of [1, 2, 3, 42]) {
      const s = fly(level, seed);
      assert.equal(s.docked, true, `level ${level} seed ${seed}`);
      assert.equal(s.hardContacts, 0);
      assert.ok(s.t < 60);
      assert.deepEqual(roundResult(fly(level, seed)), roundResult(s));
    }
});

// ---------- Result and precision ----------

test('the round result has exactly the record fields', () => {
  const r = roundResult(fly(2, 7));
  assert.deepEqual(Object.keys(r), ['level', 'docked', 'time_s', 'final_offset_px', 'final_speed', 'hard_contacts', 'fuel_used']);
  assert.equal(r.level, 2);
  assert.ok(r.fuel_used > 0 && r.fuel_used <= D.fuelMax);
});

test('docked offset is the approach offset: straight at the centre is 0, a glancing path is not', () => {
  assert.equal(approachOffset(D.port.x - 12, D.port.y, 5, 0), 0);
  close(approachOffset(D.port.x - 12, D.port.y - 5, 5, 0), 5);
  // At rest or moving away: the plain distance
  close(approachOffset(D.port.x - 12, D.port.y, 0, 0), 12);
  close(approachOffset(D.port.x - 12, D.port.y, -5, 0), 12);
  // Not docked: the plain distance
  const s = { ...createRound({ level: 1 }), x: 40, y: 40 };
  close(roundResult(s).final_offset_px, Math.round(offsetOf(s) * 10) / 10);
});

test('precision: a perfect dock is 100; outside the ring is 0', () => {
  for (const level of LEVELS) assert.equal(precisionScore(result({ level })), 100);
  assert.equal(precisionScore(result({ docked: false, final_offset_px: 31 })), 0);
  assert.equal(precisionScore(result({ level: 3, docked: false, final_offset_px: 23 })), 0);
  // Each part on its own
  assert.equal(precisionScore(result({ final_offset_px: 15 })), 75); // half the 30 px ring: 25 + 30 + 20
  assert.equal(precisionScore(result({ final_speed: 15 })), 85); // half of twice the limit: 50 + 15 + 20
  assert.equal(precisionScore(result({ fuel_used: 50 })), 90); // 50 + 30 + 10
  assert.equal(precisionScore({ level: 9 }), 0);
});

test('precision always stays within 0–100', () => {
  let seed = 3;
  const r = () => {
    let v;
    [v, seed] = nextRandom(seed);
    return v;
  };
  for (let i = 0; i < 2000; i += 1) {
    const p = precisionScore(
      result({ level: 1 + Math.floor(r() * 3), final_offset_px: r() * 400 - 20, final_speed: r() * 300 - 10, fuel_used: r() * 140 - 20 }),
    );
    assert.ok(Number.isInteger(p) && p >= 0 && p <= 100, `${p}`);
  }
});

test('the test pilot’s near-perfect docks score high at every level (fixture for the formula)', () => {
  const scores = LEVELS.map((level) => precisionScore(roundResult(fly(level, 1))));
  assert.deepEqual(scores, [95, 87, 77]);
});

// ---------- Your usual, best today, levels ----------

test('"Your usual": median precision of the last 7 rounds at that level, from 3 rounds on', () => {
  const two = [dock(nov(1), { fuel_used: 10 }), dock(nov(2), { fuel_used: 20 })];
  assert.equal(dockUsual(two, MAYA, nov(5), 1), null);
  const three = [...two, dock(nov(3), { fuel_used: 30 })]; // 98, 96, 94
  assert.deepEqual(dockUsual(three, MAYA, nov(5), 1), { usual: 96, rounds: 3 });
  // Other levels and other people do not count
  assert.equal(dockUsual([...three, dock(nov(4), { level: 2 })], MAYA, nov(5), 2), null);
  assert.equal(dockUsual(three, TOMAS, nov(5), 1), null);
  // Only the last 7
  const nine = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => dock(nov(d), { fuel_used: d <= 2 ? 100 : 0 })); // 80, 80, then 100 × 7
  assert.deepEqual(dockUsual(nine, MAYA, nov(10), 1), { usual: 100, rounds: 7 });
  // Rounds after the demo's today are ignored
  assert.equal(dockUsual(three, MAYA, nov(2), 1), null);
});

test('"Best today": this player, this level, today only', () => {
  const list = [dock(nov(5), { fuel_used: 50 }), dock(nov(5), { fuel_used: 10 }), dock(nov(4), { fuel_used: 0 }), dock(nov(5), {}, TOMAS), dock(nov(5), { level: 2 })];
  assert.equal(dockBestToday(list, MAYA, nov(5), 1), 98);
  assert.equal(dockBestToday(list, MAYA, nov(6), 1), null);
  assert.equal(dockBestToday(list, TOMAS, nov(5), 3), null);
});

test('levels unlock one at a time, after one docking at the level before', () => {
  assert.deepEqual(unlockedLevels([], MAYA, nov(5)), [1]);
  assert.deepEqual(unlockedLevels([dock(nov(1), { docked: false, final_offset_px: 100 })], MAYA, nov(5)), [1]);
  assert.deepEqual(unlockedLevels([dock(nov(1))], MAYA, nov(5)), [1, 2]);
  assert.deepEqual(unlockedLevels([dock(nov(1)), dock(nov(2), { level: 2 })], MAYA, nov(5)), [1, 2, 3]);
  // A level-2 docking alone does not skip level 1's step
  assert.deepEqual(unlockedLevels([dock(nov(2), { level: 2 })], MAYA, nov(5)), [1]);
  assert.deepEqual(unlockedLevels([dock(nov(1))], TOMAS, nov(5)), [1]);
});

// ---------- The record, the cap, quiet hours ----------

test('a dock_pilot record is a valid activity and is saved in the activity store', () => {
  const r = dock(nov(5), roundResult(fly(1, 1)));
  assert.equal(isActivity(r), true);
  assert.deepEqual(Object.keys(r), ['id', 'crew_id', 'kind', 'recorded_at', 'data']);
  const storage = memoryStorage();
  assert.deepEqual(writeActivity(storage, r), { ok: true });
  assert.deepEqual(readActivities(storage), [r]);
  assert.ok(storage.getItem(ACTIVITIES_KEY).includes('dock_pilot'));
});

test('malformed dock_pilot records are rejected', () => {
  const bad = [
    { level: 4 },
    { level: '1' },
    { docked: 'yes' },
    { time_s: 61 },
    { time_s: -1 },
    { final_offset_px: -1 },
    { final_speed: Number.NaN },
    { hard_contacts: 1.5 },
    { fuel_used: 101 },
  ];
  for (const over of bad) assert.equal(isActivity(dock(nov(5), over)), false, JSON.stringify(over));
  assert.equal(writeActivity(memoryStorage(), dock(nov(5), { level: 0 })).ok, false);
});

test('at most 3 Dock Pilot rounds per demo day; the 4th is "done"', () => {
  const day = nov(5);
  const now = at(day, '12:00');
  const three = [dock(day, {}, MAYA, '08:00'), dock(day, {}, MAYA, '09:00'), dock(day, {}, MAYA, '10:00')];
  assert.equal(gate({ kind: 'dock_pilot', records: three.slice(0, 2), crewId: MAYA, demoDate: day, now }), 'open');
  assert.equal(gate({ kind: 'dock_pilot', records: three, crewId: MAYA, demoDate: day, now }), 'done');
  assert.equal(gate({ kind: 'dock_pilot', records: three, crewId: TOMAS, demoDate: day, now }), 'open');
  assert.equal(gate({ kind: 'dock_pilot', records: three, crewId: MAYA, demoDate: nov(6), now: at(nov(6), '12:00') }), 'open');
  // Undocked rounds count too
  const missed = [1, 2, 3].map((i) => dock(day, { docked: false, final_offset_px: 200 }, MAYA, `0${i}:30`));
  assert.equal(gate({ kind: 'dock_pilot', records: missed, crewId: MAYA, demoDate: day, now }), 'done');
});

test('Dock Pilot is closed in quiet hours, like Reaction Run', () => {
  for (const hm of ['22:00', '23:30', '00:00', '05:59'])
    assert.equal(gate({ kind: 'dock_pilot', records: [], crewId: MAYA, demoDate: nov(5), now: at(nov(5), hm) }), 'rest', hm);
  for (const hm of ['06:00', '12:00', '21:59'])
    assert.equal(gate({ kind: 'dock_pilot', records: [], crewId: MAYA, demoDate: nov(5), now: at(nov(5), hm) }), 'open', hm);
});

// ---------- Patches ----------

const earned = (over) =>
  earnedFromRecords({ crewId: MAYA, activities: [], checkins: [], emergencyDays: [], crewDays: DAYS, profileId: 'iss', demoDate: nov(20), ...over });
const checkin = (date, { mood = 4, status = 'normal' } = {}) => ({
  id: `c${date}`,
  crew_id: MAYA,
  kind: 'daily_vitals',
  recorded_at: `${date}T07:30:00.000Z`,
  payload: { reading: { mood } },
  status,
});

test('the three Dock Pilot patches sit after the original eight', () => {
  assert.equal(PATCHES.length, 8);
  assert.deepEqual(DOCK_PILOT_PATCHES.map((p) => p.name), ['First docking', 'Docked at level 3', 'Dock Pilot 5 days in a row']);
  assert.deepEqual(ALL_PATCHES.map((p) => p.id), [...PATCHES.map((p) => p.id), 'first_dock', 'dock_level3', 'dock_streak']);
  const shelf = patchShelf(earned({}));
  assert.equal(shelf.length, 11);
  assert.ok(shelf.every((p) => !p.earned));
});

test('"First docking" on the first docked round; an undocked round is not enough', () => {
  const miss = dock(nov(2), { docked: false, final_offset_px: 200 });
  assert.equal(earned({ activities: [miss] }).first_dock, null);
  assert.equal(earned({ activities: [miss, dock(nov(4)), dock(nov(6))] }).first_dock, nov(4));
});

test('"Docked at level 3" needs a docking at level 3, whatever the score', () => {
  assert.equal(earned({ activities: [dock(nov(3), { level: 2 })] }).dock_level3, null);
  assert.equal(earned({ activities: [dock(nov(3), { level: 3, docked: false, final_offset_px: 100 })] }).dock_level3, null);
  // A clumsy docking (many hard contacts, low precision) earns it just the same
  const clumsy = dock(nov(7), { level: 3, hard_contacts: 6, final_offset_px: 8, final_speed: 14, fuel_used: 100 });
  assert.equal(earned({ activities: [clumsy] }).dock_level3, nov(7));
});

test('"Dock Pilot 5 days in a row": playing counts (docked or not); grace and tough days keep the run', () => {
  const play = (d) => dock(nov(d), { docked: false, final_offset_px: 300 });
  assert.equal(earned({ activities: [1, 2, 3, 4].map(play) }).dock_streak, null);
  assert.equal(earned({ activities: [1, 2, 3, 4, 5].map(play) }).dock_streak, nov(5));
  // 2 Nov missed: a grace day
  assert.equal(earned({ activities: [1, 3, 4, 5].map(play) }).dock_streak, nov(5));
  // 2, 3 grace, 4 breaks the run (the third miss this mission month) …
  assert.equal(earned({ activities: [1, 5, 6, 7].map(play), demoDate: nov(7) }).dock_streak, null);
  // … unless 4 Nov was a tough day: 1, 2g, 3g, 4 tough, 5 played makes 5
  assert.equal(earned({ activities: [1, 5, 6, 7].map(play), checkins: [checkin(nov(4), { mood: 2 })], demoDate: nov(7) }).dock_streak, nov(5));
  // Other games do not count for it: five days of Reaction Run alone earn nothing here
  const run = (d) =>
    makeActivity({ id: `rr${d}`, crewId: MAYA, kind: 'reaction_run', recordedAt: `${nov(d)}T09:00:00.000Z`, data: { median_ms: 250, lapses: 0, false_starts: 0, trials: 20 } });
  const runs = earned({ activities: [1, 2, 3, 4, 5].map(run) });
  assert.equal(runs.reaction_streak, nov(5));
  assert.equal(runs.dock_streak, null);
});

test('Dock Pilot patches are saved and kept like the others', () => {
  const s = recordEarned({}, MAYA, { first_dock: nov(4), dock_level3: null });
  assert.deepEqual(s[MAYA].earned, { first_dock: nov(4) });
  assert.deepEqual(parsePatchState(s)[MAYA].earned, { first_dock: nov(4) });
  const shelf = patchShelf({ first_dock: null }, s[MAYA].earned);
  assert.equal(shelf.find((p) => p.id === 'first_dock').earnedOn, nov(4));
});

// ---------- The CMO's week view ----------

test('weekSessions keeps its three games by default and includes Dock Pilot with GAME_KINDS', () => {
  const list = [dock(nov(4)), dock(nov(5)), dock(nov(5))];
  assert.deepEqual(Object.keys(weekSessions(list, MAYA, nov(5))), [...ACTIVITY_KINDS]);
  const w = weekSessions(list, MAYA, nov(5), GAME_KINDS);
  assert.deepEqual(w.dock_pilot, { count: 3, dates: [nov(4), nov(5)] });
  for (const word of ['precision', 'offset', 'speed', 'fuel', 'level']) assert.equal(JSON.stringify(w).includes(word), false, word);
});

// ---------- No result changes any status ----------

test('the dashboard, its cards and the overall status ignore Dock Pilot records', () => {
  const person = (extra) =>
    buildPersonDashboard({ crewId: MAYA, crewDays: DAYS, preflight: preflightOf(MAYA), saved: [], sensorDays: [], today: '2026-10-31', ...extra });
  const before = person({});
  const saved = [
    dock('2026-10-31', { level: 3, docked: false, final_offset_px: 300, final_speed: 200, hard_contacts: 9, fuel_used: 100 }),
    dock('2026-10-31', {}),
  ];
  const after = person({ saved });
  assert.deepEqual(after.statuses, before.statuses);
  assert.deepEqual(after.overall, before.overall);
  assert.deepEqual(after.cards, before.cards);
});

test('no Dock Pilot helper returns a status', () => {
  const list = [dock(nov(1)), dock(nov(2)), dock(nov(3), { docked: false, final_offset_px: 300 })];
  const hasStatus = (v) => JSON.stringify(v ?? null).includes('"status"');
  const s = fly(3, 5);
  assert.equal(hasStatus(createRound({ level: 3, seed: 1 })), false);
  assert.equal(hasStatus(s), false);
  assert.equal(hasStatus(roundResult(s)), false);
  assert.equal(hasStatus(dockUsual(list, MAYA, nov(5), 1)), false);
  assert.equal(hasStatus(dockBestToday(list, MAYA, nov(3), 1)), false);
  assert.equal(hasStatus(unlockedLevels(list, MAYA, nov(5))), false);
  assert.equal(hasStatus(earned({ activities: list })), false);
  assert.equal(hasStatus(weekSessions(list, MAYA, nov(3), GAME_KINDS)), false);
});

// ---------- Card and source ----------

test('the Dock Pilot card comes first, with its "why it helps" line and NASA HRP source', () => {
  assert.equal(GAMES[0].kind, 'dock_pilot');
  assert.equal(GAMES[0].helps, 'Hand-eye control and steady piloting.');
  assert.equal(GAMES.length, 4);
  assert.equal(
    DOCK_WHY,
    'Weightlessness changes balance and hand-eye control, which can affect piloting and fine tasks. A short docking game each day shows how steady your control is compared with your own usual.',
  );
  const src = sourceFor(GAMES[0].whySource);
  assert.equal(src.source_name, 'NASA Human Research Program');
  assert.equal(
    src.source_title,
    'Risk of Impaired Control of Spacecraft/Associated Systems and Decreased Mobility Due to Vestibular/Sensorimotor Alterations Associated with Space Flight',
  );
  assert.equal(src.source_url, null);
});
