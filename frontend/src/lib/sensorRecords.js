// Simulated sensor days as scored daily_vitals records, in the same shape as the other reading rows:
//   { id, crew_id, kind: 'daily_vitals', recorded_at, payload: { origin: 'sensor', day, reading, result,
//     provenance, devices, gaps, simulated: true }, status, reasons, fromSensor: true, source }
// Each sensor day is scored with the same engine as a check-in, against everything before it in the
// person's timeline (crew.json days, earlier sensor days and saved check-ins). The baseline engine is
// causal (a day only depends on the days before it), so one evaluateSeries() over the whole timeline
// gives each day exactly the result evaluateCheckin() would.
// Pure: no storage or network.

import { evaluateSeries } from './baseline.js';
import { SOURCE_ENTERED, SOURCE_SYNTHETIC } from './standTest.js';
import { SCORED_ON } from './scoring.js';
import { SENSOR_ORIGIN, SENSOR_TIME, readingFromSensorDay } from './sensorFeed.js';
import { CMO_EXAM, buildTimeline, checkinResultFrom, isExamItem, readingFromEntry } from './vitalsCheckin.js';

export const SENSOR_SOURCE = 'Simulated sensors';

const shortDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export const isSensorRecord = (r) => r?.payload?.origin === SENSOR_ORIGIN;
/** Is this saved record a CMO exam for a crew member? */
export const isExamRecord = (r) => isExamItem(r?.payload);

/** Saved records as timeline items. Exams keep their marker, id and examiner so merged days can say who. */
export function timelineItems(saved) {
  return saved
    .filter((r) => r?.payload?.reading && typeof r.recorded_at === 'string')
    .map((r) =>
      isExamRecord(r)
        ? { recorded_at: r.recorded_at, kind_detail: CMO_EXAM, ref: r.id, ...(r.payload.entered_by ? { entered_by: r.payload.entered_by } : {}), ...r.payload.reading }
        : { recorded_at: r.recorded_at, ...r.payload.reading },
    );
}

/**
 * @param {object} p
 * @param {string} p.crewId
 * @param {object[]} p.crewDays    crew.json days
 * @param {object[]} p.sensorDays  lib/sensorFeed.js days
 * @param {object[]} [p.saved]     saved check-in records ({ recorded_at, payload: { reading } }) to place in the timeline
 * @returns {object[]} one record per sensor day that no saved check-in replaced, oldest first
 */
export function sensorRecords({ crewId, crewDays, sensorDays, saved = [] }) {
  if (!sensorDays?.length) return [];
  const timeline = buildTimeline({ crewDays, sensorDays, saved: timelineItems(saved) });
  const series = evaluateSeries(timeline);
  const out = [];
  timeline.forEach((day, i) => {
    if (day.source !== SENSOR_ORIGIN) return;
    const reading = readingFromSensorDay(day);
    const result = checkinResultFrom(series[i], reading, i);
    const at = `${day.date}${SENSOR_TIME}`;
    out.push({
      id: `sensor:${crewId}:${day.date}`,
      crew_id: crewId,
      kind: 'daily_vitals',
      recorded_at: at,
      payload: {
        origin: SENSOR_ORIGIN,
        simulated: true,
        day,
        reading,
        result: {
          source: SOURCE_ENTERED,
          history_source: SOURCE_SYNTHETIC,
          crew_id: crewId,
          evaluated_at: at,
          reading,
          scored_on: SCORED_ON.device,
          ...result,
        },
        provenance: day.provenance,
        devices: day.devices,
        gaps: day.gaps,
        // CMO exams merged into this sensor day (their measured fields replaced the sensor values).
        ...(day.exams ? { exams: day.exams } : {}),
      },
      status: result.status,
      reasons: result.reasons,
      fromSensor: true,
      source: `${SENSOR_SOURCE}, ${shortDate(at)}`,
    });
  });
  return out;
}

/**
 * How CMO exams change the saved records a dashboard shows, from the same timeline as sensorRecords():
 *   - hidden:    exam ids merged into another entry of their date (that entry now shows their values);
 *   - overrides: saved id → the record to show instead: a check-in with exam values overlaid, or the
 *                newest exam of a date that has no other saved entry (sensor or crew.json day underneath,
 *                or nothing), each rescored as that merged day.
 * Sensor days with exams merged in come from sensorRecords() itself. Without exams both are empty.
 * @returns {{ hidden: Set<string>, overrides: Map<string, object> }}
 */
export function examView({ crewDays, sensorDays = [], saved = [] }) {
  const hidden = new Set();
  const overrides = new Map();
  const items = timelineItems(saved);
  if (!items.some(isExamItem)) return { hidden, overrides };
  const timeline = buildTimeline({ crewDays, sensorDays, saved: items });
  const series = evaluateSeries(timeline);
  const byId = new Map(saved.map((r) => [r.id, r]));
  timeline.forEach((day, i) => {
    if (!day.exams?.length) return;
    const examIds = day.exams.map((x) => x.ref).filter((id) => byId.has(id));
    examIds.forEach((id) => hidden.add(id));
    if (day.source === SENSOR_ORIGIN) return; // sensorRecords() shows it
    const reading = readingFromEntry(day);
    const result = checkinResultFrom(series[i], reading, i);
    // The base check-in of this date (latest one), if there is one; else the newest exam stands for the day.
    const checkins = saved
      .filter((r) => !isExamRecord(r) && r?.payload?.reading && r.recorded_at.slice(0, 10) === day.date)
      .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
    const base = !day.examOnly && checkins.at(-1);
    const shown = base || byId.get(examIds.at(-1));
    if (!shown) return;
    hidden.delete(shown.id);
    // Values underneath an exam that came from the crew.json day are marked 'seed' (no chip), never 'manual'.
    const underneath = base ? {} : Object.fromEntries(Object.keys(reading).filter((k) => reading[k] !== null).map((k) => [k, 'seed']));
    const provenance = { ...underneath, ...(shown.payload.provenance ?? {}), ...(day.provenance ?? {}) };
    overrides.set(shown.id, {
      ...shown,
      status: result.status,
      reasons: result.reasons,
      merged: true,
      payload: {
        ...shown.payload,
        reading,
        result: { ...shown.payload.result, ...result, reading },
        provenance,
        exams: day.exams,
      },
    });
  });
  return { hidden, overrides };
}

/**
 * The record a dashboard shows for the day an exam belongs to (the sensor day, check-in or exam stand-in
 * with the exam merged in), for chips on the exam's result screen. Falls back to the exam itself.
 */
export function mergedDayRecord({ crewId, crewDays, sensorDays = [], saved = [], examId }) {
  const exam = saved.find((r) => r.id === examId);
  if (!exam) return null;
  const view = examView({ crewDays, sensorDays, saved });
  const has = (r) => r.payload?.exams?.some((x) => x.ref === examId);
  for (const rec of view.overrides.values()) if (has(rec)) return rec;
  return sensorRecords({ crewId, crewDays, sensorDays, saved }).find(has) ?? exam;
}
