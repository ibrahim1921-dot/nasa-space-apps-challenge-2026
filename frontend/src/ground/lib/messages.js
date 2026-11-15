// Advice messages from the ground team to the crew, saved in this browser (ahm.groundMessages.v1).
// A message reaches the crew one signal delay after it is sent. Pass 1 has no crew inbox, so
// `read_at` stays null until the crew side sets it (pass 2).
//
// Message: { id, to: 'cmo' | crewId, from: { name, role: 'flight_surgeon' }, subject, body,
//            priority: 'routine'|'urgent', related: { kind: 'emergency'|'record'|null, id|null },
//            sent_at, arrives_at, read_at|null }
//
// These are advice and reminders. Templates never contain medical orders, drugs or doses.

import { crewFile } from './data.js';
import { CMO_CREW_ID } from '../../constants/crewRoles.js';
import { arrivesOnboardAt, durationText } from './delay.js';

export const GROUND_MESSAGES_KEY = 'ahm.groundMessages.v1';
export const GROUND_MESSAGES_CHANGED_EVENT = 'ahm:ground-messages-changed';
export const MAX_BODY = 1000;
export const MAX_SUBJECT = 120;
export const MAX_MESSAGES = 200;
export const PRIORITIES = ['routine', 'urgent'];
export const RELATED_KINDS = ['emergency', 'record'];
export const FLIGHT_SURGEON = Object.freeze({ name: 'Flight surgeon', role: 'flight_surgeon' });

const CREW_IDS = crewFile.crew.map((c) => c.id);
const NAMES = Object.fromEntries(crewFile.crew.map((c) => [c.id, c.name]));

/** Who a message can go to: the CMO, or a named crew member. */
export const RECIPIENTS = [
  { id: 'cmo', label: `CMO (${NAMES[CMO_CREW_ID] ?? CMO_CREW_ID})` },
  ...crewFile.crew.map((c) => ({ id: c.id, label: c.name })),
];
export const recipientLabel = (to) => RECIPIENTS.find((r) => r.id === to)?.label ?? to;

export const TEMPLATE_NOTE = 'Templates are reminders to edit before sending. They are never medical orders.';

/** Editable reminders. `{name}` is filled with the chosen crew member (or "the crew member"). */
export const TEMPLATES = [
  {
    id: 'exam',
    label: 'Please record an exam',
    subject: 'Please record an exam for {name}',
    body: 'Please record a CMO exam for {name} when it suits the crew schedule, so the readings reach us with the next data pass.',
  },
  {
    id: 'repeat',
    label: 'Repeat the check-in',
    subject: 'Please repeat the check-in tomorrow morning',
    body: 'Please ask {name} to repeat the daily check-in tomorrow morning, so we can compare it with today.',
  },
  {
    id: 'contact',
    label: 'Contact us at the next pass',
    subject: 'Contact us at the next pass',
    body: 'Please contact the ground medical team at the next communication pass.',
  },
];

/** A template with {name} filled in. */
export function fillTemplate(template, crewId) {
  const name = (crewId && crewId !== 'cmo' && NAMES[crewId]) || 'the crew member';
  return { subject: template.subject.replaceAll('{name}', name), body: template.body.replaceAll('{name}', name) };
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isTime = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/** @returns {string|null} why the draft cannot be sent */
export function validateDraft(d) {
  if (!isObject(d)) return 'The message is empty.';
  if (d.to !== 'cmo' && !CREW_IDS.includes(d.to)) return 'Choose who the message is for.';
  if (typeof d.subject !== 'string' || !d.subject.trim()) return 'Add a subject.';
  if (d.subject.length > MAX_SUBJECT) return `The subject is longer than ${MAX_SUBJECT} characters.`;
  if (typeof d.body !== 'string' || !d.body.trim()) return 'Write the message.';
  if (d.body.length > MAX_BODY) return `The message is longer than ${MAX_BODY} characters.`;
  if (!PRIORITIES.includes(d.priority ?? 'routine')) return 'Priority must be routine or urgent.';
  const r = d.related ?? null;
  if (r && r.kind !== null && r.kind !== undefined && (!RELATED_KINDS.includes(r.kind) || typeof r.id !== 'string')) return 'The linked item is not valid.';
  return null;
}

/** A message ready to save, stamped with its send and onboard arrival times. */
export function newMessage(draft, { profile, at = new Date().toISOString(), id }) {
  const kind = RELATED_KINDS.includes(draft.related?.kind) ? draft.related.kind : null;
  return {
    id,
    to: draft.to,
    from: { ...FLIGHT_SURGEON, ...(typeof draft.fromName === 'string' && draft.fromName.trim() ? { name: draft.fromName.trim() } : {}) },
    subject: draft.subject.trim(),
    body: draft.body.trim(),
    priority: draft.priority ?? 'routine',
    related: { kind, id: kind ? draft.related.id : null },
    sent_at: at,
    arrives_at: arrivesOnboardAt(at, profile),
    read_at: null,
  };
}

/** One stored message, cleaned; null if unusable. */
export function cleanMessage(m) {
  if (!isObject(m) || typeof m.id !== 'string' || !isTime(m.sent_at) || !isTime(m.arrives_at)) return null;
  if (validateDraft(m)) return null;
  const kind = RELATED_KINDS.includes(m.related?.kind) ? m.related.kind : null;
  return {
    id: m.id,
    to: m.to,
    from: { name: typeof m.from?.name === 'string' ? m.from.name : FLIGHT_SURGEON.name, role: FLIGHT_SURGEON.role },
    subject: m.subject,
    body: m.body,
    priority: m.priority ?? 'routine',
    related: { kind, id: kind ? m.related.id : null },
    sent_at: m.sent_at,
    arrives_at: m.arrives_at,
    read_at: isTime(m.read_at) ? m.read_at : null,
  };
}

const newestFirst = (a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at);

export function readMessages(storage) {
  try {
    const raw = storage?.getItem(GROUND_MESSAGES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(cleanMessage).filter(Boolean).sort(newestFirst) : [];
  } catch {
    return [];
  }
}

/** Save one message (newest 200 kept). @returns {boolean} false when the storage would not take it. */
export function addMessage(storage, message) {
  const list = [message, ...readMessages(storage).filter((m) => m.id !== message.id)].sort(newestFirst).slice(0, MAX_MESSAGES);
  try {
    storage.setItem(GROUND_MESSAGES_KEY, JSON.stringify(list));
  } catch {
    return false;
  }
  try {
    window.dispatchEvent(new Event(GROUND_MESSAGES_CHANGED_EVENT));
  } catch {
    // no window (tests)
  }
  return true;
}

/**
 * Where a message is: in transit until arrives_at, then delivered, then read once the crew opens it.
 * @returns {{ state: 'transit'|'delivered'|'read', text: string, remainingMs: number }}
 */
export function status(msg, now = Date.now()) {
  if (msg.read_at) return { state: 'read', text: 'Read', remainingMs: 0 };
  const remainingMs = Date.parse(msg.arrives_at) - Number(now);
  if (remainingMs > 0) {
    const left = remainingMs >= 60_000 ? `${Math.ceil(remainingMs / 60_000)} min` : durationText(Math.ceil(remainingMs / 100) * 100);
    return { state: 'transit', text: `In transit (arrives in ${left})`, remainingMs };
  }
  return { state: 'delivered', text: 'Delivered', remainingMs: 0 };
}
