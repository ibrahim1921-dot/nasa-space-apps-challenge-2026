// Everything on the main dashboard for one person, from their own data only:
//   - their crew.json days (latest day = the synthetic crew record, scored with the check-in engine
//     against the days before it: limits, 14-day baseline and slow drift),
//   - their crew.json `preflight` list (preflight averages),
//   - their check-ins saved on this device (a newer one overrides the crew record).
// Pure: data is passed in, so node:test runs exactly what the dashboard shows.
// Bones and muscles is not built here: views/Dashboard.jsx takes it from lib/fitness.js (grip strength).

import { applyVitals } from './vitalsDashboard.js';
import { applyReaction, crewRecordLatest, latestVitalsFor } from './personDashboard.js';
import { examView, sensorRecords } from './sensorRecords.js';
import { onOrBefore } from './demoState.js';

export const SPARK_DAYS = 14;

/**
 * The six main cards, in grid order (left column g1–g3, right column g4–g6).
 * dayKey: crew.json day field · readingKey: check-in reading field (null = not asked in the check-in).
 */
export const CARD_DEFS = [
  { id: 'sleep', area: 'g1', name: 'Sleep', unit: 'h', dayKey: 'sleepHours', readingKey: 'sleep_hours', limitKey: 'sleep_hours' },
  { id: 'reaction-time', area: 'g2', name: 'Reaction time', unit: 'ms', dayKey: 'reactionMs', readingKey: null, limitKey: 'reaction_test' },
  { id: 'mood', area: 'g3', name: 'Mood score', unit: '/ 5', dayKey: 'mood', readingKey: 'mood', limitKey: 'mood' },
  { id: 'blood-pressure', area: 'g4', name: 'Blood pressure', unit: 'mmHg', dayKey: 'systolic', readingKey: 'systolic', limitKey: 'blood_pressure' },
  { id: 'heart-rate', area: 'g5', name: 'Resting heart rate', unit: 'bpm', dayKey: 'heartRate', readingKey: 'heart_rate', limitKey: 'resting_hr' },
  { id: 'core-temperature', area: 'g6', name: 'Core temperature', unit: '°C', dayKey: 'temperature', readingKey: 'temperature', limitKey: 'temperature' },
];

/** Readings behind each body-map region. Bones and muscles comes from lib/fitness.js instead. */
export const REGION_READINGS = {
  head: ['mood', 'reaction', 'sleep_hours'],
  chest: ['blood_pressure', 'heart_rate'],
  abdomen: ['glucose'],
  wholeBody: ['temperature'],
};

/** The person's own cards shown first in a region's drawer. */
export const DRAWER_PINS = { head: ['sleep', 'mood'] };

const READING_NAMES = {
  sleep_hours: 'sleep',
  blood_pressure: 'blood pressure',
  heart_rate: 'resting heart rate',
  glucose: 'blood sugar',
  temperature: 'temperature',
  mood: 'mood',
  reaction: 'reaction time',
};
const READINGS = Object.keys(READING_NAMES);

const SEVERITY = { normal: 0, watch: 1, alert: 2 };
const worst = (list) => list.reduce((w, s) => (SEVERITY[s] > SEVERITY[w] ? s : w), 'normal');

/*
 * Overall health rule (the "Computed from your latest readings" score):
 *   start at 100, subtract 10 for each reading on watch and 30 for each reading on alert, across the
 *   7 readings (sleep, blood pressure, resting heart rate, blood sugar, temperature, mood, reaction
 *   time); clamp to 0–100. Status uses the score bar's own bands: 75–100 normal, 50–74 watch,
 *   0–49 alert. One alert alone gives 70 (watch); two alerts give 40 (alert).
 */
export const OVERALL_RULE = { start: 100, watch: 10, alert: 30, normalFrom: 75, watchFrom: 50 };

export function overallScore(statuses) {
  const list = READINGS.map((k) => statuses[k]).filter(Boolean);
  const raw = OVERALL_RULE.start - list.reduce((sum, s) => sum + (s === 'alert' ? OVERALL_RULE.alert : s === 'watch' ? OVERALL_RULE.watch : 0), 0);
  const score = Math.max(0, Math.min(100, raw));
  const status = score >= OVERALL_RULE.normalFrom ? 'normal' : score >= OVERALL_RULE.watchFrom ? 'watch' : 'alert';
  return { score, status };
}

const joinNames = (names) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Blood pressure is on alert; sleep and reaction time are on watch." */
export function overallReason(statuses) {
  const by = (level) => READINGS.filter((k) => statuses[k] === level).map((k) => READING_NAMES[k]);
  const parts = [];
  for (const level of ['alert', 'watch']) {
    const names = by(level);
    if (names.length) parts.push(`${joinNames(names)} ${names.length === 1 ? 'is' : 'are'} on ${level}`);
  }
  const counted = READINGS.filter((k) => statuses[k]).length || READINGS.length;
  if (!parts.length) return `All ${counted} readings are within your limits and usual range.`;
  return `${capital(parts.join('; '))}.`;
}

/** Status per reading from a scored record, plus reaction time from a crew record. */
export function statusesOf(record, reactionRecord) {
  const rows = record?.payload?.result?.indicators ?? {};
  const out = {};
  for (const k of READINGS) if (rows[k]) out[k] = rows[k].status;
  if (reactionRecord?.reaction) out.reaction = reactionRecord.reaction.status;
  return out;
}

export function regionStatusesFrom(statuses) {
  return Object.fromEntries(Object.entries(REGION_READINGS).map(([region, keys]) => [region, worst(keys.map((k) => statuses[k] ?? 'normal'))]));
}

const mean = (list) => list.reduce((s, v) => s + v, 0) / list.length;

/** The person's preflight average for one crew.json field, from their `preflight` list. */
export function preflightAverage(preflight, key) {
  const vals = (preflight ?? []).map((d) => d[key]).filter((v) => typeof v === 'number');
  return vals.length ? mean(vals) : null;
}

/**
 * @param {object} p
 * @param {string} p.crewId
 * @param {object[]} p.crewDays   the person's crew.json days
 * @param {object[]} p.preflight  the person's crew.json preflight list
 * @param {object[]} [p.saved]    the person's check-ins saved on this device (any order)
 * @param {object[]} [p.sensorDays] simulated sensor days up to the demo's today (lib/sensorFeed.js)
 * @param {string|null} [p.today]  the demo's today (YYYY-MM-DD); saved check-ins after it are left out until then
 * @param {(crewId: string) => string|null} [p.nameFor]  crew member names, for "Entered by" chips
 */
export function buildPersonDashboard({ crewId, crewDays, preflight = [], saved = [], sensorDays = [], today = null, nameFor }) {
  const days = [...(crewDays ?? [])].sort((a, b) => a.day - b.day);
  const crewRecord = crewRecordLatest(crewId, days);
  const crewAt = crewRecord ? Date.parse(crewRecord.recorded_at) : -Infinity;
  // Check-ins newer than the crew record, oldest first: they extend the sparklines and the newest wins.
  const newer = onOrBefore(saved, today)
    .filter((r) => r?.payload?.reading && Date.parse(r.recorded_at) > crewAt)
    .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
  // Sensor days, scored in the same timeline; a check-in on the same date replaces that day's sensor values.
  const sensors = sensorRecords({ crewId, crewDays: days, sensorDays, saved: newer });
  // CMO exams never add a day of their own: they are merged into that date's check-in or sensor day.
  const exams = examView({ crewDays: days, sensorDays, saved: newer });
  const shownSaved = newer.filter((r) => !exams.hidden.has(r.id)).map((r) => exams.overrides.get(r.id) ?? r);
  const entries = [...shownSaved, ...sensors].sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
  const latest = latestVitalsFor(crewRecord, entries.at(-1) ?? null);

  const points = [
    ...days.map((d) => ({ day: d })),
    ...entries.map((r) => (r.fromSensor ? { day: r.payload.day } : { reading: r.payload.reading })),
  ];
  const series = (def) =>
    points
      .map((p) => (p.day ? p.day[def.dayKey] : def.readingKey ? p.reading[def.readingKey] : undefined))
      .filter((v) => typeof v === 'number')
      .slice(-SPARK_DAYS);

  const sleepPre = preflightAverage(preflight, 'sleepHours');
  const cards = CARD_DEFS.map((def) => {
    const base = { id: def.id, name: def.name, unit: def.unit, limitKey: def.limitKey, status: 'normal', trend: 'flat', trendText: '' };
    const shown = def.id === 'reaction-time' ? applyReaction({ ...base, sample: true }, crewRecord) : applyVitals(base, latest, null, nameFor);
    const card = { ...shown, area: def.area, history: series(def) };
    if (def.id === 'sleep' && sleepPre !== null) {
      card.preflightAverage = { value: Number(sleepPre.toFixed(1)), text: `Preflight average: ${sleepPre.toFixed(1)} h` };
    }
    return card;
  });

  const statuses = statusesOf(latest, crewRecord);
  // "Since yesterday": the same rule on the reading before the latest one.
  const previous = entries.length
    ? statusesOf(entries.at(-2) ?? crewRecord, crewRecord)
    : (() => {
        const prev = crewRecordLatest(crewId, days.slice(0, -1));
        return statusesOf(prev, prev);
      })();
  const now = overallScore(statuses);
  const before = overallScore(previous);
  const overall = {
    score: now.score,
    status: now.status,
    changeSinceYesterday: now.score - before.score,
    reason: overallReason(statuses),
    rule: OVERALL_RULE,
  };

  return {
    crewRecord,
    latest,
    entries,
    cards,
    cardsById: Object.fromEntries(cards.map((c) => [c.id, c])),
    statuses,
    regions: regionStatusesFrom(statuses),
    overall,
  };
}
