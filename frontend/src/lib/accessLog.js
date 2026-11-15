// Access log: who opened whose dashboard. When the Crew Medical Officer opens another crew member's
// dashboard, one entry { id, viewer, patient, at } is saved on this device first (localStorage, last 50),
// then copied to the onboard server's access_log table when it is reachable (POST /api/access-log).
// A failed copy keeps the entry marked unsynced and is retried on the next open. Not part of the outbox.
// The CMO reads every entry; a crew member reads the entries about themselves (RLS on access_log).
// Pure functions, plus read/write helpers that take the storage as an argument (node:test can run them).

export const ACCESS_LOG_KEY = 'ahm.accessLog.v1';
export const MAX_LOCAL_ENTRIES = 50;
/** One entry per viewer and patient every 10 minutes, so switching between cards does not flood the list. */
export const THROTTLE_MS = 10 * 60 * 1000;
export const MAX_POST_ENTRIES = 50;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FUTURE_SLACK_MS = 10 * 60 * 1000;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const byNewest = (a, b) => Date.parse(b.at) - Date.parse(a.at);

/** A stored list as clean entries, newest first. */
export function parseLog(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e) => isObject(e) && typeof e.id === 'string' && typeof e.viewer === 'string' && typeof e.patient === 'string' && !Number.isNaN(Date.parse(e.at)))
    .map(({ id, viewer, patient, at, synced }) => ({ id, viewer, patient, at, synced: Boolean(synced) }))
    .sort(byNewest);
}

/**
 * Add a view, unless the same viewer opened the same patient less than 10 minutes ago.
 * Never logs someone opening their own data.
 * @returns {{ list: object[], added: object|null }}
 */
export function addAccess(list, { id, viewer, patient, at }) {
  if (!viewer || !patient || viewer === patient) return { list, added: null };
  const t = Date.parse(at);
  const recent = list.some((e) => e.viewer === viewer && e.patient === patient && Math.abs(t - Date.parse(e.at)) < THROTTLE_MS);
  if (recent) return { list, added: null };
  const added = { id, viewer, patient, at: new Date(t).toISOString(), synced: false };
  return { list: [added, ...list].sort(byNewest).slice(0, MAX_LOCAL_ENTRIES), added };
}

/** Entries not on the onboard server yet, oldest first. */
export const unsyncedEntries = (list) => list.filter((e) => !e.synced).sort((a, b) => -byNewest(a, b)).slice(0, MAX_POST_ENTRIES);

/** Mark these ids as copied to the onboard server. */
export const markSynced = (list, ids) => {
  const done = new Set(ids);
  return list.map((e) => (done.has(e.id) ? { ...e, synced: true } : e));
};

/** Server rows and local entries together, by id (server wins), newest first. */
export function mergeLog(serverRows = [], local = []) {
  const ids = new Set(serverRows.map((r) => r.id));
  return [...serverRows.map((r) => ({ ...r, synced: true })), ...local.filter((e) => !ids.has(e.id))].sort(byNewest);
}

/** The newest `n` entries (the CMO's "Recent access"). */
export const recentAccess = (list, n = 10) => [...list].sort(byNewest).slice(0, n);

/** Who viewed this crew member's data, newest first. */
export const viewsOf = (list, crewId, n = 10) => list.filter((e) => e.patient === crewId).sort(byNewest).slice(0, n);

/** "Lena viewed Tomas · 14:02" */
export function accessText(entry, nameFor) {
  const first = (id) => (nameFor(id) ?? id).split(' ')[0];
  const time = new Date(entry.at).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${first(entry.viewer)} viewed ${first(entry.patient)} · ${time}`;
}

// ---------- Storage (local) ----------

export function readLog(storage) {
  try {
    const raw = storage?.getItem(ACCESS_LOG_KEY);
    return parseLog(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

export function writeLog(storage, list) {
  try {
    storage?.setItem(ACCESS_LOG_KEY, JSON.stringify(list.slice(0, MAX_LOCAL_ENTRIES)));
    return true;
  } catch {
    return false;
  }
}

// ---------- Server (POST /api/access-log) ----------

/** @returns {string|null} why this entry is not acceptable */
export function validateAccessEntry(entry, nowMs) {
  if (!isObject(entry)) return 'Each entry must be an object.';
  if (typeof entry.id !== 'string' || !UUID_RE.test(entry.id)) return 'id must be a UUID made on the device.';
  if (typeof entry.viewer !== 'string' || entry.viewer === '') return 'viewer is missing.';
  if (typeof entry.patient !== 'string' || entry.patient === '') return 'patient is missing.';
  const t = typeof entry.at === 'string' ? Date.parse(entry.at) : NaN;
  if (Number.isNaN(t)) return 'at must be an ISO date-time string.';
  if (t > nowMs + FUTURE_SLACK_MS) return 'at is in the future.';
  return null;
}

/**
 * Store access entries for the signed-in person. Only the Crew Medical Officer (role from crew_members)
 * logs views, only as themselves, and only of someone else.
 * @param {{ entries: unknown[], crewId: string, role: string|null, db: { insertAccess(row) -> Promise<void> }, clock?: () => Date }} p
 * @returns {Promise<{ results: { id, code, result, error? }[] }>}
 */
export async function processAccess({ entries, crewId, role, db, clock = () => new Date() }) {
  const nowMs = clock().getTime();
  const results = [];
  for (const e of entries) {
    const error = validateAccessEntry(e, nowMs);
    const id = isObject(e) ? e.id ?? null : null;
    if (error) results.push({ id, code: 400, result: 'rejected', error });
    else if (role !== 'cmo') results.push({ id, code: 403, result: 'rejected', error: 'Only the Crew Medical Officer logs views of crew data.' });
    else if (e.viewer !== crewId) results.push({ id, code: 403, result: 'rejected', error: `viewer is ${e.viewer}, but you are signed in as ${crewId}.` });
    else if (e.patient === crewId) results.push({ id, code: 400, result: 'rejected', error: 'Opening your own data is not logged.' });
    else {
      await db.insertAccess({ id: e.id, viewer: crewId, patient: e.patient, at: new Date(e.at).toISOString() });
      results.push({ id, code: 201, result: 'stored' });
    }
  }
  return { results };
}
