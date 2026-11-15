// Dock Pilot: fly a capsule into the station's docking ring. Pure, deterministic functions only (a seeded
// random number generator), so node:test runs exactly what the screen shows. The screen calls step() on a
// fixed 1/60 s clock and draws the state; nothing here touches the DOM.
//
// Game rules (team-set values in content/activities.js ACTIVITY_SETTINGS.dock):
//   - No friction, as in orbit: thrusters change the velocity; with no input the capsule keeps moving.
//   - Level 1: no drift. Level 2: a slow steady drift (a constant push in a seeded direction).
//     Level 3: drift, a "solar wind" nudge every 4–6 s, and a smaller ring.
//   - Docked: centre inside the capture zone with speed under the limit. Entering the ring zone faster
//     than the limit is a hard contact: counted once per entry, the capsule bounces back, the round goes on.
//   - Running out of fuel stops the thrusters, not the round. A round lasts at most 60 s.
//   - Offset: docking latches as soon as the capsule is slow inside the capture zone, so it always happens
//     at the zone's edge. For a docked round the offset is therefore the approach offset: how far off-centre
//     the capsule's path was heading at contact (0 = flying straight at the centre). For a round that did
//     not dock, it is the plain distance to the port's centre.
// Results are "Logged · not scored": the precision score is a game number, never a health status.

import { ACTIVITY_SETTINGS } from '../content/activities.js';
import { dateOf, median, visible } from './activities.js';

const D = ACTIVITY_SETTINGS.dock;
export const LEVELS = Object.freeze(Object.keys(D.levels).map(Number));
export const levelOf = (level) => D.levels[level] ?? null;

const round1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

// ---------- Seeded random numbers (mulberry32) ----------

/** One step of mulberry32. @returns {[number, number]} [value in [0, 1), next seed] */
export function nextRandom(seed) {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

// ---------- Round ----------

/**
 * A new round at its start: the capsule at rest by the left edge, the port on the right.
 * @param {{ level: 1|2|3, seed?: number }} p
 */
export function createRound({ level, seed = 1 }) {
  const L = levelOf(level);
  if (!L) throw new Error(`Unknown Dock Pilot level ${level}`);
  let rng = seed >>> 0;
  let r;
  [r, rng] = nextRandom(rng);
  const angle = r * Math.PI * 2;
  let nextWindS = null;
  if (L.wind) {
    [r, rng] = nextRandom(rng);
    nextWindS = L.wind.minS + r * (L.wind.maxS - L.wind.minS);
  }
  return {
    level,
    t: 0,
    x: D.start.x,
    y: D.start.y,
    vx: 0,
    vy: 0,
    drift: L.drift ? { ax: Math.cos(angle) * L.drift, ay: Math.sin(angle) * L.drift } : { ax: 0, ay: 0 },
    fuel: D.fuelMax,
    rng,
    nextWindS,
    inRing: false,
    hardContacts: 0,
    docked: false,
    dockOffset: null,
    over: false,
    thrusting: { x: 0, y: 0 },
    events: [], // what happened in the last step: 'hard_contact' | 'wind' | 'out_of_fuel' | 'docked' | 'time_up'
  };
}

export const offsetOf = (s) => Math.hypot(s.x - D.port.x, s.y - D.port.y);
export const speedOf = (s) => Math.hypot(s.vx, s.vy);
export const timeLeft = (s) => Math.max(0, D.roundS - s.t);

/**
 * Advance one step. `input` is the held thrusters per axis, -1 | 0 | 1 (x: right is +, y: down is +).
 * Holding left and right together cancels out. Returns a new state; the old one is not changed.
 * @param {object} s     a state from createRound / step
 * @param {{ x?: number, y?: number }} input
 * @param {number} [dt]  seconds (the screen always passes the fixed step)
 */
export function step(s, input = {}, dt = D.stepS) {
  if (s.over) return { ...s, events: [], thrusting: { x: 0, y: 0 } };
  const L = levelOf(s.level);
  const events = [];
  let { x, y, vx, vy, fuel, rng, nextWindS, inRing, hardContacts } = s;
  const t = s.t + dt;

  // Thrusters: each axis held burns fuel; with no fuel left, no thrust.
  const want = { x: sign(input.x ?? 0), y: sign(input.y ?? 0) };
  const axes = (want.x ? 1 : 0) + (want.y ? 1 : 0);
  const thrusting = { x: 0, y: 0 };
  if (axes && fuel > 0) {
    fuel = Math.max(0, fuel - axes * L.fuelPerS * dt);
    vx += want.x * D.thrust * dt;
    vy += want.y * D.thrust * dt;
    thrusting.x = want.x;
    thrusting.y = want.y;
    if (fuel === 0) events.push('out_of_fuel');
  }

  // Drift: a steady push. Solar wind: an instant nudge in a seeded direction.
  vx += s.drift.ax * dt;
  vy += s.drift.ay * dt;
  if (L.wind && nextWindS !== null && t >= nextWindS) {
    let r;
    [r, rng] = nextRandom(rng);
    const a = r * Math.PI * 2;
    vx += Math.cos(a) * L.wind.dv;
    vy += Math.sin(a) * L.wind.dv;
    [r, rng] = nextRandom(rng);
    nextWindS = t + L.wind.minS + r * (L.wind.maxS - L.wind.minS);
    events.push('wind');
  }

  x += vx * dt;
  y += vy * dt;

  // The play area's edge: the capsule stops there on that axis.
  const r0 = D.capsuleR;
  if (x < r0 || x > D.world.w - r0) {
    x = clamp(x, r0, D.world.w - r0);
    vx = 0;
  }
  if (y < r0 || y > D.world.h - r0) {
    y = clamp(y, r0, D.world.h - r0);
    vy = 0;
  }

  // The ring: hard contact on entering too fast (once per entry), docking once slow enough inside.
  const offset = Math.hypot(x - D.port.x, y - D.port.y);
  const speed = Math.hypot(vx, vy);
  const nowIn = offset <= L.ringR;
  let docked = false;
  let dockOffset = null;
  if (nowIn && !inRing && speed > D.dockSpeed) {
    hardContacts += 1;
    vx = -vx * D.bounce;
    vy = -vy * D.bounce;
    events.push('hard_contact');
  } else if (offset <= L.captureR && speed <= D.dockSpeed) {
    docked = true;
    dockOffset = approachOffset(x, y, vx, vy);
    events.push('docked');
  }
  inRing = nowIn;

  const timeUp = !docked && t >= D.roundS - 1e-9;
  if (timeUp) events.push('time_up');
  return {
    ...s,
    t: docked || !timeUp ? t : D.roundS,
    x,
    y,
    vx,
    vy,
    fuel,
    rng,
    nextWindS,
    inRing,
    hardContacts,
    docked,
    dockOffset,
    over: docked || timeUp,
    thrusting,
    events,
  };
}

/**
 * How far the line through (x, y) along the velocity passes from the port's centre (px). Nearly at rest,
 * the direction means nothing, so the plain distance is used.
 */
export function approachOffset(x, y, vx, vy) {
  const dx = D.port.x - x;
  const dy = D.port.y - y;
  const dist = Math.hypot(dx, dy);
  const v = Math.hypot(vx, vy);
  if (v < 0.5) return dist;
  const along = (dx * vx + dy * vy) / v; // moving away from the centre: no credit for aim
  if (along <= 0) return dist;
  return Math.min(dist, Math.abs(dx * vy - dy * vx) / v);
}

/** The saved record's data for a finished (or stopped) round. */
export function roundResult(s) {
  return {
    level: s.level,
    docked: s.docked,
    time_s: round1(Math.min(s.t, D.roundS)),
    final_offset_px: round1(s.docked && s.dockOffset !== null ? s.dockOffset : offsetOf(s)),
    final_speed: round1(speedOf(s)),
    hard_contacts: s.hardContacts,
    fuel_used: round1(clamp(D.fuelMax - s.fuel, 0, D.fuelMax)),
  };
}

// ---------- Precision (a game number, 0–100) ----------

/**
 * Precision from offset, speed and fuel only (not time, not hard contacts):
 *   offset  50 × (1 − offset ÷ ring radius), 0 outside the ring
 *   speed   30 × (1 − speed ÷ (2 × dock limit))   } only when the round ends inside the ring, so
 *   fuel    20 × (1 − fuel used ÷ 100)            } drifting idle far from the port scores 0
 * Rounded and kept within 0–100.
 */
export function precisionScore({ level, final_offset_px, final_speed, fuel_used }) {
  const L = levelOf(level);
  if (!L) return 0;
  const P = D.score;
  const off = Math.max(0, final_offset_px);
  if (!(off <= L.ringR)) return 0;
  const pts =
    P.offset * (1 - off / L.ringR) +
    P.speed * (1 - clamp(final_speed / (2 * D.dockSpeed), 0, 1)) +
    P.fuel * (1 - clamp(fuel_used / D.fuelMax, 0, 1));
  return clamp(Math.round(pts), 0, 100);
}

// ---------- From the activity log ----------

const roundsAt = (records, crewId, demoDate, level) =>
  visible(records, { demoDate, crewId, kind: 'dock_pilot' }).filter((r) => level === undefined || r.data.level === level);

/**
 * "Your usual": the median precision of the player's last 7 rounds at this level, from 3 rounds on.
 * @returns {{ usual: number, rounds: number } | null}
 */
export function dockUsual(records, crewId, demoDate, level) {
  const scores = roundsAt(records, crewId, demoDate, level).map((r) => precisionScore(r.data)).slice(-D.baselineRounds);
  if (scores.length < D.baselineMinRounds) return null;
  return { usual: Math.round(median(scores)), rounds: scores.length };
}

/** The player's best precision at this level on the demo's today (null before the first round). */
export function dockBestToday(records, crewId, demoDate, level) {
  const scores = roundsAt(records, crewId, demoDate, level)
    .filter((r) => dateOf(r) === demoDate)
    .map((r) => precisionScore(r.data));
  return scores.length ? Math.max(...scores) : null;
}

/** Level 1 is always open; each next level opens after one docking at the level before it. */
export function unlockedLevels(records, crewId, demoDate) {
  const docked = new Set(
    roundsAt(records, crewId, demoDate)
      .filter((r) => r.data.docked)
      .map((r) => r.data.level),
  );
  const open = [];
  for (const lv of LEVELS) {
    if (open.length && !(open.at(-1) === lv - 1 && docked.has(lv - 1))) break;
    open.push(lv);
  }
  return open;
}
