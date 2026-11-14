// Per-person dashboard values. Each crew member's latest crew.json day (the synthetic crew record) is
// scored with the same check-in engine and used as their "latest vitals" until they save a newer
// check-in on this device. So Maya and Lena see their own numbers, never the same sample values.
// Pure functions: crew days and saved records are passed in.

import { evaluateSeries } from './baseline.js';
import { SCORED_ON, scoreCheckin } from './scoring.js';

export const CREW_RECORD_SOURCE = 'Synthetic crew record (crew.json)';

const shortDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** A crew.json day as a check-in reading (snake_case). */
export const readingFromDay = (day) => ({
  systolic: day.systolic,
  diastolic: day.diastolic,
  heart_rate: day.heartRate,
  glucose: day.glucose,
  temperature: day.temperature,
  sleep_hours: day.sleepHours,
  mood: day.mood,
});

/**
 * The person's newest crew.json day, scored against the days before it, in the saved-record shape
 * the dashboard already reads ({ recorded_at, payload: { reading, result } }).
 * @returns {object|null}
 */
export function crewRecordLatest(crewId, crewDays) {
  const days = [...(crewDays ?? [])].sort((a, b) => a.day - b.day);
  const last = days.at(-1);
  if (!last) return null;
  const at = `${last.date}T08:00:00.000Z`;
  const reading = readingFromDay(last);
  const result = scoreCheckin({ crewId, reading, crewDays: days.slice(0, -1), saved: [], at, scoredOn: SCORED_ON.device });
  const series = evaluateSeries(days).at(-1);
  return {
    id: `crew-record:${crewId}:${last.day}`,
    crew_id: crewId,
    kind: 'daily_vitals',
    recorded_at: at,
    payload: { origin: 'seed', reading, result, day: last },
    status: result.status,
    reasons: result.reasons,
    fromCrewRecord: true,
    source: `${CREW_RECORD_SOURCE}, ${shortDate(at)}`,
    reaction: series.indicators.reactionMs ?? null,
  };
}

/** The newer of the person's latest saved check-in on this device and their crew record. */
export function latestVitalsFor(crewRecord, savedLatest) {
  if (!savedLatest) return crewRecord;
  if (!crewRecord) return savedLatest;
  return Date.parse(savedLatest.recorded_at) >= Date.parse(crewRecord.recorded_at) ? savedLatest : crewRecord;
}

/** Note shown under a card's name: "Sample", the crew record date, or the check-in time. */
export function sourceNoteFor(record) {
  if (!record) return null;
  if (record.fromCrewRecord) return record.source;
  return `Your check-in, ${new Date(record.recorded_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
}

/** Reaction time (head region) from the crew record, which the daily check-in does not ask for. */
export function applyReaction(indicator, crewRecord) {
  if (indicator.id !== 'reaction-time' || !crewRecord?.reaction) return indicator;
  const r = crewRecord.reaction;
  return {
    ...indicator,
    value: Math.round(r.value),
    status: r.status,
    sample: false,
    sourceNote: crewRecord.source,
    trend: r.z > 0 ? 'up' : r.z < 0 ? 'down' : 'flat',
    trendText: r.reasons[0] ?? (r.usual ? `Usual ${Math.round(r.usual.mean)} ms (last ${r.usual.days} days)` : 'Within your usual range'),
    history: undefined,
  };
}
