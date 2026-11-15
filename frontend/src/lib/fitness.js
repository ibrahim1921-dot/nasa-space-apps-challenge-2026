// Bones and muscles: each crew member's grip strength against their OWN preflight value, plus where
// their preflight fitness tests sit for their age and sex. Data: data/fitness.json (ml/fitness.py).
// The watch and alert lines for the drop are in content/limits.js (grip_drop).
// Pure, so node:test runs exactly what the body map shows.

import fitnessFile from '../data/fitness.json' with { type: 'json' };
import { crossingPhrase, rangeStatus, worstLimit } from './rangeCheck.js';

export const SOURCE_NOTE = 'Synthetic crew record · percentile from general human data (Body performance)';
const SPARK_WEEKS = 14;

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st. */
export function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

/** Approximate percentile (1–99) of a value, given the values at the file's percentiles. */
export function percentileOf(value, qvals, quantiles) {
  if (value <= qvals[0]) return Math.max(1, Math.round((quantiles[0] * value) / qvals[0]));
  if (value >= qvals.at(-1)) return 99;
  for (let i = 1; i < qvals.length; i += 1) {
    if (value <= qvals[i]) {
      const t = (value - qvals[i - 1]) / (qvals[i] - qvals[i - 1] || 1);
      return Math.round(quantiles[i - 1] + t * (quantiles[i] - quantiles[i - 1]));
    }
  }
  return 99;
}

/** Percentile of one test result for this age and sex (ages outside the data use the nearest age). */
export function percentileFor(file, testId, sex, age, value) {
  const [lo, hi] = file.ages;
  const row = file.tests[testId].by_sex[sex][Math.min(hi, Math.max(lo, age)) - lo];
  return percentileOf(value, row, file.quantiles);
}

const who = (sex, age) => `a ${age}-year-old ${sex === 'female' ? 'woman' : 'man'}`;

/**
 * Drawer rows for one person, grip first. Grip status comes from the drop since preflight.
 * @returns {{ grip: object, rows: object[] } | null}  null for an unknown crew id
 */
export function fitnessFor(crewId, file = fitnessFile) {
  const person = file.crew.find((c) => c.crewId === crewId);
  if (!person) return null;
  const pre = person.preflight.grip_force;
  const weeks = person.inflight_grip;
  const latest = weeks.at(-1);
  const change = (100 * (latest.grip_force - pre)) / pre;
  const drop = Math.max(0, -change);
  const r = rangeStatus('grip_drop', drop);
  const status = r.status ?? 'normal';
  const reasons =
    status === 'normal' ? [] : [`${drop.toFixed(1)}% drop from preflight is ${crossingPhrase(worstLimit(r.matched))}`];
  const pct = percentileFor(file, 'grip_force', person.sex, person.age, pre);

  const grip = {
    id: 'grip-strength',
    name: 'Grip strength',
    value: latest.grip_force.toFixed(1),
    unit: 'kg',
    status,
    reasons,
    trend: change < 0 ? 'down' : change > 0 ? 'up' : 'flat',
    trendText:
      reasons[0] ??
      `${change < 0 ? 'Down' : 'Up'} ${Math.abs(change).toFixed(1)}% from your preflight ${pre.toFixed(1)} kg (week ${latest.week} in flight)`,
    history: weeks.slice(-SPARK_WEEKS).map((w) => w.grip_force),
    limitKey: 'grip_strength',
    sample: false,
    sourceNote: SOURCE_NOTE,
    preflightAverage: { value: pre, text: `Preflight: ${pre.toFixed(1)} kg, ${ordinal(pct)} percentile for ${who(person.sex, person.age)}` },
    dropPct: Number(drop.toFixed(1)),
  };

  const preflightRow = (id, testId, name, unit) => {
    const value = person.preflight[testId];
    const p = percentileFor(file, testId, person.sex, person.age, value);
    return {
      id,
      name,
      value: String(value),
      unit,
      status: 'normal',
      trend: 'flat',
      trendText: `${ordinal(p)} percentile for ${who(person.sex, person.age)}. Repeat after landing on the Moon or Mars.`,
      sample: false,
      sourceNote: SOURCE_NOTE,
    };
  };

  return {
    grip,
    rows: [
      grip,
      preflightRow('broad-jump-preflight', 'broad_jump', 'Standing broad jump (preflight)', 'cm'),
      preflightRow('sit-ups-preflight', 'sit_ups', 'Sit-ups (preflight)', 'count'),
    ],
  };
}
