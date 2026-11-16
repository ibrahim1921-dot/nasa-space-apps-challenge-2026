// Put the latest daily-vitals check-in onto the dashboard's indicators.
// Pure functions: the dashboard passes in the mock indicators and the newest saved record.
// Where no check-in exists yet the mock value stays, marked `sample: true`.

import { formatRowValue } from './vitalsCheckin.js';
import { sourceNoteFor } from './personDashboard.js';
import { rowProvenance } from './provenance.js';
import { DEVICES, DEVICE_OF_READING } from './sensorFeed.js';
import { contextForRecord, indicatorCode } from './observationContext.js';

/** Dashboard indicator id → daily-vitals result row id. */
export const DASHBOARD_VITALS = {
  sleep: 'sleep_hours',
  'blood-pressure': 'blood_pressure',
  'heart-rate': 'heart_rate',
  'fasting-glucose': 'glucose',
  'core-temperature': 'temperature',
  mood: 'mood',
};

/** Body regions that hold a daily-vitals indicator. */
const REGION_VITALS = { chest: ['blood_pressure', 'heart_rate'], abdomen: ['glucose'] };

const RANK = { normal: 0, watch: 1, alert: 2 };

/** Result row id → the reading key that holds its value (for "not worn" wording). */
const ROW_READING = { blood_pressure: 'systolic', heart_rate: 'heart_rate', glucose: 'glucose', temperature: 'temperature', sleep_hours: 'sleep_hours', mood: 'mood' };

/** Why a reading is missing from the newest record, in plain words. */
export function missingText(record, rowId) {
  if (rowId === 'mood') return 'Mood: not answered today';
  const device = DEVICE_OF_READING[ROW_READING[rowId]];
  if (device && record?.payload?.devices?.[device] === 'not worn') return `No reading today: ${DEVICES[device].label} not worn`;
  return 'No reading today';
}

const shortDate = (iso) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function trendVsUsual(row) {
  if (!row.usual) return 'flat';
  const value = row.id === 'blood_pressure' ? row.value.systolic : row.value;
  const mean = row.id === 'blood_pressure' ? row.usual.mean.systolic : row.usual.mean;
  if (value > mean) return 'up';
  if (value < mean) return 'down';
  return 'flat';
}

/**
 * @param {object} indicator  a dashboard indicator (lib/personCards.js or mocks/regions.js shape)
 * @param {object|null} record  newest daily_vitals record for the current crew member
 * @param {object|null} usual  { [rowId]: { text, days } }, shown when the record has no row for this indicator
 */
export function applyVitals(indicator, record, usual = null, nameFor = undefined) {
  const rowId = DASHBOARD_VITALS[indicator.id];
  // Not a daily-vitals indicator: still mock data, the same for everyone, so it is labelled "Sample".
  if (!rowId) return indicator.sample === false ? indicator : { ...indicator, sample: true };
  const row = record?.payload?.result?.indicators?.[rowId];
  if (!row && record?.payload?.result?.missing?.includes(rowId)) {
    // The newest record has no value here (mood not answered, or a sensor not worn): say so, never guess.
    const text = missingText(record, rowId);
    return {
      ...indicator,
      value: '—',
      status: 'normal',
      missing: true,
      missingText: text,
      sample: false,
      sourceNote: sourceNoteFor(record),
      checkedAt: record.recorded_at,
      trend: 'flat',
      trendText: text,
      usual: usual?.[rowId] ?? null,
      provenance: null,
      history: undefined,
    };
  }
  if (!row) {
    return { ...indicator, sample: true, usual: usual?.[rowId] ?? null };
  }
  const flagged = row.status !== 'normal';
  // Measurement conditions (teammate feature, f291403). Heart rate is called "resting" only when the
  // reading was recorded as resting.
  const observationContext = contextForRecord(record, indicatorCode(rowId));
  return {
    ...indicator,
    ...(rowId === 'heart_rate' && observationContext.activityContext !== 'RESTING' ? { name: 'Heart rate' } : {}),
    value: formatRowValue(row),
    status: row.status,
    crisis: row.crisis,
    action: row.action?.urgent ?? null,
    reasons: row.reasons,
    usual: row.usual,
    sample: false,
    sourceNote: sourceNoteFor(record),
    provenance: rowProvenance(record, rowId, nameFor),
    checkedAt: record.recorded_at,
    observationContext,
    trend: trendVsUsual(row),
    trendText: flagged
      ? row.reasons[0]
      : record.fromCrewRecord || record.fromSensor
        ? `Within your limits and usual range`
        : `Checked in ${shortDate(record.recorded_at)}`,
    history: undefined, // the mock sparkline would not match a real reading
  };
}

/** Region statuses, raised (never lowered) to the worst vitals reading in that region. */
export function applyVitalsToRegions(statuses, record) {
  const rows = record?.payload?.result?.indicators;
  if (!statuses || !rows) return statuses;
  const out = { ...statuses };
  for (const [region, ids] of Object.entries(REGION_VITALS)) {
    for (const id of ids) {
      const s = rows[id]?.status;
      if (s && RANK[s] > (RANK[out[region]] ?? 0)) out[region] = s;
    }
  }
  return out;
}
