// Where each value in a reading came from, and who entered it. Pure.
// Saved check-ins carry payload.provenance ({ systolic: 'sensor'|'manual', … }), payload.devices
// ({ shirt: 'ok'|'not worn', … }) and payload.entered_by ({ crew_id, name, role }). Records saved
// before these fields existed are treated as typed by hand, entered by the crew member.
// Sensor records (lib/sensorRecords.js) are all 'sensor'. Seeded crew.json rows have no provenance.

import { DEVICES, DEVICE_IDS, DEVICE_OF_READING, EVENT_TYPE_IDS } from './sensorFeed.js';
import { CMO_EXAM, READING_KEYS } from './vitalsCheckin.js';
import crewData from '../data/crew.json' with { type: 'json' };

const NAMES = Object.fromEntries(crewData.crew.map((c) => [c.id, c.name]));
/** Crew member name from crew.json, for records saved before entered_by existed. */
export const crewNameFor = (crewId) => NAMES[crewId] ?? null;

export const PROVENANCE_VALUES = ['sensor', 'manual'];
/** Provenance on a CMO exam record (payload.kind_detail 'cmo_exam'): every stored value was measured by the CMO. */
export const EXAM_PROVENANCE = CMO_EXAM;
export const KIND_DETAILS = [CMO_EXAM];
export const MAX_NOTE = 280;
/** What a CMO exam may measure. Mood and sleep are the crew member's own answers; never in an exam. */
export const EXAM_KEYS = ['systolic', 'diastolic', 'heart_rate', 'glucose', 'temperature'];
export const DEVICE_STATES = ['ok', 'not worn'];
export const MAX_DEMO_EVENTS = 20;

/** Result row id → the reading key that decides its provenance. */
const ROW_KEY = {
  blood_pressure: 'systolic',
  heart_rate: 'heart_rate',
  glucose: 'glucose',
  temperature: 'temperature',
  sleep_hours: 'sleep_hours',
  mood: 'mood',
};

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const shortText = (v, max) => typeof v === 'string' && v.trim() !== '' && v.length <= max;

/**
 * Check payload.provenance, payload.devices, payload.entered_by and payload.demo_events. Each is optional.
 * @returns {string|null} why it is not acceptable
 */
export function validateProvenance(payload, label = 'payload') {
  const { provenance, devices, entered_by: by, demo_events: events, kind_detail: kindDetail } = payload ?? {};
  if (kindDetail !== undefined && !KIND_DETAILS.includes(kindDetail)) {
    return `${label}.kind_detail must be one of: ${KIND_DETAILS.join(', ')}.`;
  }
  if (kindDetail === CMO_EXAM) {
    const error = validateExam(payload, label);
    if (error) return error;
  } else if (provenance !== undefined) {
    if (!isObject(provenance)) return `${label}.provenance must be an object.`;
    for (const [k, v] of Object.entries(provenance)) {
      if (!READING_KEYS.includes(k)) return `${label}.provenance.${k} is not a reading.`;
      if (!PROVENANCE_VALUES.includes(v)) return `${label}.provenance.${k} must be one of: ${PROVENANCE_VALUES.join(', ')}.`;
      if (v === 'sensor' && !DEVICE_OF_READING[k]) return `${label}.provenance.${k} cannot come from a sensor.`;
    }
  }
  if (devices !== undefined) {
    if (!isObject(devices)) return `${label}.devices must be an object.`;
    for (const [k, v] of Object.entries(devices)) {
      if (!DEVICE_IDS.includes(k)) return `${label}.devices.${k} is not a known device.`;
      if (!DEVICE_STATES.includes(v)) return `${label}.devices.${k} must be one of: ${DEVICE_STATES.join(', ')}.`;
    }
  }
  if (by !== undefined || kindDetail === CMO_EXAM) {
    if (!isObject(by)) return `${label}.entered_by must be an object.`;
    if (!shortText(by.crew_id, 40)) return `${label}.entered_by.crew_id is missing.`;
    if (!shortText(by.name, 80)) return `${label}.entered_by.name is missing.`;
    if (!shortText(by.role, 40)) return `${label}.entered_by.role is missing.`;
  }
  if (events !== undefined) {
    if (!Array.isArray(events)) return `${label}.demo_events must be an array.`;
    if (events.length > MAX_DEMO_EVENTS) return `${label}.demo_events has ${events.length} items; send at most ${MAX_DEMO_EVENTS}.`;
    for (let i = 0; i < events.length; i += 1) {
      const e = events[i];
      if (!isObject(e) || typeof e.crewId !== 'string') return `${label}.demo_events[${i}].crewId is missing.`;
      if (!EVENT_TYPE_IDS.includes(e.type)) return `${label}.demo_events[${i}].type must be one of: ${EVENT_TYPE_IDS.join(', ')}.`;
      if (!Number.isInteger(e.startOffset) || e.startOffset < 0 || e.startOffset > 365) {
        return `${label}.demo_events[${i}].startOffset must be a whole number from 0 to 365.`;
      }
    }
  }
  return null;
}

/**
 * A CMO exam: only the vitals the CMO measured (blood pressure, heart rate, blood sugar, temperature),
 * each optional, at least one; everything not measured is null. No mood, sleep or context. Every
 * stored value has provenance 'cmo_exam' and nothing else does. Optional note, at most 280 characters.
 */
function validateExam(payload, label) {
  const { reading, provenance, context, note } = payload;
  if (context !== undefined && context !== null) return `${label}.context must be empty in an exam: the CMO cannot answer it for someone.`;
  if (isObject(reading)) {
    for (const k of READING_KEYS) {
      if (!EXAM_KEYS.includes(k) && reading[k] !== null) return `${label}.reading.${k} must be null in an exam: only the crew member can answer it.`;
    }
  }
  if (!isObject(provenance)) return `${label}.provenance is needed in an exam: one 'cmo_exam' entry per measured value.`;
  for (const [k, v] of Object.entries(provenance)) {
    if (!EXAM_KEYS.includes(k)) return `${label}.provenance.${k} is not something an exam measures.`;
    if (v !== CMO_EXAM) return `${label}.provenance.${k} must be '${CMO_EXAM}' in an exam.`;
    if (!isObject(reading) || reading[k] === null || reading[k] === undefined) return `${label}.provenance.${k} has no measured value.`;
  }
  const measured = EXAM_KEYS.filter((k) => isObject(reading) && reading[k] !== null && reading[k] !== undefined);
  if (measured.length === 0) return `${label}.reading: an exam needs at least one measured value.`;
  const unlabelled = measured.find((k) => provenance[k] !== CMO_EXAM);
  if (unlabelled) return `${label}.provenance.${unlabelled} must be '${CMO_EXAM}' for a measured value.`;
  if (note !== undefined && (typeof note !== 'string' || note.length > MAX_NOTE)) {
    return `${label}.note must be text of at most ${MAX_NOTE} characters.`;
  }
  return null;
}

/** Only the known fields, ready to store. */
export function cleanProvenance(payload) {
  const out = {};
  if (payload?.kind_detail === CMO_EXAM) {
    out.kind_detail = CMO_EXAM;
    if (typeof payload.note === 'string' && payload.note.trim() !== '') out.note = payload.note.trim().slice(0, MAX_NOTE);
  }
  if (isObject(payload?.provenance)) out.provenance = { ...payload.provenance };
  if (isObject(payload?.devices)) out.devices = { ...payload.devices };
  if (isObject(payload?.entered_by)) {
    const { crew_id, name, role } = payload.entered_by;
    out.entered_by = { crew_id, name, role };
  }
  if (Array.isArray(payload?.demo_events)) {
    out.demo_events = payload.demo_events.map(({ crewId, type, startOffset }) => ({ crewId, type, startOffset }));
  }
  return out;
}

/**
 * Provenance of a stored record.
 * @returns {null | { origin: 'sensor'|'entered', fields: object, devices: object|null, enteredBy: object|null }}
 *   null for seeded crew.json rows (synthetic crew record)
 */
export function provenanceOf(record, nameFor = crewNameFor) {
  const p = record?.payload;
  if (!p || p.origin === 'seed') return null;
  if (p.origin === 'sensor') {
    return { origin: 'sensor', fields: { ...(p.provenance ?? {}) }, devices: p.devices ?? null, enteredBy: null };
  }
  const reading = p.reading ?? {};
  const fields = Object.fromEntries(
    READING_KEYS.filter((k) => reading[k] !== null && reading[k] !== undefined).map((k) => [k, p.provenance?.[k] ?? 'manual']),
  );
  const enteredBy = p.entered_by ?? { crew_id: record.crew_id, name: nameFor(record.crew_id), role: null };
  return { origin: 'entered', fields, devices: p.devices ?? null, enteredBy };
}

const firstName = (name) => (typeof name === 'string' && name ? name.split(' ')[0] : null);

const ROLE_LABEL = { cmo: 'CMO' };

/** Who examined this reading key: the newest merged exam that set it, or the exam record's own author. */
function examinerOf(record, key, nameFor) {
  const p = record?.payload ?? {};
  const merged = [...(p.exams ?? [])].reverse().find((x) => x.fields?.includes(key));
  const by = merged?.entered_by ?? (p.kind_detail === CMO_EXAM ? p.entered_by : null);
  return by ?? null;
}

const examChip = (by) => ({
  kind: 'exam',
  by: firstName(by?.name) ?? 'CMO',
  role: ROLE_LABEL[by?.role] ?? 'CMO',
});

/** The CMO exams behind a record: its own (an exam record), or the ones merged into this day. */
export function examsOf(record) {
  const p = record?.payload ?? {};
  if (p.kind_detail === CMO_EXAM) return [{ recorded_at: record.recorded_at, entered_by: p.entered_by ?? null, fields: Object.keys(p.provenance ?? {}), note: p.note ?? null }];
  return (p.exams ?? []).filter((x) => x.fields?.length);
}

/**
 * The chip for one result row: { kind: 'sensor', device, deviceLabel, simulated: true } or
 * { kind: 'manual', by: 'Maya' }, or null (seeded crew record, or no value).
 */
export function rowProvenance(record, rowId, nameFor) {
  const prov = provenanceOf(record, nameFor ?? crewNameFor);
  const key = ROW_KEY[rowId];
  if (!prov || !key || !prov.fields[key] || prov.fields[key] === 'seed') return null;
  if (prov.fields[key] === 'sensor') {
    const device = DEVICE_OF_READING[key];
    return { kind: 'sensor', device, deviceLabel: DEVICES[device].label, simulated: true };
  }
  if (prov.fields[key] === CMO_EXAM) return examChip(examinerOf(record, key, nameFor));
  return { kind: 'manual', by: firstName(prov.enteredBy?.name) ?? 'crew member' };
}

/** Chips for a whole record (CMO cards and feed): sensors used, and who entered it. */
export function recordChips(record, nameFor = crewNameFor) {
  const prov = provenanceOf(record, nameFor);
  if (!prov) return [];
  const chips = [];
  const devices = [...new Set(Object.entries(prov.fields).filter(([, v]) => v === 'sensor').map(([k]) => DEVICE_OF_READING[k]))];
  if (devices.length) chips.push({ kind: 'sensor', device: devices.length === 1 ? devices[0] : null, deviceLabel: devices.length === 1 ? DEVICES[devices[0]].label : null, simulated: true });
  const exams = examsOf(record);
  const examiners = [...new Map(exams.map((x) => [x.entered_by?.crew_id ?? 'cmo', x.entered_by])).values()];
  const isExam = record?.payload?.kind_detail === CMO_EXAM;
  if (prov.origin === 'entered' && !isExam) chips.push({ kind: 'manual', by: firstName(prov.enteredBy?.name) ?? 'crew member' });
  for (const by of examiners) chips.push(examChip(by));
  return chips;
}
