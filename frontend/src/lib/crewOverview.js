// The CMO's crew page: card order and the short lines on each card. Pure, tested in crewOverview.test.js.

import { isOpen } from './emergency.js';

const SEVERITY = { alert: 0, watch: 1, normal: 2 };

/** Patient ids with an open emergency. */
export const openEmergencyPatients = (list = []) =>
  new Set(list.filter((e) => isOpen(e) && e.patient_crew_id).map((e) => e.patient_crew_id));

/**
 * Open emergencies first, then alert, watch, normal; the officer's own card last.
 * Ties keep the given (crew.json) order.
 */
export function orderCrewCards(cards, selfId, emergencyIds = new Set()) {
  const rank = (c) => [
    c.id === selfId ? 1 : 0,
    emergencyIds.has(c.id) ? 0 : 1,
    SEVERITY[c.status] ?? 3,
  ];
  return cards
    .map((c, i) => ({ c, i, r: rank(c) }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.r[2] - b.r[2] || a.i - b.i)
    .map((x) => x.c);
}

/** "Blood pressure is on alert; sleep is on watch." → "Blood pressure is on alert." */
export function topReason(reason) {
  if (!reason) return null;
  if (reason.startsWith('All ')) return 'All readings within limits.';
  const first = reason.split(';')[0].trim().replace(/\.$/, '');
  return `${first}.`;
}

/** The newest check-in time (saved check-in or synthetic crew record), never a simulated sensor day. */
export function lastCheckinAt(person) {
  const entry = [...(person?.entries ?? [])].reverse().find((r) => !r.fromSensor && r.recorded_at);
  return entry?.recorded_at ?? person?.crewRecord?.recorded_at ?? null;
}
