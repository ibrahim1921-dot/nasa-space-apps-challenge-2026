// Emergency mode: one record per emergency, a list of timed events, the handoff summary for the flight
// surgeon, and the server rules for POST /api/emergency. Pure functions, plus local storage helpers that
// take the storage as an argument (node:test runs them), in the same style as lib/accessLog.js.
//
// Record: { id, patient_crew_id | null, reporter: { crew_id | null, name }, flow: 'chest_pain'|'collapse',
//           environment: 'station'|'spacecraft'|'moon', started_at, ended_at | null, drill,
//           events: [{ id, at, type, by, detail? }] }
// On the device the record also carries `synced` (nothing new since the server last stored it) and
// `on_server` (the server has a row for it). Saved on this device first (ahm.emergency.v1); a record
// whose reporter was not signed in ("Unknown crew") stays on this device only.
//
// TIMES: every timestamp here comes from the real clock (new Date()), never from the demo date. The
// demo clock moves whole days to show simulated data; an emergency needs true elapsed minutes and a
// real "when" for the CMO and the flight surgeon. Only the patient's latest readings use the demo's
// today, because those readings live on the demo timeline.

import { CMO_IS_PATIENT, ENVIRONMENTS, EVENT_LABELS, FLOWS } from '../content/emergency.js';
import { getProfile } from '../constants/mission.js';
import { crewNameFor } from './provenance.js';
import { DEMO_ACCOUNT_LIST } from './demoAccounts.js';
import { CMO_EXAM, READING_FIELDS, VITALS_ROWS } from './vitalsCheckin.js';

export const EMERGENCY_KEY = 'ahm.emergency.v1';
export const EMERGENCY_CHANGED_EVENT = 'ahm:emergency-changed';
export const MAX_LOCAL_EMERGENCIES = 20;
export const MAX_POST_EMERGENCIES = 20;
export const MAX_EVENTS = 300;
export const MAX_DETAIL = 500;
/** Device and server clocks may differ by up to 5 minutes before a time counts as "in the future". */
export const FUTURE_SLACK_MS = 5 * 60 * 1000;
/** Compression beat (AHA/ERC: 100–120 a minute) and the compressor swap interval (every 2 minutes). */
export const BEAT_PER_MINUTE = 110;
export const SWAP_EVERY_MS = 2 * 60 * 1000;
export const UNKNOWN_REPORTER = 'Unknown crew';

export const EVENT_TYPES = Object.keys(EVENT_LABELS);
export const FLOW_IDS = Object.keys(FLOWS);
export const ENVIRONMENT_IDS = Object.keys(ENVIRONMENTS);
/** Events that only make sense while the emergency is open. A note may be added after the end. */
const OPEN_ONLY = new Set(EVENT_TYPES.filter((t) => t !== 'note'));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isTime = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const iso = (v) => new Date(v).toISOString();
const byAt = (a, b) => Date.parse(a.at) - Date.parse(b.at) || String(a.id).localeCompare(String(b.id));
const byNewest = (a, b) => Date.parse(b.started_at) - Date.parse(a.started_at);
const firstName = (name) => (typeof name === 'string' && name ? name.split(' ')[0] : null);

// ---------- Environment ----------

/**
 * Mission profile → where the crew are. Station → station; transit / capsule → spacecraft; a Moon or Mars
 * surface base → moon (partial-gravity surface CPR; the database allows only these three environments).
 */
export const ENVIRONMENT_BY_PROFILE = { iss: 'station', lunar_transit: 'spacecraft', mars: 'spacecraft', moon: 'moon', mars_surface: 'moon' };
export const environmentFor = (profileId) => ENVIRONMENT_BY_PROFILE[profileId] ?? 'station';

// ---------- Record and events ----------

/**
 * A new emergency with its `started` event.
 * @param {{ id, eventId, patientCrewId?, reporter?, flow, environment, drill?, at? }} p
 */
export function newEmergency({ id, eventId, patientCrewId = null, reporter = null, flow, environment, drill = true, at = new Date().toISOString() }) {
  const who = reporter?.crew_id ? { crew_id: reporter.crew_id, name: reporter.name ?? crewNameFor(reporter.crew_id) ?? reporter.crew_id } : { crew_id: null, name: UNKNOWN_REPORTER };
  const startedAt = iso(at);
  return {
    id,
    patient_crew_id: patientCrewId ?? null,
    reporter: who,
    flow: FLOW_IDS.includes(flow) ? flow : 'chest_pain',
    environment: ENVIRONMENT_IDS.includes(environment) ? environment : 'station',
    started_at: startedAt,
    ended_at: null,
    drill: Boolean(drill),
    events: [{ id: eventId, at: startedAt, type: 'started', by: who.crew_id, detail: FLOWS[flow]?.label ?? FLOWS.chest_pain.label }],
    synced: false,
    on_server: false,
  };
}

/** Add one event. Ignored (same record back) for an unknown type, a repeated id, or an action after the end. */
export function addEvent(em, { id, at = new Date().toISOString(), type, by = null, detail }) {
  if (!EVENT_TYPES.includes(type) || !id) return em;
  if (em.ended_at && OPEN_ONLY.has(type)) return em;
  if (em.events.some((e) => e.id === id)) return em;
  const event = { id, at: iso(at), type, by: by ?? null, ...(typeof detail === 'string' && detail ? { detail: detail.slice(0, MAX_DETAIL) } : {}) };
  return { ...em, events: [...em.events, event].sort(byAt), synced: false };
}

/** Flow 1 → Flow 2: "They collapsed". Logged once. */
export function switchToCollapse(em, { id, at, by = null }) {
  if (em.flow === 'collapse' || em.ended_at) return em;
  return { ...addEvent(em, { id, at, type: 'switched_to_collapse', by }), flow: 'collapse' };
}

/** "Where are you?" changed. */
export const setEnvironment = (em, environment) =>
  ENVIRONMENT_IDS.includes(environment) && environment !== em.environment && !em.ended_at ? { ...em, environment, synced: false } : em;

/** "End emergency", with an optional note (logged as a `note` event). Ending twice keeps the first end. */
export function endEmergency(em, { at = new Date().toISOString(), by = null, note = '', noteId = null }) {
  if (em.ended_at) return em;
  const withNote = note.trim() && noteId ? addEvent(em, { id: noteId, at, type: 'note', by, detail: note.trim() }) : em;
  return { ...withNote, ended_at: iso(at), synced: false };
}

export const isOpen = (em) => !em.ended_at;
export const hasCompressions = (em) => em.events.some((e) => e.type === 'compressions_started');

/** Two copies of the same emergency together: all events (by id), the first end, collapse wins. */
export function mergeEmergency(a, b) {
  if (!a) return b;
  if (!b) return a;
  const events = new Map();
  for (const e of [...a.events, ...b.events]) if (!events.has(e.id)) events.set(e.id, e);
  return {
    ...a,
    ...b,
    reporter: b.on_server ? b.reporter : a.reporter,
    flow: a.flow === 'collapse' || b.flow === 'collapse' ? 'collapse' : b.flow,
    ended_at: [a.ended_at, b.ended_at].filter(Boolean).sort()[0] ?? null,
    events: [...events.values()].sort(byAt),
    on_server: Boolean(a.on_server || b.on_server),
  };
}

/** Does `server` already hold everything in `local` (every event and the end)? */
export const coveredBy = (local, server) => {
  const ids = new Set(server.events.map((e) => e.id));
  return local.events.every((e) => ids.has(e.id)) && (!local.ended_at || Boolean(server.ended_at)) && local.environment === server.environment;
};

// ---------- Who sees and acts ----------

/** The patient is the Crew Medical Officer. */
/** Crew ids with the CMO role (constants/crewRoles.js via lib/demoAccounts.js). */
export const CMO_IDS = DEMO_ACCOUNT_LIST.filter((a) => a.role === 'cmo').map((a) => a.crewId);

export const cmoIsPatient = (em, cmoIds = CMO_IDS) => Boolean(em.patient_crew_id && cmoIds.includes(em.patient_crew_id));

/** May this person add events to / end this emergency on this device? The reporter or the CMO; anyone for a device-only record. */
export function canAct(em, { crewId = null, isCmo = false } = {}) {
  if (!em.reporter.crew_id) return true; // reported while signed out: device-only, anyone at the device
  return em.reporter.crew_id === crewId || isCmo;
}

/** Should this person see the red band for this open emergency? */
export function bandVisible(em, { crewId = null, isCmo = false, cmoIds } = {}) {
  if (!isOpen(em)) return false;
  if (!crewId || isCmo || cmoIsPatient(em, cmoIds)) return true;
  return em.reporter.crew_id === crewId || em.patient_crew_id === crewId || !em.reporter.crew_id;
}

/** "Emergency (DRILL) · Tomas · collapsed · started 3 min ago by Maya" */
export function bandText(em, nowMs = Date.now(), nameFor = crewNameFor) {
  const mins = Math.max(0, Math.floor((nowMs - Date.parse(em.started_at)) / 60000));
  const ago = mins < 1 ? 'started just now' : `started ${mins} min ago`;
  const patient = em.patient_crew_id ? firstName(nameFor(em.patient_crew_id)) ?? em.patient_crew_id : 'someone else';
  const by = em.reporter.crew_id ? firstName(em.reporter.name) ?? em.reporter.crew_id : em.reporter.name;
  return `Emergency${em.drill ? ' (DRILL)' : ''} · ${patient} · ${FLOWS[em.flow].short} · ${ago} by ${by}`;
}

/** Open emergencies, newest first. */
export const openEmergencies = (list) => list.filter(isOpen).sort(byNewest);
/** Emergencies where this person is the patient, newest first. */
export const emergenciesAbout = (list, crewId) => list.filter((e) => e.patient_crew_id === crewId).sort(byNewest);

// ---------- Local storage ----------

function cleanEvent(e) {
  if (!isObject(e) || typeof e.id !== 'string' || !isTime(e.at) || !EVENT_TYPES.includes(e.type)) return null;
  return {
    id: e.id,
    at: e.at,
    type: e.type,
    by: typeof e.by === 'string' ? e.by : null,
    ...(typeof e.detail === 'string' && e.detail ? { detail: e.detail.slice(0, MAX_DETAIL) } : {}),
  };
}

/** One stored or fetched record, cleaned; null if it is not a usable record. */
export function cleanEmergency(e) {
  if (!isObject(e) || typeof e.id !== 'string' || !isTime(e.started_at)) return null;
  if (!FLOW_IDS.includes(e.flow) || !ENVIRONMENT_IDS.includes(e.environment)) return null;
  const reporter = isObject(e.reporter) ? e.reporter : {};
  return {
    id: e.id,
    patient_crew_id: typeof e.patient_crew_id === 'string' ? e.patient_crew_id : null,
    reporter: {
      crew_id: typeof reporter.crew_id === 'string' ? reporter.crew_id : null,
      name: typeof reporter.name === 'string' && reporter.name ? reporter.name : UNKNOWN_REPORTER,
    },
    flow: e.flow,
    environment: e.environment,
    started_at: e.started_at,
    ended_at: isTime(e.ended_at) ? e.ended_at : null,
    drill: Boolean(e.drill),
    events: (Array.isArray(e.events) ? e.events : []).map(cleanEvent).filter(Boolean).sort(byAt),
    synced: Boolean(e.synced),
    on_server: Boolean(e.on_server),
  };
}

export const parseEmergencies = (value) => (Array.isArray(value) ? value.map(cleanEmergency).filter(Boolean).sort(byNewest) : []);

export function readEmergencies(storage) {
  try {
    const raw = storage?.getItem(EMERGENCY_KEY);
    return parseEmergencies(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

/** Keep the newest 20, but never drop an open emergency or one not yet on the server. */
export function writeEmergencies(storage, list) {
  const sorted = [...list].sort(byNewest);
  const keep = sorted.filter((e, i) => i < MAX_LOCAL_EMERGENCIES || isOpen(e) || (!e.synced && e.reporter.crew_id));
  try {
    storage?.setItem(EMERGENCY_KEY, JSON.stringify(keep));
    return true;
  } catch {
    return false;
  }
}

/** Put one record into the list (replacing the same id). */
export const upsertLocal = (list, em) => [em, ...list.filter((e) => e.id !== em.id)].sort(byNewest);

/** Records this signed-in person should send now: not synced, has a signed-in reporter, and they may write it. */
export function toSend(list, { crewId, isCmo = false }) {
  if (!crewId) return [];
  return list
    .filter((e) => !e.synced && e.reporter.crew_id && (e.reporter.crew_id === crewId || (isCmo && e.on_server)))
    .slice(0, MAX_POST_EMERGENCIES);
}

/** The body sent to the server for one record (device-only flags removed). */
export const forServer = ({ synced, on_server, ...em }) => em; // eslint-disable-line no-unused-vars

/** A server row (snake_case table columns) as a record. */
export function fromRow(row) {
  return cleanEmergency({
    id: row.id,
    patient_crew_id: row.patient_crew_id,
    reporter: { crew_id: row.reporter_crew_id, name: row.reporter_name },
    flow: row.flow,
    environment: row.environment,
    started_at: row.started_at,
    ended_at: row.ended_at,
    drill: row.drill,
    events: row.events,
    synced: true,
    on_server: true,
  });
}

/** After the server stored `server`: merge it into the local copy; synced only if nothing new was added meanwhile. */
export function applyServerCopy(list, server) {
  const local = list.find((e) => e.id === server.id);
  const merged = mergeEmergency(local, { ...server, on_server: true });
  return upsertLocal(list, { ...merged, synced: !local || coveredBy(local, server) });
}

/** Server rows and device records together, by id. Device-only records (signed out) stay as they are. */
export function mergeAll(serverRecords = [], local = []) {
  const out = new Map(local.map((e) => [e.id, e]));
  for (const s of serverRecords) {
    const l = out.get(s.id);
    out.set(s.id, l ? { ...mergeEmergency(l, s), synced: l.synced && coveredBy(l, s) } : s);
  }
  return [...out.values()].sort(byNewest);
}

// ---------- Latest readings and the handoff summary ----------

const UTC = (t) => `${iso(t).slice(0, 16).replace('T', ' ')} UTC`;
const UTC_S = (t) => `${iso(t).slice(0, 19).replace('T', ' ')} UTC`;
const pad = (n) => String(n).padStart(2, '0');
/** "+04:05" (minutes:seconds from the start). */
export function sinceStart(startIso, atIso) {
  const s = Math.max(0, Math.round((Date.parse(atIso) - Date.parse(startIso)) / 1000));
  return `+${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

const fmt = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 10) / 10) : null);

/**
 * The patient's latest readings from their buildTimeline() timeline, on or before the demo's today.
 * @param {object[]} timeline  buildTimeline() output, oldest first
 * @param {{ today: string, seededCount: number, nameFor? }} p  seededCount = number of crew.json days (they come first)
 * @returns {{ date: string|null, items: { label, value, unit, provenance }[] }}
 */
export function latestReadingsFrom(timeline, { today, seededCount = 0, nameFor = crewNameFor }) {
  let index = -1;
  timeline.forEach((d, i) => {
    if (typeof d?.date === 'string' && (!today || d.date <= today)) index = i;
  });
  if (index < 0) return { date: null, items: [] };
  const day = timeline[index];
  const seeded = index < seededCount;
  const provenanceOf = (key) => {
    const p = day.provenance?.[key];
    if (p === CMO_EXAM) {
      const x = [...(day.exams ?? [])].reverse().find((e) => e.fields?.includes(key));
      const by = firstName(x?.entered_by?.name) ?? (x?.entered_by?.crew_id ? firstName(nameFor(x.entered_by.crew_id)) : null);
      return `CMO exam${by ? ` by ${by}` : ''}${x?.recorded_at ? `, ${UTC(x.recorded_at)}` : ''}`;
    }
    if (p === 'sensor') return 'simulated sensor';
    if (seeded || p === 'seed') return 'synthetic crew record';
    if (p === 'manual') return 'typed in a check-in';
    return 'check-in saved on the device';
  };
  const items = [];
  for (const row of VITALS_ROWS) {
    const values = row.parts.map((k) => fmt(day[READING_FIELDS[k].baselineKey]));
    if (values.some((v) => v === null)) continue;
    items.push({ label: row.name, value: values.join('/'), unit: row.unit, provenance: provenanceOf(row.parts[0]) });
  }
  return { date: day.date, items };
}

/**
 * Plain text the CMO can paste to the flight surgeon.
 * @param {object} em  the emergency record
 * @param {{ date, items }|null} latestReadings  latestReadingsFrom() output
 * @param {string|null} delay  the mission profile's delay text (e.g. "about 20 min one-way …")
 */
export function summaryText(em, latestReadings, delay, { nameFor = crewNameFor, cmoIds } = {}) {
  const name = (id) => nameFor(id) ?? id;
  const by = (id) => (id ? ` · ${firstName(name(id)) ?? id}` : '');
  const flows = em.events.some((e) => e.type === 'switched_to_collapse') ? `${FLOWS.chest_pain.label}, then ${FLOWS.collapse.label}` : FLOWS[em.flow].label;
  const lines = [];
  if (em.drill) lines.push('*** DRILL: practice only, not a real emergency ***');
  lines.push('EMERGENCY HANDOFF SUMMARY');
  if (cmoIsPatient(em, cmoIds)) lines.push(CMO_IS_PATIENT);
  lines.push(`Patient: ${em.patient_crew_id ? `${name(em.patient_crew_id)} (${em.patient_crew_id})` : 'someone else / not sure'}`);
  lines.push(`Reported by: ${em.reporter.crew_id ? `${em.reporter.name} (${em.reporter.crew_id})` : em.reporter.name}`);
  lines.push(`Where: ${ENVIRONMENTS[em.environment].label}`);
  lines.push(`Started: ${UTC_S(em.started_at)}`);
  lines.push(em.ended_at ? `Ended: ${UTC_S(em.ended_at)} (${sinceStart(em.started_at, em.ended_at)} after start)` : 'Ended: still open');
  lines.push(`Flow: ${flows}`);
  if (delay) lines.push(`Signal delay to Earth: ${delay}`);
  lines.push('');
  lines.push('Events (min:s from start):');
  for (const e of em.events) {
    lines.push(`${sinceStart(em.started_at, e.at)}  ${EVENT_LABELS[e.type]}${e.detail ? `: ${e.detail}` : ''}${by(e.by)}`);
  }
  lines.push('');
  const who = em.patient_crew_id ? firstName(name(em.patient_crew_id)) : null;
  if (!em.patient_crew_id) lines.push('Latest readings: none (patient not identified).');
  else if (!latestReadings?.items?.length) lines.push(`Latest readings for ${who}: none on this device.`);
  else {
    lines.push(`Latest readings for ${who} (demo day ${latestReadings.date}):`);
    for (const r of latestReadings.items) lines.push(`- ${r.label}: ${r.value} ${r.unit} (${r.provenance})`);
  }
  lines.push('');
  lines.push('Event times use the real clock; readings use the demo timeline. Crew data is synthetic. Not a diagnosis.');
  return lines.join('\n');
}

/** The delay text for a mission profile id. */
export const delayTextFor = (profileId) => getProfile(profileId).delayText;

// ---------- Server (POST /api/emergency) ----------

function validateEvent(e, nowMs, label) {
  if (!isObject(e)) return `${label} must be an object.`;
  if (typeof e.id !== 'string' || !UUID_RE.test(e.id)) return `${label}.id must be a UUID made on the device.`;
  if (!isTime(e.at)) return `${label}.at must be an ISO date-time string.`;
  if (Date.parse(e.at) > nowMs + FUTURE_SLACK_MS) return `${label}.at is in the future.`;
  if (!EVENT_TYPES.includes(e.type)) return `${label}.type must be one of: ${EVENT_TYPES.join(', ')}.`;
  if (e.detail !== undefined && e.detail !== null && (typeof e.detail !== 'string' || e.detail.length > MAX_DETAIL)) {
    return `${label}.detail must be text of at most ${MAX_DETAIL} characters.`;
  }
  return null;
}

/** @returns {string|null} why this emergency is not acceptable */
export function validateEmergency(e, nowMs, knownCrew = null) {
  if (!isObject(e)) return 'Each emergency must be an object.';
  if (typeof e.id !== 'string' || !UUID_RE.test(e.id)) return 'id must be a UUID made on the device.';
  if (e.patient_crew_id !== null && typeof e.patient_crew_id !== 'string') return 'patient_crew_id must be a crew id or null.';
  if (knownCrew && e.patient_crew_id !== null && !knownCrew.includes(e.patient_crew_id)) return `Unknown patient ${e.patient_crew_id}.`;
  if (!isObject(e.reporter)) return 'reporter is missing.';
  if (!FLOW_IDS.includes(e.flow)) return `flow must be one of: ${FLOW_IDS.join(', ')}.`;
  if (!ENVIRONMENT_IDS.includes(e.environment)) return `environment must be one of: ${ENVIRONMENT_IDS.join(', ')}.`;
  if (typeof e.drill !== 'boolean') return 'drill must be true or false.';
  if (!isTime(e.started_at)) return 'started_at must be an ISO date-time string.';
  if (Date.parse(e.started_at) > nowMs + FUTURE_SLACK_MS) return 'started_at is in the future.';
  if (e.ended_at !== null && e.ended_at !== undefined) {
    if (!isTime(e.ended_at)) return 'ended_at must be an ISO date-time string or null.';
    if (Date.parse(e.ended_at) > nowMs + FUTURE_SLACK_MS) return 'ended_at is in the future.';
    if (Date.parse(e.ended_at) < Date.parse(e.started_at)) return 'ended_at is before started_at.';
  }
  if (!Array.isArray(e.events)) return 'events must be a list.';
  if (e.events.length > MAX_EVENTS) return `At most ${MAX_EVENTS} events.`;
  for (let i = 0; i < e.events.length; i += 1) {
    const error = validateEvent(e.events[i], nowMs, `events[${i}]`);
    if (error) return error;
  }
  return null;
}

/**
 * Stored events plus new ones, by event id, sorted by time. A stored event is never removed or changed;
 * an event the server has not stored yet gets `by` = the signed-in crew id (the client's `by` is ignored).
 */
export function mergeServerEvents(stored = [], incoming = [], crewId) {
  const ids = new Set(stored.map((e) => e.id));
  const added = [];
  for (const e of incoming) {
    if (ids.has(e.id)) continue;
    ids.add(e.id);
    added.push({ id: e.id, at: iso(e.at), type: e.type, by: crewId, ...(e.detail ? { detail: e.detail } : {}) });
  }
  return { events: [...stored, ...added].sort(byAt), added: added.length };
}

const MAX_ATTEMPTS = 3;

/**
 * Store emergencies for the signed-in person.
 * - New record: the reporter must be the signed-in person; the server rebuilds `reporter` from the session.
 * - Existing record: the reporter or the Crew Medical Officer (role from crew_members) may add events and end it;
 *   everyone else gets 403. The stored reporter, patient, start time and drill flag never change.
 *   Events are merged by id; ended_at may be set once and never cleared (409).
 * Writes are compare-and-set on `revision`, retried, so two devices appending at once both keep their events.
 * @param {{ emergencies: unknown[], crewId: string, role: string|null, name: string|null,
 *   db: { find(id), insert(row) -> Promise<boolean>, update(row, prevRevision) -> Promise<boolean> },
 *   knownCrew?: string[], clock?: () => Date }} p
 * @returns {Promise<{ results: { id, code, result, error?, emergency? }[] }>}
 */
export async function processEmergencies({ emergencies, crewId, role = null, name = null, db, knownCrew = null, clock = () => new Date() }) {
  const results = [];
  for (const e of emergencies) {
    const nowMs = clock().getTime();
    const id = isObject(e) && typeof e.id === 'string' ? e.id : null;
    const error = validateEmergency(e, nowMs, knownCrew);
    if (error) {
      results.push({ id, code: 400, result: 'rejected', error });
      continue;
    }
    results.push(await storeOne(e, { crewId, role, name, db, nowMs }));
  }
  return { results };
}

async function storeOne(e, { crewId, role, name, db, nowMs }) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const existing = await db.find(e.id);
    const now = new Date(nowMs).toISOString();
    if (!existing) {
      if (e.reporter.crew_id !== crewId) {
        return { id: e.id, code: 403, result: 'rejected', error: `reporter is ${e.reporter.crew_id ?? 'unknown'}, but you are signed in as ${crewId}.` };
      }
      const { events } = mergeServerEvents([], e.events, crewId);
      const row = {
        id: e.id,
        patient_crew_id: e.patient_crew_id,
        reporter_crew_id: crewId,
        reporter_name: name ?? crewNameFor(crewId) ?? crewId,
        flow: e.flow,
        environment: e.environment,
        drill: e.drill,
        started_at: iso(e.started_at),
        ended_at: e.ended_at ? iso(e.ended_at) : null,
        events,
        revision: 1,
        updated_at: now,
      };
      if (await db.insert(row)) return { id: e.id, code: 201, result: 'stored', emergency: fromRow(row) };
      continue; // someone else inserted it first: merge into theirs
    }
    if (existing.reporter_crew_id !== crewId && role !== 'cmo') {
      return { id: e.id, code: 403, result: 'rejected', error: 'Only the person who reported this emergency or the Crew Medical Officer may update it.' };
    }
    if (existing.ended_at && !e.ended_at) {
      return { id: e.id, code: 409, result: 'rejected', error: 'This emergency has ended; ended_at cannot be cleared.' };
    }
    const { events } = mergeServerEvents(existing.events ?? [], e.events, crewId);
    const row = {
      ...existing,
      flow: existing.flow === 'collapse' ? 'collapse' : e.flow,
      environment: e.environment,
      ended_at: existing.ended_at ?? (e.ended_at ? iso(e.ended_at) : null),
      events,
      revision: existing.revision + 1,
      updated_at: now,
    };
    if (await db.update(row, existing.revision)) return { id: e.id, code: 200, result: 'stored', emergency: fromRow(row) };
  }
  return { id: e.id, code: 503, result: 'rejected', error: 'Busy: the emergency changed several times while saving. Try again.' };
}
