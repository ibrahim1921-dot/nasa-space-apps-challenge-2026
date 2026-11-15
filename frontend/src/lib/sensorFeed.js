// Simulated wearable sensors. Stations record most daily vitals with worn devices:
//   - shirt:     CSA Bio-Monitor smart shirt (blood pressure, pulse), including during sleep
//   - cgm:       continuous glucose monitor (flown on Ax-4, 2025)
//   - headband:  ESA T-Mini style core-temperature sensor
//   - actigraph: wrist actigraph (Actiwatch) for sleep
// Every value here is SIMULATED from the person's own crew.json days. Mood is never produced:
// sensors cannot know it.
// Pure and deterministic: a small PRNG is seeded from crewId + date + sensor, so every device and
// every reload shows the same numbers. No Math.random, no storage, no network.

/** Day-to-day noise sizes, the same as NOISE in ml/generate_data.py. */
export const NOISE = {
  systolic: 4.0,
  diastolic: 3.0,
  heartRate: 3.0,
  glucose: 5.0,
  temperature: 0.15,
  sleepHours: 0.4,
};

/** crew.json keys the sensors produce, in display order. */
export const SENSOR_KEYS = Object.keys(NOISE);

/** The worn devices and the crew.json keys each one records. */
export const DEVICES = {
  shirt: { label: 'shirt', name: 'Bio-Monitor shirt', keys: ['systolic', 'diastolic', 'heartRate'] },
  cgm: { label: 'glucose monitor', name: 'Continuous glucose monitor', keys: ['glucose'] },
  headband: { label: 'headband', name: 'Core-temperature headband', keys: ['temperature'] },
  actigraph: { label: 'actigraph', name: 'Wrist actigraph', keys: ['sleepHours'] },
};
export const DEVICE_IDS = Object.keys(DEVICES);

/** crew.json key → check-in reading key (snake_case), for provenance. */
export const READING_KEY_OF = {
  systolic: 'systolic',
  diastolic: 'diastolic',
  heartRate: 'heart_rate',
  glucose: 'glucose',
  temperature: 'temperature',
  sleepHours: 'sleep_hours',
};

/** Check-in reading key → the device that records it (mood has none). */
export const DEVICE_OF_READING = Object.fromEntries(
  Object.entries(DEVICES).flatMap(([device, d]) => d.keys.map((k) => [READING_KEY_OF[k], device])),
);

/** About one day in 12 per device, the device was not worn. */
export const GAP_RATE = 1 / 12;
/** Personal levels come from the last 14 crew.json days. */
export const LEVEL_DAYS = 14;
/** Sensor days are stamped at wake-up time (UTC). */
export const SENSOR_TIME = 'T06:00:00.000Z';
export const SENSOR_ORIGIN = 'sensor';

/**
 * Demo events, from EVENTS in ml/generate_data.py (only the changes a sensor can see).
 * fever = the planted fever; stress = the stress_week; poor_sleep_week = the stress_week's sleep loss alone.
 */
export const EVENT_TYPES = {
  fever: {
    label: 'Fever',
    description: 'Viral infection: fever, raised heart rate, poor sleep',
    days: 3,
    changes: { temperature: 1.4, heartRate: 14, sleepHours: -1.0 },
  },
  poor_sleep_week: {
    label: 'Poor sleep week',
    description: 'A week of short sleep',
    days: 7,
    changes: { sleepHours: -1.3 },
  },
  stress: {
    label: 'Stress',
    description: 'High-workload week: short sleep, raised heart rate and blood pressure',
    days: 7,
    changes: { systolic: 6, heartRate: 6, sleepHours: -1.3 },
  },
};
export const EVENT_TYPE_IDS = Object.keys(EVENT_TYPES);

// ---------- Dates ----------

const DAY_MS = 24 * 60 * 60 * 1000;
export const addDays = (isoDate, n) => new Date(Date.parse(`${isoDate}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (fromIso, toIso) =>
  Math.round((Date.parse(`${toIso}T00:00:00.000Z`) - Date.parse(`${fromIso}T00:00:00.000Z`)) / DAY_MS);

// ---------- PRNG ----------

/** FNV-1a 32-bit hash of a string. */
export function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small, fast, seeded PRNG returning numbers in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The PRNG for one person, one date and one sensor (or gap draw). */
export const rngFor = (crewId, date, sensor) => mulberry32(hashString(`${crewId}|${date}|${sensor}`));

/** Standard normal draw (Box–Muller). */
function gaussian(rand) {
  let u = rand();
  while (u <= Number.EPSILON) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

// ---------- Levels ----------

const sorted = (crewDays) => [...(crewDays ?? [])].sort((a, b) => a.day - b.day);

/**
 * The person's own levels: mean and spread (SD) of their last 14 crew.json days per sensor key.
 * @returns {{ [key: string]: { mean: number, sd: number, days: number } }}
 */
export function personalLevels(crewDays) {
  const recent = sorted(crewDays).slice(-LEVEL_DAYS);
  return Object.fromEntries(
    SENSOR_KEYS.map((key) => {
      const values = recent.map((d) => d[key]).filter((v) => typeof v === 'number');
      const n = values.length;
      const mean = n ? values.reduce((s, v) => s + v, 0) / n : null;
      const sd = n > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
      return [key, { mean, sd, days: n }];
    }),
  );
}

const round = (key, v) => {
  if (key === 'temperature') return Number(v.toFixed(1));
  if (key === 'sleepHours') return Number(Math.min(10, Math.max(2, v)).toFixed(1));
  return Math.round(v);
};

/** Events for this person that cover a day `offset` days after the last crew.json day. */
export function eventsOn(demo, crewId, offset) {
  return (demo?.events ?? []).filter((e) => {
    const type = EVENT_TYPES[e.type];
    return type && e.crewId === crewId && offset >= e.startOffset && offset < e.startOffset + type.days;
  });
}

/**
 * One simulated sensor day, in the crew.json day shape (no mood, no reaction test).
 * @param {object} p
 * @param {string} p.crewId
 * @param {object[]} p.crewDays  the person's crew.json days
 * @param {string} p.date        ISO date (YYYY-MM-DD), after the last crew.json day
 * @param {{ events?: object[] }} [p.demo]  demo state; only `events` is used here
 * @returns {object|null} null for dates on or before the last crew.json day
 */
export function sensorDay({ crewId, crewDays, date, demo = null }) {
  const days = sorted(crewDays);
  const last = days.at(-1);
  if (!last) return null;
  const offset = daysBetween(last.date, date);
  if (!(offset >= 1)) return null;

  const levels = personalLevels(days);
  const active = eventsOn(demo, crewId, offset);
  const values = {};
  for (const key of SENSOR_KEYS) {
    if (levels[key].mean === null) {
      values[key] = null;
      continue;
    }
    let v = levels[key].mean + gaussian(rngFor(crewId, date, key)) * NOISE[key];
    for (const e of active) v += EVENT_TYPES[e.type].changes[key] ?? 0;
    values[key] = round(key, v);
  }
  // Keep the two BP numbers in a possible order (the noise is independent).
  if (values.systolic !== null && values.diastolic !== null && values.diastolic >= values.systolic) {
    values.diastolic = values.systolic - 10;
  }

  const devices = {};
  const gaps = [];
  for (const [device, d] of Object.entries(DEVICES)) {
    const rand = rngFor(crewId, date, `gap:${device}`);
    const notWorn = rand() < GAP_RATE;
    devices[device] = notWorn ? 'not worn' : 'ok';
    if (notWorn) {
      for (const key of d.keys) values[key] = null;
      gaps.push({ device, reason: 'not worn', since: `${String(Math.floor(rand() * 6)).padStart(2, '0')}:00` });
    }
  }

  const provenance = {};
  for (const key of SENSOR_KEYS) if (values[key] !== null) provenance[READING_KEY_OF[key]] = 'sensor';

  return {
    day: last.day + offset,
    ...(typeof last.missionDay === 'number' ? { missionDay: last.missionDay + offset } : {}),
    date,
    source: SENSOR_ORIGIN,
    simulated: true,
    ...values,
    devices,
    provenance,
    gaps,
    events: active.map((e) => e.type),
  };
}

/** Every sensor day from the day after the last crew.json day up to and including `untilDate`. */
export function sensorDaysUntil({ crewId, crewDays, untilDate, demo = null }) {
  const last = sorted(crewDays).at(-1);
  if (!last || !untilDate) return [];
  const n = daysBetween(last.date, untilDate);
  const out = [];
  for (let i = 1; i <= n; i += 1) out.push(sensorDay({ crewId, crewDays, date: addDays(last.date, i), demo }));
  return out;
}

/** A sensor day as a check-in reading (snake_case). Missing values are null; mood is always null. */
export const readingFromSensorDay = (day) => ({
  systolic: day.systolic ?? null,
  diastolic: day.diastolic ?? null,
  heart_rate: day.heartRate ?? null,
  glucose: day.glucose ?? null,
  temperature: day.temperature ?? null,
  sleep_hours: day.sleepHours ?? null,
  mood: null,
});
