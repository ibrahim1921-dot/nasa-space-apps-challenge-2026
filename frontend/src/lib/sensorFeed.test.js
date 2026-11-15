// Simulated wearable sensors: deterministic, per-person, with gaps and demo events. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEVICES,
  EVENT_TYPES,
  GAP_RATE,
  NOISE,
  SENSOR_KEYS,
  addDays,
  personalLevels,
  readingFromSensorDay,
  sensorDay,
  sensorDaysUntil,
} from './sensorFeed.js';
import { crewDaysOf } from './testSupport.js';

const LAST = '2026-10-30'; // last crew.json day for every crew member
const day = (crewId, n, demo = null) => sensorDay({ crewId, crewDays: crewDaysOf(crewId), date: addDays(LAST, n), demo });
const many = (crewId, n, demo = null) => Array.from({ length: n }, (_, i) => day(crewId, i + 1, demo));

// The practice repo kept the data generator at ml/generate_data.py. The monorepo's ml/ is the ML team's
// (no such file), so this cross-check skips there instead of failing.
const GENERATOR = new URL('../../../ml/generate_data.py', import.meta.url);
const hasGenerator = (() => {
  try {
    readFileSync(GENERATOR);
    return true;
  } catch {
    return false;
  }
})();

test('noise sizes are the same as NOISE in ml/generate_data.py', { skip: hasGenerator ? false : 'ml/generate_data.py is not in this repo layout' }, () => {
  const py = readFileSync(GENERATOR, 'utf8');
  const block = /NOISE = \{([\s\S]*?)\}/.exec(py)[1];
  for (const key of SENSOR_KEYS) {
    const m = new RegExp(`"${key}":\\s*([0-9.]+)`).exec(block);
    assert.ok(m, `${key} missing from generate_data.py NOISE`);
    assert.equal(NOISE[key], Number(m[1]), key);
  }
});

test('deterministic: same person and date give the same numbers on every call', () => {
  assert.deepEqual(day('crew-01', 3), day('crew-01', 3));
  assert.deepEqual(sensorDaysUntil({ crewId: 'crew-02', crewDays: crewDaysOf('crew-02'), untilDate: addDays(LAST, 5) }), many('crew-02', 5));
  assert.notDeepEqual(
    SENSOR_KEYS.map((k) => day('crew-01', 3)[k]),
    SENSOR_KEYS.map((k) => day('crew-01', 4)[k]),
  );
});

test('the feed never produces mood or the reaction test (sensors cannot know them)', () => {
  for (const d of many('crew-01', 30)) {
    assert.equal('mood' in d, false);
    assert.equal('reactionMs' in d, false);
    assert.equal(readingFromSensorDay(d).mood, null);
    assert.equal(d.simulated, true);
    assert.equal(d.source, 'sensor');
  }
});

test('sensor days exist only after the last crew.json day, and continue its day numbers', () => {
  assert.equal(day('crew-01', 0), null);
  assert.equal(day('crew-01', -3), null);
  const first = day('crew-01', 1);
  assert.equal(first.date, '2026-10-31');
  assert.equal(first.day, 61);
  assert.equal(first.missionDay, 143);
});

test('per-person levels: each person’s sensor values centre on their own last 14 crew.json days', () => {
  for (const crewId of ['crew-01', 'crew-02', 'crew-03', 'crew-04']) {
    const levels = personalLevels(crewDaysOf(crewId));
    const days = many(crewId, 300);
    for (const key of SENSOR_KEYS) {
      const values = days.map((d) => d[key]).filter((v) => typeof v === 'number');
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      // 300 draws with SD = NOISE: the average is within ~4 standard errors, plus rounding / clipping.
      const tolerance = (4 * NOISE[key]) / Math.sqrt(values.length) + (key === 'temperature' || key === 'sleepHours' ? 0.06 : 0.6);
      assert.ok(Math.abs(mean - levels[key].mean) < tolerance, `${crewId} ${key}: ${mean} vs ${levels[key].mean}`);
    }
  }
  // Different people, different levels.
  assert.notEqual(Math.round(personalLevels(crewDaysOf('crew-02')).systolic.mean), Math.round(personalLevels(crewDaysOf('crew-03')).systolic.mean));
});

test('gaps: about 1 day in 12 per device, values missing (null) with the reason', () => {
  const days = many('crew-01', 600);
  for (const [device, d] of Object.entries(DEVICES)) {
    const gaps = days.filter((x) => x.devices[device] === 'not worn');
    const rate = gaps.length / days.length;
    assert.ok(rate > GAP_RATE * 0.5 && rate < GAP_RATE * 1.6, `${device}: ${rate}`);
    for (const g of gaps) {
      for (const key of d.keys) assert.equal(g[key], null);
      const gap = g.gaps.find((x) => x.device === device);
      assert.equal(gap.reason, 'not worn');
      assert.match(gap.since, /^0[0-5]:00$/);
      for (const key of d.keys) assert.equal(key in g.provenance, false);
    }
  }
  const worn = days.find((x) => x.devices.shirt === 'ok');
  assert.equal(worn.provenance.systolic, 'sensor');
  assert.equal(typeof worn.systolic, 'number');
});

test('events: a fever adds +1.4 °C, +14 bpm and −1.0 h sleep for 3 days, for that person only', () => {
  const demo = { events: [{ crewId: 'crew-02', type: 'fever', startOffset: 2 }] };
  const { changes, days } = EVENT_TYPES.fever;
  assert.deepEqual(changes, { temperature: 1.4, heartRate: 14, sleepHours: -1.0 });
  for (let n = 1; n <= 6; n += 1) {
    const plain = day('crew-02', n);
    const ill = day('crew-02', n, demo);
    const active = n >= 2 && n < 2 + days;
    assert.deepEqual(ill.events, active ? ['fever'] : []);
    if (plain.temperature !== null) assert.ok(Math.abs(ill.temperature - plain.temperature - (active ? 1.4 : 0)) < 0.11, `day ${n}`);
    if (plain.heartRate !== null) assert.ok(Math.abs(ill.heartRate - plain.heartRate - (active ? 14 : 0)) <= 1, `day ${n}`);
    if (plain.sleepHours !== null && plain.sleepHours > 3.5) {
      assert.ok(Math.abs(ill.sleepHours - plain.sleepHours - (active ? -1 : 0)) < 0.11, `day ${n}`);
    }
    // Other crew are not affected.
    assert.deepEqual(day('crew-01', n, demo), day('crew-01', n));
  }
});

test('every event type changes only sensor readings', () => {
  for (const t of Object.values(EVENT_TYPES)) {
    for (const key of Object.keys(t.changes)) assert.ok(SENSOR_KEYS.includes(key), key);
    assert.ok(t.days >= 1);
  }
});
