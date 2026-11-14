// Outbox: readings saved on this device that have not reached the onboard server yet.
// The outbox is not a second copy: a record is "in the outbox" while its synced_at is null.
// This file only keeps the retry bookkeeping ({ [id]: { attempts, next_at, rejected?, last_error? } })
// and decides what to send. Pure functions plus one async step with the network call injected,
// so node:test can run it against a fake server.
//
// No duplicates on retry: every record keeps the UUID it was given on the device, and the server
// inserts with ON CONFLICT (id) DO NOTHING, answering "already_stored" for an id it has.

export const OUTBOX_STATE_KEY = 'ahm.outbox.v1';
export const BACKOFF = { baseMs: 2000, maxMs: 5 * 60 * 1000 };
export const MAX_BATCH = 50;

/** Delay before retry number `attempts` (1 = first retry): 2 s, 4 s, 8 s … capped at 5 min, with 50–100% jitter. */
export function backoffMs(attempts, random = Math.random) {
  const raw = Math.min(BACKOFF.maxMs, BACKOFF.baseMs * 2 ** Math.max(0, attempts - 1));
  return Math.round(raw * (0.5 + random() * 0.5));
}

/** 'synced' | 'rejected' | 'on_device' for one record. */
export function syncStateOf(record, state = {}) {
  if (record.synced_at) return 'synced';
  if (state[record.id]?.rejected) return 'rejected';
  return 'on_device';
}

/** Unsynced records for one crew member that are due now, oldest first. */
export function dueRecords(records, crewId, state, now) {
  return records
    .filter((r) => !r.synced_at && r.crew_id === crewId && !state[r.id]?.rejected && (state[r.id]?.next_at ?? 0) <= now)
    .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at))
    .slice(0, MAX_BATCH);
}

/** Earliest time (ms) any pending record of this crew member is due, or null. */
export function nextDueAt(records, crewId, state) {
  const times = records
    .filter((r) => !r.synced_at && r.crew_id === crewId && !state[r.id]?.rejected)
    .map((r) => state[r.id]?.next_at ?? 0);
  return times.length ? Math.min(...times) : null;
}

/** What goes over the wire for one record: the reading itself plus what this device scored. */
export function toSyncReading(record) {
  const payload =
    record.kind === 'daily_vitals'
      ? { reading: record.payload.reading, context: record.payload.context ?? null }
      : record.payload;
  return {
    id: record.id,
    crew_id: record.crew_id,
    kind: record.kind,
    recorded_at: record.recorded_at,
    payload,
    device_result: { status: record.status, reasons: record.reasons, engine_version: record.engine_version },
  };
}

/**
 * The local record after the server answered "stored" or "already_stored".
 * The server's result is official: status, reasons and engine version are replaced by it,
 * and the device's own result is kept alongside when they differ.
 */
export function applySyncResult(record, res) {
  const next = {
    ...record,
    synced_at: res.synced_at,
    status: res.status,
    reasons: res.reasons,
    engine_version: res.engine_version,
    scored_on: 'server',
    server_differs: Boolean(res.server_differs),
  };
  if (res.server_differs) {
    next.device_result = { status: record.status, reasons: record.reasons, engine_version: record.engine_version };
  }
  if (record.kind === 'daily_vitals' && res.official) {
    next.payload = { ...record.payload, result: res.official };
  }
  return next;
}

const PERMANENT = new Set([400, 403, 409, 422]);

/**
 * Send what is due and work out the new state.
 * @param {object} p
 * @param {object[]} p.records    every saved record (both kinds)
 * @param {string} p.crewId       the signed-in crew member; other people's records wait
 * @param {object} p.state        retry bookkeeping (not mutated)
 * @param {number} p.now          ms
 * @param {(readings: object[]) => Promise<{ results: object[] }>} p.send  throws on network / server failure
 * @returns {Promise<{ sent: number, updated: object[], state: object, error: string|null }>}
 *          `updated` = records to write back to the store
 */
export async function syncOnce({ records, crewId, state, now, send, random = Math.random }) {
  const batch = dueRecords(records, crewId, state, now);
  const nextState = { ...state };
  if (batch.length === 0) return { sent: 0, updated: [], state: nextState, error: null };

  const retryLater = (r, message) => {
    const attempts = (nextState[r.id]?.attempts ?? 0) + 1;
    nextState[r.id] = { attempts, next_at: now + backoffMs(attempts, random), last_error: message };
  };

  let response;
  try {
    response = await send(batch.map(toSyncReading));
  } catch (err) {
    for (const r of batch) retryLater(r, err?.message ?? 'Network error');
    return { sent: batch.length, updated: [], state: nextState, error: err?.message ?? 'Network error' };
  }

  const byId = new Map((response?.results ?? []).map((x) => [x.id, x]));
  const updated = [];
  for (const r of batch) {
    const res = byId.get(r.id);
    if (!res) retryLater(r, 'No answer for this reading');
    else if (res.result === 'stored' || res.result === 'already_stored') {
      updated.push(applySyncResult(r, res));
      delete nextState[r.id];
    } else if (PERMANENT.has(res.code)) {
      nextState[r.id] = { attempts: (nextState[r.id]?.attempts ?? 0) + 1, rejected: res.code, last_error: res.error ?? null };
    } else retryLater(r, res.error ?? `Server answered ${res.code}`);
  }
  return { sent: batch.length, updated, state: nextState, error: null };
}
