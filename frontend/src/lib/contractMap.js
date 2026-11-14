// Translation between this app's reading keys and the API contract's indicator ids
// (docs/api-contract.md). Pure, so node:test checks it against docs/samples.

/** contract indicator id -> this app's check-in reading key(s) */
export const CONTRACT_TO_APP = {
  heart_rate: 'heart_rate',
  blood_pressure: 'blood_pressure',
  blood_sugar: 'glucose',
  body_temperature: 'temperature',
  sleep_hours: 'sleep_hours',
  mood: 'mood',
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** A saved daily check-in (lib/vitalsCheckinStore.js record or its sync form) -> POST /checkins body. */
export function toCheckinRequest({ recorded_at: recordedAt, payload }) {
  const r = payload?.reading ?? {};
  const readings = {
    heart_rate: num(r.heart_rate),
    blood_pressure:
      num(r.systolic) !== undefined && num(r.diastolic) !== undefined
        ? { systolic: r.systolic, diastolic: r.diastolic }
        : undefined,
    blood_sugar: num(r.glucose),
    body_temperature: num(r.temperature),
    sleep_hours: num(r.sleep_hours),
    mood: num(r.mood),
  };
  return {
    recordedAt,
    readings: Object.fromEntries(Object.entries(readings).filter(([, v]) => v !== undefined)),
  };
}

/**
 * POST /checkins response -> the outbox's per-record result (see lib/outbox.js applySyncResult).
 * The backend's statuses replace the device's; the device result is kept when they differ.
 */
export function fromCheckinResponse(record, body, syncedAt = new Date().toISOString()) {
  const deviceRows = record?.payload?.result?.indicators ?? {};
  const rows = { ...deviceRows };
  const reasons = [];
  for (const [contractId, row] of Object.entries(body?.indicators ?? {})) {
    const key = CONTRACT_TO_APP[contractId];
    if (!key || !row) continue;
    rows[key] = { ...(deviceRows[key] ?? {}), status: row.status, reasons: row.reasons ?? [], usual: row.usual ?? deviceRows[key]?.usual };
    reasons.push(...(row.reasons ?? []));
  }
  const status = body?.overall ?? record.status;
  return {
    id: record.id,
    result: 'stored',
    synced_at: syncedAt,
    status,
    reasons: reasons.length ? reasons : record.reasons,
    engine_version: 'backend',
    server_differs: status !== record.status,
    official: { ...(record.payload?.result ?? {}), indicators: rows, overall: status, guidance: body?.guidance ?? null },
  };
}
