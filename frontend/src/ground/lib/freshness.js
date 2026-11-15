// How recent each crew member's data is on Earth. The thresholds are set by the team (not a
// clinical standard) and the UI labels them that way.

export const FRESHNESS_RULE = Object.freeze({
  freshHours: 24,
  staleHours: 48,
  label: 'Team-set thresholds: fresh under 24 h, stale 24–48 h, no data over 48 h',
});

export const FRESHNESS_LABELS = { fresh: 'Fresh', stale: 'Stale', 'no data': 'No data' };

const HOUR = 3600_000;

/** "35 min", "5 h", "3 days" */
export function ageText(ms) {
  if (ms < HOUR) return `${Math.max(0, Math.round(ms / 60_000))} min`;
  if (ms < 48 * HOUR) return `${Math.floor(ms / HOUR)} h`;
  return `${Math.floor(ms / (24 * HOUR))} days`;
}

/**
 * @param {string|null} lastArrivedAt  when the newest record reached Earth (ISO)
 * @param {Date|number} now
 * @returns {{ state: 'fresh'|'stale'|'no data', label: string, ageHours: number|null, text: string }}
 */
export function freshnessOf(lastArrivedAt, now, rule = FRESHNESS_RULE) {
  const t = typeof lastArrivedAt === 'string' ? Date.parse(lastArrivedAt) : NaN;
  if (Number.isNaN(t)) return { state: 'no data', label: FRESHNESS_LABELS['no data'], ageHours: null, text: 'Nothing has reached Earth yet' };
  const ageMs = Math.max(0, Number(now) - t);
  const ageHours = ageMs / HOUR;
  const state = ageHours < rule.freshHours ? 'fresh' : ageHours <= rule.staleHours ? 'stale' : 'no data';
  return { state, label: FRESHNESS_LABELS[state], ageHours, text: `Last record reached Earth ${ageText(ageMs)} ago` };
}
