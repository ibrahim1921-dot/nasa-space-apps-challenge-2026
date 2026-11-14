// Nights logged in this browser, kept per person in localStorage.
// Sent to the server as `extra_history` so scoring works even when requests land on
// different serverless instances. Every access is guarded: storage can be blocked or empty.

const PREFIX = 'ahm.loggedNights.v1.';
const MAX_PER_SUBJECT = 365;

export function readLoggedNights(subjectId) {
  try {
    const raw = window.localStorage.getItem(PREFIX + subjectId);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((e) => e && typeof e === 'object' && e.night) : [];
  } catch {
    return [];
  }
}

export function writeLoggedNight(subjectId, entry) {
  const list = [entry, ...readLoggedNights(subjectId).filter((e) => e.id !== entry.id)].slice(0, MAX_PER_SUBJECT);
  try {
    window.localStorage.setItem(PREFIX + subjectId, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** The rows the score route expects in `extra_history`: id plus the 6 features. */
export function toExtraHistory(entries) {
  return entries.map((e) => ({ id: e.id, ...e.night }));
}

export function newNightId() {
  try {
    return window.crypto.randomUUID();
  } catch {
    return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
