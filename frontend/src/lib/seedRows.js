// The demo database contents, built from src/data/crew.json and src/data/standtests.json.
// Pure functions, used by the Crew Medical Officer view (device copy of the crew's readings) and
// by the tests. Rows carry a stable `key` (e.g. "daily:crew-01:17").

import { ENGINE_VERSION, INDICATORS, evaluateSeries } from './baseline.js';
import { STAND_TEST_ENGINE_VERSION, cleanStandTest, evaluateStandTest } from './standTest.js';

export const DEMO_MISSION = 'Demo mission';
export const CMO_CREW_ID = 'crew-03';
export const BASELINE_SOURCE = 'Synthetic preflight average (crew.json)';
export const SEED_ORIGIN = 'seed';
const SEED_TIME = 'T08:00:00.000Z';

const addDays = (isoDate, n) => {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const round2 = (v) => Number(v.toFixed(2));

/** crew_members rows. crew-03 (Lena Kowalski) is the CMO; everyone else is crew. */
export function seedCrewMembers(crewFile) {
  return crewFile.crew.map((c) => ({
    id: c.id,
    name: c.name,
    role: c.id === CMO_CREW_ID ? 'cmo' : 'crew',
    mission: DEMO_MISSION,
    title: c.role,
    launch_date: c.launchDate,
  }));
}

/** Every in-flight day as a daily_vitals reading, scored by the baseline engine over the series. */
export function seedDailyReadings(crewFile) {
  return crewFile.crew.flatMap((c) => {
    const days = [...c.days].sort((a, b) => a.day - b.day);
    const results = evaluateSeries(days);
    return days.map((day, i) => {
      const r = results[i];
      return {
        key: `daily:${c.id}:${day.day}`,
        crew_id: c.id,
        kind: 'daily_vitals',
        recorded_at: `${day.date}${SEED_TIME}`,
        payload: { origin: SEED_ORIGIN, day },
        status: r.overall,
        reasons: Object.keys(INDICATORS).flatMap((k) => r.indicators[k]?.reasons ?? []),
        engine_version: ENGINE_VERSION,
      };
    });
  });
}

/** Each person's preflight average (the `preflight` list in crew.json) as a baseline row. */
export function seedBaselines(crewFile) {
  return crewFile.crew.map((c) => {
    const pre = [...c.preflight].sort((a, b) => a.day - b.day);
    const means = Object.fromEntries(
      Object.keys(INDICATORS)
        .filter((k) => pre.some((d) => typeof d[k] === 'number'))
        .map((k) => {
          const vals = pre.map((d) => d[k]).filter((v) => typeof v === 'number');
          return [k, round2(vals.reduce((s, v) => s + v, 0) / vals.length)];
        }),
    );
    return {
      crew_id: c.id,
      kind: 'daily_vitals',
      payload: { ...means, days: pre.length, from: pre[0]?.timepoint ?? null, to: pre.at(-1)?.timepoint ?? null },
      source: BASELINE_SOURCE,
    };
  });
}

/**
 * The seeded preflight stand tests (post-landing tests are not crew readings in this database).
 * recorded_at = launch date + day_offset, at 08:00 UTC.
 */
export function seedStandTests(crewFile, standFile) {
  const launch = Object.fromEntries(crewFile.crew.map((c) => [c.id, c.launchDate]));
  const preflight = standFile.tests.filter((t) => t.phase === 'preflight');
  return preflight
    .sort((a, b) => a.crew_id.localeCompare(b.crew_id) || a.day_offset - b.day_offset)
    .map((t) => {
      const r = evaluateStandTest(t, preflight.filter((p) => p.crew_id === t.crew_id));
      return {
        key: `stand:${t.id}`,
        crew_id: t.crew_id,
        kind: 'stand_test',
        recorded_at: `${addDays(launch[t.crew_id], t.day_offset)}${SEED_TIME}`,
        payload: {
          origin: SEED_ORIGIN,
          seed_id: t.id,
          timepoint: t.timepoint,
          phase: t.phase,
          day_offset: t.day_offset,
          ...cleanStandTest(t),
        },
        status: r.status,
        reasons: r.reasons,
        engine_version: STAND_TEST_ENGINE_VERSION,
      };
    });
}

export function seedAll(crewFile, standFile) {
  return {
    crew: seedCrewMembers(crewFile),
    baselines: seedBaselines(crewFile),
    readings: [...seedDailyReadings(crewFile), ...seedStandTests(crewFile, standFile)],
  };
}
