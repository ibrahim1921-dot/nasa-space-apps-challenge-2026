import { randomUUID } from 'node:crypto';
import { FEATURE_KEYS, SOURCE_PHYSIONET, isClean, scoreNight, validateNight } from '../../../../lib/nightlyScore.js';
import { getLoggedNights, getModel, getRecordedNights, getSubjects, saveLoggedNight } from '../../../../lib/nightsData.js';

export const dynamic = 'force-dynamic';

const MAX_EXTRA_HISTORY = 400;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const bad = (message) => Response.json({ source: SOURCE_PHYSIONET, error: message }, { status: 400 });

const pickFeatures = (obj) => Object.fromEntries(FEATURE_KEYS.map((k) => [k, obj[k]]));

/**
 * POST /api/nights/score
 * Body: { subject_id, night: {6 features}, id?, date?, extra_history?: [{ id?, ...6 features }] }
 * Scores the night against the person's clean recorded nights + extra_history (sent by the client,
 * which keeps logged nights in localStorage) + nights this server instance saved and the client did not send.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return bad('Request body must be JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('Request body must be a JSON object.');

  const { subject_id: subjectId, night, extra_history: extraHistory = [] } = body;

  if (typeof subjectId !== 'string' || subjectId === '') return bad('subject_id is missing.');
  if (!getSubjects().includes(subjectId)) return bad(`Unknown subject_id "${subjectId}".`);

  const nightError = validateNight(night, 'night');
  if (nightError) return bad(nightError);

  if (body.id !== undefined && (typeof body.id !== 'string' || !ID_PATTERN.test(body.id))) {
    return bad('id must be 1–64 letters, digits, "-" or "_".');
  }
  if (body.date !== undefined && (typeof body.date !== 'string' || !DATE_PATTERN.test(body.date))) {
    return bad('date must look like YYYY-MM-DD.');
  }

  if (!Array.isArray(extraHistory)) return bad('extra_history must be an array.');
  if (extraHistory.length > MAX_EXTRA_HISTORY) return bad(`extra_history can hold at most ${MAX_EXTRA_HISTORY} nights.`);
  for (let i = 0; i < extraHistory.length; i += 1) {
    const row = extraHistory[i];
    const rowError = validateNight(row, `extra_history[${i}]`);
    if (rowError) return bad(rowError);
    if (row.id !== undefined && (typeof row.id !== 'string' || !ID_PATTERN.test(row.id))) {
      return bad(`extra_history[${i}].id must be 1–64 letters, digits, "-" or "_".`);
    }
  }

  const id = body.id ?? randomUUID();
  const extraIds = new Set(extraHistory.map((r) => r.id).filter(Boolean));
  const extra = extraHistory.filter((r) => r.id !== id).map(pickFeatures);
  const fromMemory = getLoggedNights(subjectId)
    .filter((e) => e.id !== id && !extraIds.has(e.id))
    .map((e) => e.night);
  const recorded = getRecordedNights(subjectId);

  const cleanNight = pickFeatures(night);
  const result = scoreNight(cleanNight, [...recorded, ...extra, ...fromMemory], getModel());
  const { z, ...publicResult } = result;

  const loggedAt = new Date().toISOString();
  saveLoggedNight(subjectId, { id, logged_at: loggedAt, date: body.date ?? null, night: cleanNight, result: publicResult });

  return Response.json({
    source: SOURCE_PHYSIONET,
    id,
    subject_id: subjectId,
    logged_at: loggedAt,
    date: body.date ?? null,
    status: publicResult.status,
    heart_rate_score: publicResult.heart_rate_score,
    sleep_score: publicResult.sleep_score,
    reason: publicResult.reason,
    history_used: {
      recorded_clean_nights: recorded.filter(isClean).length,
      extra_history: extra.length,
      server_memory: fromMemory.length,
    },
  });
}

export function GET() {
  return Response.json(
    { source: SOURCE_PHYSIONET, error: 'Use POST with { subject_id, night }.' },
    { status: 405, headers: { Allow: 'POST' } },
  );
}
