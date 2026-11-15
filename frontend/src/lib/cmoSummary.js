// Crew Medical Officer view: per-person cards (worst first), "Preflight vs now", and the feed of
// flagged readings. Pure functions over reading rows in the shared shape:
//   { id, crew_id, kind, recorded_at, payload, status, reasons, synced_at? }
// Seeded daily rows carry payload.day (crew.json keys); entered rows carry payload.reading (snake_case).

const RANK = { alert: 0, watch: 1, normal: 2, unknown: 3 };
const SEVERITY = { normal: 0, watch: 1, alert: 2 };
const worse = (a, b) => ((SEVERITY[a] ?? 0) >= (SEVERITY[b] ?? 0) ? a : b);
const newestFirst = (a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at);

/** Sleep, resting heart rate and blood pressure from either payload shape, or null. */
export function vitalsOf(row) {
  const day = row?.payload?.day;
  if (day) return { sleepHours: day.sleepHours, heartRate: day.heartRate, systolic: day.systolic, diastolic: day.diastolic };
  const r = row?.payload?.reading;
  if (r) return { sleepHours: r.sleep_hours, heartRate: r.heart_rate, systolic: r.systolic, diastolic: r.diastolic };
  return null;
}

const isSeed = (row) => row?.payload?.origin === 'seed';

/** "Preflight vs now" for sleep, resting HR and BP. Empty when either side is missing. */
export function preflightVsNow(baseline, latestVitalsRow) {
  const before = baseline?.payload;
  const now = vitalsOf(latestVitalsRow);
  if (!before || !now) return [];
  const one = (v) => Number(v).toFixed(1);
  const whole = (v) => String(Math.round(v));
  return [
    {
      id: 'sleep',
      label: 'Sleep',
      unit: 'h',
      before: one(before.sleepHours),
      now: one(now.sleepHours),
      change: Number((now.sleepHours - before.sleepHours).toFixed(1)),
      worseWhen: 'lower',
    },
    {
      id: 'heart_rate',
      label: 'Resting heart rate',
      unit: 'bpm',
      before: whole(before.heartRate),
      now: whole(now.heartRate),
      change: Math.round(now.heartRate - before.heartRate),
      worseWhen: 'higher',
    },
    {
      id: 'blood_pressure',
      label: 'Blood pressure',
      unit: 'mmHg',
      before: `${whole(before.systolic)}/${whole(before.diastolic)}`,
      now: `${whole(now.systolic)}/${whole(now.diastolic)}`,
      change: Math.round(now.systolic - before.systolic),
      worseWhen: 'higher',
    },
  ].filter((row) => {
    const keys = { sleep: ['sleepHours'], heart_rate: ['heartRate'], blood_pressure: ['systolic', 'diastolic'] }[row.id];
    return keys.every((key) => Number.isFinite(before[key]) && Number.isFinite(now[key]));
  });
}

/**
 * One card per crew member, sorted worst first (alert, watch, normal), then by crew order.
 * The card status is the worse of the latest vitals and the latest in-flight stand test; a seeded
 * preflight stand test is shown for reference but does not set the status.
 */
export function buildCrewCards({ crew, readings, baselines }) {
  const cards = crew.map((c, order) => {
    const mine = readings.filter((r) => r.crew_id === c.id).sort(newestFirst);
    const vitals = mine.find((r) => r.kind === 'daily_vitals') ?? null;
    const stands = mine.filter((r) => r.kind === 'stand_test');
    const standInFlight = stands.find((r) => !isSeed(r)) ?? null;
    const stand = standInFlight ?? stands[0] ?? null;
    const status = vitals || standInFlight ? worse(vitals?.status ?? 'normal', standInFlight?.status ?? 'normal') : 'unknown';
    return {
      id: c.id,
      name: c.name,
      title: c.title ?? null,
      role: c.role,
      order,
      status,
      vitals,
      stand,
      standIsPreflight: Boolean(stand && !standInFlight),
      comparison: preflightVsNow(baselines.find((b) => b.crew_id === c.id && b.kind === 'daily_vitals'), vitals),
    };
  });
  return cards.sort((a, b) => RANK[a.status] - RANK[b.status] || a.order - b.order);
}

/** The newest watch / alert readings, newest first. */
export function flaggedFeed(readings, limit = 12) {
  return readings.filter((r) => r.status === 'watch' || r.status === 'alert').sort(newestFirst).slice(0, limit);
}

/** Count of cards per status, for the strip at the top of the view. */
export function statusCounts(cards) {
  return cards.reduce((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), { alert: 0, watch: 0, normal: 0 });
}

/** Rows from the server, plus this device's records the server does not have yet. Server rows win. */
export function mergeReadings(serverRows, localRecords) {
  const ids = new Set(serverRows.map((r) => r.id));
  return [...serverRows, ...localRecords.filter((r) => !ids.has(r.id))];
}
