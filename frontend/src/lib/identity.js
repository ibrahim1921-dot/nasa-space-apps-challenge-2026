// Which demo person this browser is signed in as. No default: with nothing (valid) stored, the app
// shows the landing screen and waits for "Enter as Maya (crew)" or "Enter as Lena (CMO)".
// Storage is passed in, so the same code runs in the browser and in node:test.

import { isDemoWho } from './demoAccounts.js';

export const IDENTITY_KEY = 'ahm.demoIdentity.v1';

/** 'maya' | 'lena' | null. Stored as JSON, as useStoredSetting wrote it before. */
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
