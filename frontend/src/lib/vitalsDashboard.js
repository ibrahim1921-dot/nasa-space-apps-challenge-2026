// Put the latest daily-vitals check-in onto the dashboard's indicators.
// Pure functions: the dashboard passes in the mock indicators and the newest saved record.
// Where no check-in exists yet the mock value stays, marked `sample: true`.

import { formatRowValue } from './vitalsCheckin.js';
import { sourceNoteFor } from './personDashboard.js';

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
export function applyVitals(indicator, record, usual = null) {
  const rowId = DASHBOARD_VITALS[indicator.id];
  // Not a daily-vitals indicator: still mock data, the same for everyone, so it is labelled "Sample".
  if (!rowId) return indicator.sample === false ? indicator : { ...indicator, sample: true };
  const row = record?.payload?.result?.indicators?.[rowId];
  if (!row) {
    return { ...indicator, sample: true, usual: usual?.[rowId] ?? null };
  }
  const flagged = row.status !== 'normal';
  return {
    ...indicator,
    value: formatRowValue(row),
    status: row.status,
    crisis: row.crisis,
    action: row.action?.urgent ?? null,
    reasons: row.reasons,
    usual: row.usual,
    sample: false,
    sourceNote: sourceNoteFor(record),
    checkedAt: record.recorded_at,
    trend: trendVsUsual(row),
    trendText: flagged
      ? row.reasons[0]
      : record.fromCrewRecord
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
