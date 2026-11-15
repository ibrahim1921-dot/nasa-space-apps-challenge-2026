// The activity log, saved in this browser only (localStorage `ahm.activities.v1`): an array of records
// (lib/activities.js), newest first. Storage is passed in, so node:test uses an in-memory storage.
// After a save the caller fires notifyRemindersChanged() so the bell and the Today card re-read.

import { isActivity } from './activities.js';

export const ACTIVITIES_KEY = 'ahm.activities.v1';
const MAX_RECORDS = 500;

/** Every valid record on this device (any crew member), newest first. */
export function readActivities(storage) {
  try {
    const raw = storage?.getItem(ACTIVITIES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(isActivity).sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at)) : [];
  } catch {
    return [];
  }
}

/** @returns {{ ok: true } | { ok: false, error: string }} */
export function writeActivity(storage, record) {
  if (!isActivity(record)) return { ok: false, error: 'This session could not be saved.' };
  const list = [record, ...readActivities(storage).filter((r) => r.id !== record.id)].slice(0, MAX_RECORDS);
  try {
    storage.setItem(ACTIVITIES_KEY, JSON.stringify(list));
    return { ok: true };
  } catch {
    return { ok: false, error: 'This browser would not save the session.' };
  }
}
