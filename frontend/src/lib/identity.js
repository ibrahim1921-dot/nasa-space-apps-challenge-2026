// Which local demo person this browser is exploring as ("Explore with demo data"). A real backend
// session is never stored here: it lives in the HttpOnly session cookie and is read back from /api/auth/me.
// Storage is passed in, so the same code runs in the browser and in node:test.

import { isDemoWho } from './demoAccounts.js';

export const IDENTITY_KEY = 'ahm.demoIdentity.v1';

/** A demo account key ('maya', 'tomas', 'lena', 'kwame') or null. Stored as JSON, as useStoredSetting wrote it before. */
export function readIdentity(storage) {
  try {
    const raw = storage?.getItem(IDENTITY_KEY);
    if (raw === null || raw === undefined) return null;
    const value = JSON.parse(raw);
    return isDemoWho(value) ? value : null;
  } catch {
    return null;
  }
}

/** @returns {boolean} false when the browser would not store it (the choice then lasts for this page view). */
export function writeIdentity(storage, who) {
  if (!isDemoWho(who)) throw new Error(`Unknown demo identity "${who}".`);
  try {
    storage.setItem(IDENTITY_KEY, JSON.stringify(who));
    return true;
  } catch {
    return false;
  }
}

export function clearIdentity(storage) {
  try {
    storage?.removeItem(IDENTITY_KEY);
  } catch {
    // blocked storage: nothing was stored either
  }
}

export const browserStorage = () => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};
