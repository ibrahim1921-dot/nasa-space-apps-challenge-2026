// Cabin air status for one day of station data (data/environment.json, built by ml/environment.py).
// Limit lines come from content/limits.js like every other limit; ml/environment.py only adds the
// "unusual for this cabin" flags (each day against the previous 7 days).
// Pure, so node:test runs exactly what the Environment view shows.

import { crossingPhrase, rangeStatus, worstLimit } from './rangeCheck.js';

const RANK = { normal: 0, watch: 1, alert: 2 };
const worse = (a, b) => (RANK[a] >= RANK[b] ? a : b);

/** One measure checked against its lines: { status, reasons }. */
function check(indicator, value, label, unit, digits) {
  const r = rangeStatus(indicator, value);
  if (r.status === null || r.status === 'normal') return { status: 'normal', reasons: [] };
  const limit = worstLimit(r.matched);
  return { status: r.status, reasons: [`${label} ${value.toFixed(digits)} ${unit} is ${crossingPhrase(limit)}`] };
}

function combine(...parts) {
  return parts.reduce(
    (acc, p) => ({ status: worse(acc.status, p.status), reasons: [...acc.reasons, ...p.reasons] }),
    { status: 'normal', reasons: [] },
  );
}

/**
 * @param {object} day  { co2_max_1h, co2_7d_mean, temp_min, temp_max, rh_min, rh_max, unusual: string[] }
 * @returns {{ status, reasons: string[], co2, temperature, humidity }} each part { status, reasons }
 */
export function cabinDayStatus(day) {
  const co2 = combine(
    check('cabin_co2_1h', day.co2_max_1h, 'Highest 1-hour CO₂', 'mmHg', 2),
    check('cabin_co2_7d', day.co2_7d_mean, '7-day average CO₂', 'mmHg', 2),
  );
  const temperature = combine(
    check('cabin_temp', day.temp_max, 'Highest temperature', '°C', 1),
    check('cabin_temp', day.temp_min, 'Lowest temperature', '°C', 1),
  );
  const humidity = combine(
    check('cabin_rh', day.rh_max, 'Highest humidity', '%', 0),
    check('cabin_rh', day.rh_min, 'Lowest humidity', '%', 0),
  );
  const unusual = { status: day.unusual?.length ? 'watch' : 'normal', reasons: day.unusual ?? [] };
  // An unusual-day flag belongs to the measure it names.
  const byMeasure = (prefix) => ({
    status: unusual.reasons.some((r) => r.startsWith(prefix)) ? 'watch' : 'normal',
    reasons: unusual.reasons.filter((r) => r.startsWith(prefix)),
  });
  const parts = {
    co2: combine(co2, byMeasure('CO2')),
    temperature: combine(temperature, byMeasure('Temperature')),
    humidity: combine(humidity, byMeasure('Humidity')),
  };
  const all = combine(parts.co2, parts.temperature, parts.humidity);
  return { status: all.status, reasons: all.reasons, ...parts };
}

/** Days per status, for the summary line. */
export function countByStatus(days) {
  const out = { normal: 0, watch: 0, alert: 0 };
  for (const d of days) out[cabinDayStatus(d).status] += 1;
  return out;
}
