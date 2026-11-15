// Read-only view of emergency mode for the ground console. The only ground module that imports
// lib/emergency.js and content/emergency.js; the UI depends on this wrapper alone.

import {
  EMERGENCY_CHANGED_EVENT,
  EMERGENCY_KEY,
  bandText,
  cmoIsPatient,
  isOpen,
  latestReadingsFrom,
  openEmergencies,
  readEmergencies,
  sinceStart,
  summaryText,
} from '../../lib/emergency.js';
import { ENVIRONMENTS, EVENT_LABELS, FLOWS } from '../../content/emergency.js';
import { crewNameFor } from '../../lib/provenance.js';

// latestReadingsFrom: one day's readings with provenance, reused by the print summary.
export { EMERGENCY_CHANGED_EVENT, EMERGENCY_KEY, latestReadingsFrom };

const DAY = 24 * 3600_000;
export const RECENT_DAYS = 7;

/** Ended within the last `days` days (real clock). */
export const isRecent = (em, nowMs, days = RECENT_DAYS) => Date.parse(em.ended_at ?? em.started_at) >= nowMs - days * DAY;

/** Every emergency saved in this browser, newest first. */
export const listEmergencies = (storage) => readEmergencies(storage);

/** Open emergencies, newest first. */
export const openList = (list) => openEmergencies(list);

/** Ended emergencies that started or ended in the last `days` days (real clock), newest first. */
export const recentList = (list, nowMs, days = RECENT_DAYS) => list.filter((e) => !isOpen(e) && isRecent(e, nowMs, days));

/** Emergencies about one crew member, newest first. */
export const aboutCrew = (list, crewId) => list.filter((e) => e.patient_crew_id === crewId);

/**
 * The console band: null when nothing is open. A real emergency outranks a drill.
 * @returns {null | { kind: 'real'|'drill', id: string, count: number, text: string }}
 */
export function bandFor(list, nowMs = Date.now()) {
  const open = openEmergencies(list);
  if (!open.length) return null;
  const lead = open.find((e) => !e.drill) ?? open[0];
  return { kind: lead.drill ? 'drill' : 'real', id: lead.id, count: open.length, text: bandText(lead, nowMs) };
}

const nameOf = (v) => (v ? crewNameFor(v) ?? v : null);

/** The event timeline, oldest first, with who logged each event. */
export const timelineRows = (em) =>
  em.events.map((e) => ({
    id: e.id,
    at: e.at,
    since: sinceStart(em.started_at, e.at),
    label: EVENT_LABELS[e.type] ?? e.type,
    by: nameOf(e.by) ?? 'not recorded',
    detail: e.detail ?? null,
  }));

/** Display fields for one emergency. */
export function viewOf(em) {
  return {
    id: em.id,
    open: isOpen(em),
    drill: em.drill,
    patientId: em.patient_crew_id,
    patientName: em.patient_crew_id ? nameOf(em.patient_crew_id) : 'Someone else / not sure',
    reporterName: em.reporter.name,
    flow: FLOWS[em.flow]?.label ?? em.flow,
    environment: ENVIRONMENTS[em.environment]?.label ?? em.environment,
    started_at: em.started_at,
    ended_at: em.ended_at,
    cmoIsPatient: cmoIsPatient(em),
    events: timelineRows(em),
  };
}

/**
 * The handoff summary (lib/emergency.js summaryText), with the patient's latest readings from their
 * timeline on the demo's today and the current profile's delay text.
 */
export function handoffText(em, { timeline = [], today = null, seededCount = 0, profile }) {
  const latest = em.patient_crew_id ? latestReadingsFrom(timeline, { today, seededCount }) : null;
  return summaryText(em, latest, profile?.delayText ?? null);
}
