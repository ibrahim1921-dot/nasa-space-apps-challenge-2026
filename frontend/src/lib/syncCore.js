// Server side of POST /api/sync, with the database injected so node:test can run it.
// For each reading: validate, check it belongs to the signed-in crew member, re-score it with the
// same engines the device used, insert it (ON CONFLICT (id) DO NOTHING), and report per reading.
// The server's result is the official one; when it differs from the device's, the response says so.

import { validateStandTest } from './standTest.js';
import { validateReading } from './vitalsCheckin.js';
import { SCORED_ON, historyFromRows, sameResult, scoreCheckin, scoreStandTest } from './scoring.js';
import { cleanProvenance, crewNameFor, validateProvenance } from './provenance.js';
import { CMO_EXAM } from './vitalsCheckin.js';
import { sensorDaysUntil } from './sensorFeed.js';

export const MAX_SYNC_BATCH = 100;
const KINDS = ['daily_vitals', 'stand_test'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FUTURE_SLACK_MS = 10 * 60 * 1000; // device clocks drift; reject readings more than 10 min ahead

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** @returns {string|null} why this sync item is not acceptable */
export function validateSyncItem(item, nowMs) {
  if (!isObject(item)) return 'Each reading must be an object.';
  if (typeof item.id !== 'string' || !UUID_RE.test(item.id)) return 'id must be a UUID made on the device.';
  if (typeof item.crew_id !== 'string' || item.crew_id === '') return 'crew_id is missing.';
  if (!KINDS.includes(item.kind)) return `kind must be one of: ${KINDS.join(', ')}.`;
  const t = typeof item.recorded_at === 'string' ? Date.parse(item.recorded_at) : NaN;
  if (Number.isNaN(t)) return 'recorded_at must be an ISO date-time string.';
  if (t > nowMs + FUTURE_SLACK_MS) return 'recorded_at is in the future.';
  if (!isObject(item.payload)) return 'payload must be an object.';
  if (item.kind === 'daily_vitals') {
    return validateReading(item.payload.reading, 'payload.reading') ?? validateProvenance(item.payload, 'payload');
  }
  return validateStandTest(item.payload, 'payload');
}

/** Context answers from the check-in, with known fields only. */
export function cleanContext(ctx) {
  if (!isObject(ctx)) return null;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);
  return {
    missionDay: num(ctx.missionDay),
    isolation: num(ctx.isolation),
    sleepHours: num(ctx.sleepHours),
    workload: str(ctx.workload, 20),
    lastFamilyCall: str(ctx.lastFamilyCall, 20),
    crewTension: typeof ctx.crewTension === 'boolean' ? ctx.crewTension : null,
    notes: str(ctx.notes, 500) ?? '',
  };
}

/**
 * Who is syncing. 401 without a valid token, 403 when the user has no crew member.
 * @param {{ token: string|null, getUser: (t) => Promise<{id}|null>, crewForUser: (userId) => Promise<string|null> }} p
 */
export async function authorize({ token, getUser, crewForUser }) {
  if (!token) return { status: 401, error: 'Sign in first: the request has no access token.' };
  const user = await getUser(token);
  if (!user) return { status: 401, error: 'The access token is not valid or has expired. Sign in again.' };
  const member = await crewForUser(user.id);
  // crewForUser returns the crew id, or { id, role, name } from crew_members (the role decides CMO rights).
  const crewId = typeof member === 'string' ? member : member?.id ?? null;
  if (!crewId) return { status: 403, error: 'This account is not linked to a crew member.' };
  if (typeof member === 'string') return { status: 200, crewId, userId: user.id };
  return { status: 200, crewId, userId: user.id, role: member.role ?? null, name: member.name ?? null };
}

/**
 * May the signed-in person store this (already valid) reading? Decided from the session and the
 * crew_members role only, never from what the client claims.
 * @returns {null | { code: number, error: string }}
 */
export function checkAuthor(item, { crewId, role = null }) {
  const daily = item.kind === 'daily_vitals';
  const exam = daily && item.payload.kind_detail === CMO_EXAM;
  const by = daily ? item.payload.entered_by : undefined;
  const cmoExamForOther = exam && role === 'cmo' && item.crew_id !== crewId && by?.crew_id === crewId;
  if (item.crew_id !== crewId && !cmoExamForOther) {
    return {
      code: 403,
      error:
        `This reading is for ${item.crew_id}, but you are signed in as ${crewId}. Crew can only add their own readings.` +
        (role === 'cmo' ? ' A reading for another crew member must be an exam (kind_detail cmo_exam) entered by you.' : ' Only the Crew Medical Officer can record an exam for another crew member.'),
    };
  }
  if (exam && role !== 'cmo') return { code: 403, error: 'Only the Crew Medical Officer can record an exam.' };
  if (exam && item.crew_id === crewId) return { code: 403, error: 'An exam must be for another crew member.' };
  if (by && by.crew_id !== crewId) {
    return {
      code: 403,
      error: `entered_by is ${by.crew_id}, but you are signed in as ${crewId}. Readings are entered by the signed-in crew member.`,
    };
  }
  if (daily && (item.payload.demo_events ?? []).some((e) => e.crewId !== item.crew_id)) {
    return { code: 400, error: 'payload.demo_events may only hold events for the crew member the reading is for.' };
  }
  return null;
}

const officialOf = (kind, row) =>
  kind === 'daily_vitals' ? row.payload?.result ?? null : { status: row.status, reasons: row.reasons };

function answer(code, item, extra = {}) {
  return { id: item?.id ?? null, code, ...extra };
}

/**
 * @param {object} p
 * @param {unknown[]} p.readings
 * @param {string} p.crewId                the signed-in user's crew member
 * @param {string|null} [p.role]          their role from crew_members ('crew' | 'cmo'); only 'cmo' may store exams for others
 * @param {string|null} [p.name]          their name from crew_members, stored as an exam's entered_by.name
 * @param {object} p.db
 *   findByIds(ids) -> Promise<row[]>
 *   dailyRows(crewId) -> Promise<row[]>   that person's daily_vitals rows ({ recorded_at, payload })
 *   insert(row) -> Promise<row|null>       null when the id already existed (ON CONFLICT DO NOTHING)
 * @param {(crewId) => object[]} p.preflightFor  the person's preflight stand tests
 * @param {() => Date} [p.clock]
 * @returns {Promise<{ results: object[] }>}
 */
export async function processBatch({ readings, crewId, role = null, name = null, db, preflightFor, clock = () => new Date() }) {
  const nowMs = clock().getTime();
  const results = new Array(readings.length);
  const valid = [];

  readings.forEach((item, i) => {
    const error = validateSyncItem(item, nowMs);
    if (error) {
      results[i] = answer(400, item, { result: 'rejected', error });
      return;
    }
    const refused = checkAuthor(item, { crewId, role });
    if (refused) results[i] = answer(refused.code, item, { result: 'rejected', error: refused.error });
    else valid.push({ item, i });
  });

  const existing = new Map((valid.length ? await db.findByIds(valid.map((v) => v.item.id)) : []).map((r) => [r.id, r]));
  const dailyBy = new Map(); // crew id → that person's daily_vitals rows, loaded once, grown as readings are stored

  const already = ({ item }, row) => {
    // The stored row must be this person's, for the same crew member; an exam must also be one they entered.
    // Otherwise say nothing about it, so a retry cannot be used to find out which ids exist.
    const author = row.payload?.kind_detail === CMO_EXAM ? row.payload?.entered_by?.crew_id : row.crew_id;
    if (row.crew_id !== item.crew_id || author !== crewId) {
      return answer(403, item, { result: 'rejected', error: 'This id belongs to another crew member.' });
    }
    const differs = item.device_result ? !sameResult(item.device_result, row) : false;
    return answer(200, item, {
      result: 'already_stored',
      status: row.status,
      reasons: row.reasons,
      engine_version: row.engine_version,
      synced_at: row.synced_at,
      server_differs: differs,
      device_status: item.device_result?.status ?? null,
      official: officialOf(row.kind, row),
    });
  };

  // Oldest first, so each daily reading is scored with the ones before it in the same batch.
  valid.sort((a, b) => Date.parse(a.item.recorded_at) - Date.parse(b.item.recorded_at));
  for (const v of valid) {
    const { item } = v;
    const prior = existing.get(item.id);
    if (prior) {
      results[v.i] = already(v, prior);
      continue;
    }

    let official;
    let payload;
    if (item.kind === 'daily_vitals') {
      // Always the patient's history: for an exam that is the examined crew member, not the CMO.
      const patient = item.crew_id;
      if (!dailyBy.has(patient)) dailyBy.set(patient, await db.dailyRows(patient));
      const { crewDays, saved } = historyFromRows(dailyBy.get(patient));
      // Simulated sensor days are rebuilt here from crew.json with the same deterministic generator
      // and the person's demo events, so the server and the device score against the same history.
      // Only check-ins made with the sensor feed carry `devices`; older ones are scored as before.
      const extra = cleanProvenance(item.payload);
      const sensorDays = !extra.devices ? [] : sensorDaysUntil({
        crewId: patient,
        crewDays,
        untilDate: item.recorded_at.slice(0, 10),
        demo: { events: extra.demo_events ?? [] },
      });
      const exam = extra.kind_detail === CMO_EXAM;
      // The examiner is taken from the session and crew_members, not from what the device sent.
      if (exam) extra.entered_by = { crew_id: crewId, name: name ?? crewNameFor(crewId) ?? extra.entered_by.name, role };
      official = scoreCheckin({
        crewId: patient,
        reading: item.payload.reading,
        kindDetail: exam ? CMO_EXAM : null,
        crewDays,
        saved,
        sensorDays,
        at: item.recorded_at,
        scoredOn: SCORED_ON.server,
      });
      payload = { origin: 'device', reading: official.reading, context: cleanContext(item.payload.context), result: official, ...extra };
    } else {
      official = scoreStandTest({ test: item.payload, preflightTests: preflightFor(crewId), scoredOn: SCORED_ON.server });
      payload = { origin: 'device', ...official.test };
    }

    const differs = item.device_result ? !sameResult(item.device_result, official) : false;
    if (differs) payload.device_result = item.device_result;

    const row = {
      id: item.id,
      crew_id: item.crew_id, // checkAuthor: the signed-in person, or the patient of their CMO exam
      kind: item.kind,
      recorded_at: new Date(item.recorded_at).toISOString(),
      payload,
      status: official.status,
      reasons: official.reasons,
      engine_version: official.engine_version,
    };
    const stored = await db.insert(row);
    if (!stored) {
      // Another request stored this id between our lookup and the insert.
      const [again] = await db.findByIds([item.id]);
      results[v.i] = again ? already(v, again) : answer(500, item, { result: 'error', error: 'Could not store or find this reading.' });
      continue;
    }
    if (item.kind === 'daily_vitals') dailyBy.get(item.crew_id).push(stored);
    results[v.i] = answer(201, item, {
      result: 'stored',
      status: stored.status,
      reasons: stored.reasons,
      engine_version: stored.engine_version,
      synced_at: stored.synced_at,
      server_differs: differs,
      device_status: item.device_result?.status ?? null,
      official: item.kind === 'daily_vitals' ? official : { status: official.status, reasons: official.reasons, changes: official.changes },
    });
  }
  return { results };
}
