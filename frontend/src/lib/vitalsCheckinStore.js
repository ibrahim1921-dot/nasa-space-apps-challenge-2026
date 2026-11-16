// Daily vitals check-ins saved in this browser's localStorage, in the same record shape as stand tests:
//   { id, crew_id, kind: 'daily_vitals', recorded_at, payload, status, reasons, engine_version, synced_at: null,
//     scored_on: 'device' | 'server', server_differs?, device_result? }
// synced_at stays null until the onboard server has stored it (see lib/outbox.js).
// `payload` is { reading, context, result, provenance?, devices?, entered_by?, demo_events? }: the reading
// exactly as evaluated, the context answers, the evaluate result (so the dashboard can show it without
// asking the server again), where each value came from (sensor or typed by hand), the state of each
// worn device, who entered it, and the demo events the simulated sensor days were built with.
// Every access is guarded: storage can be blocked, full or empty.

import { newRecordId, notifyRecordsChanged } from './standTestStore.js';
import { RECORD_KIND } from './vitalsCheckin.js';

const KEY = 'ahm.dailyVitals.v1';
const MAX_RECORDS = 500;

function readAll() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((r) => r && r.kind === RECORD_KIND && r.payload?.reading) : [];
  } catch {
    return [];
  }
}

/** Every saved check-in on this device (all crew members). */
export const readAllVitals = () => readAll();

/** Saved check-ins for one person, newest first. */
export function readVitalsCheckins(crewId) {
  return readAll()
    .filter((r) => r.crew_id === crewId)
    .sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at));
}

/** The newest saved check-in for one person, or null. */
export const latestVitalsCheckin = (crewId) => readVitalsCheckins(crewId)[0] ?? null;

/** Saved readings as `extra_history` for the evaluate API, oldest first. */
export function extraHistoryFor(crewId) {
  return readVitalsCheckins(crewId)
    .reverse()
    .map((r) => ({ recorded_at: r.recorded_at, ...(r.payload.kind_detail === 'cmo_exam' ? { kind_detail: 'cmo_exam' } : {}), ...r.payload.reading }));
}

/** @returns {boolean} false when the browser would not store it. */
export function writeVitalsCheckin(record) {
  const list = [record, ...readAll().filter((r) => r.id !== record.id)].slice(0, MAX_RECORDS);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    notifyRecordsChanged();
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove every daily check-in saved in this browser (all crew members). Never touches the onboard server.
 * @returns {{ removed: number, ok: boolean }}
 */
export function clearVitalsCheckins() {
  const removed = readAll().length;
  try {
    window.localStorage.removeItem(KEY);
    notifyRecordsChanged();
    return { removed, ok: true };
  } catch {
    return { removed: 0, ok: false };
  }
}

export function makeVitalsRecord({ crewId, reading, context, observationContexts, result, recordedAt, provenance, devices, enteredBy, demoEvents, kindDetail, note }) {
  const payload = { reading, context, result };
  // Measurement conditions per reading (lib/observationContext.js), copied so later edits never change history.
  if (observationContexts) payload.observationContexts = JSON.parse(JSON.stringify(observationContexts));
  // A CMO exam for a crew member: crew_id is the patient, entered_by the Crew Medical Officer.
  if (kindDetail) payload.kind_detail = kindDetail;
  if (kindDetail && note) payload.note = note;
  if (provenance) payload.provenance = provenance;
  if (devices) payload.devices = devices;
  if (enteredBy) payload.entered_by = enteredBy;
  if (demoEvents) payload.demo_events = demoEvents;
  return {
    id: newRecordId(),
    crew_id: crewId,
    kind: RECORD_KIND,
    recorded_at: recordedAt ?? new Date().toISOString(),
    payload,
    status: result.status,
    reasons: result.reasons,
    engine_version: result.engine_version,
    synced_at: null,
    scored_on: result.scored_on ?? 'device',
  };
}
