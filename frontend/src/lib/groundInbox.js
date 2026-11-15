// The crew side of ground messages (ahm.groundMessages.v1): read them and mark one as read.
// The message shape, cleaning and delivery status come from the ground module, imported read only
// (ground/lib/messages.js); nothing here copies that logic.
//
// Limits: this file only ever sets `read_at`, and only on a message that is delivered and addressed
// to this person (`to` their crew id, or `to: 'cmo'` for the CMO). It never creates, edits or deletes
// a message: every other stored entry, and every other field, is written back exactly as it was read.

import { GROUND_MESSAGES_CHANGED_EVENT, GROUND_MESSAGES_KEY, cleanMessage, readMessages, status } from '../ground/lib/messages.js';

/** True when this message is for this person. */
export const isAddressedTo = (msg, { crewId, role }) => Boolean(msg) && (msg.to === crewId || (role === 'cmo' && msg.to === 'cmo'));

/** Messages for this person, newest first, each with its delivery status now. */
export function inboxFor(storage, { crewId, role, now = Date.now() }) {
  return readMessages(storage)
    .filter((m) => isAddressedTo(m, { crewId, role }))
    .map((m) => ({ ...m, status: status(m, Number(now)) }));
}

/** @returns {string|null} why this person may not mark it read, or null when they may */
export function cannotMarkRead(msg, { crewId, role, now = Date.now() }) {
  if (!msg) return 'Message not found.';
  if (!isAddressedTo(msg, { crewId, role })) return 'This message is for someone else.';
  const st = status(msg, Number(now)).state;
  if (st === 'transit') return 'This message has not arrived yet.';
  if (st === 'read') return 'Already read.';
  return null;
}

/**
 * Set read_at on one message. @returns {{ ok: true, read_at: string } | { ok: false, error: string }}
 */
export function markRead(storage, messageId, { crewId, role, now = Date.now() }) {
  let list;
  try {
    const raw = storage?.getItem(GROUND_MESSAGES_KEY);
    list = raw ? JSON.parse(raw) : null;
  } catch {
    return { ok: false, error: 'Messages could not be read on this device.' };
  }
  if (!Array.isArray(list)) return { ok: false, error: 'Message not found.' };
  const index = list.findIndex((m) => cleanMessage(m)?.id === messageId);
  if (index < 0) return { ok: false, error: 'Message not found.' };
  const problem = cannotMarkRead(cleanMessage(list[index]), { crewId, role, now });
  if (problem) return { ok: false, error: problem };
  const readAt = new Date(Number(now)).toISOString();
  const next = list.map((m, i) => (i === index ? { ...m, read_at: readAt } : m));
  try {
    storage.setItem(GROUND_MESSAGES_KEY, JSON.stringify(next));
  } catch {
    return { ok: false, error: 'This browser would not save that.' };
  }
  try {
    window.dispatchEvent(new Event(GROUND_MESSAGES_CHANGED_EVENT));
  } catch {
    // no window (tests)
  }
  return { ok: true, read_at: readAt };
}
