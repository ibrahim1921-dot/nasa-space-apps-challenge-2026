// ML assessment: the frontend side only. The model and its endpoint are Augustine's backend work.
//
// Today getAssessment() returns DEMO DATA from src/mocks/mlAssessment.js. The screen reads `demo: true`
// and shows "Demo data: model not connected yet".
//
// TODO: real endpoint. Replace the body of getAssessment() with the backend call once Augustine confirms
// the route and shape, e.g.
//     const body = await api.get(`/api/.../${astronautId}/assessment`);   // route NOT confirmed
//     return normalizeAssessment(body, { demo: false });
// Expected shape (assumed until confirmed; listed in the integration report):
//   {
//     assessedAt: string (ISO-8601 instant),
//     model:   { name: string, version: string },
//     risk:    { class: string, probability: number (0–1), explanation: string[] } | null,
//     anomaly: { status: string, reconstructionError: number, threshold: number } | null,
//     inputs:  { missing: string[] }          // indicator codes that were not available
//   }
// A non-empty inputs.missing with null risk/anomaly means "not enough input to assess".

import { MOCK_ASSESSMENTS } from '../mocks/mlAssessment.js';

export const ASSESSMENT_IS_DEMO = true;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Validate and normalise a payload of the expected shape; unknown fields are dropped. */
export function normalizeAssessment(body, { demo }) {
  if (!body || typeof body !== 'object') return { state: 'error', demo, message: 'No assessment returned.' };
  if (typeof body.error === 'string') return { state: 'error', demo, message: body.error };
  const missing = Array.isArray(body.inputs?.missing) ? body.inputs.missing.filter((m) => typeof m === 'string') : [];
  const risk = body.risk
    ? {
        class: String(body.risk.class ?? ''),
        probability: num(body.risk.probability),
        explanation: Array.isArray(body.risk.explanation) ? body.risk.explanation.filter((e) => typeof e === 'string') : [],
      }
    : null;
  const anomaly = body.anomaly
    ? {
        status: String(body.anomaly.status ?? ''),
        reconstructionError: num(body.anomaly.reconstructionError),
        threshold: num(body.anomaly.threshold),
      }
    : null;
  const model = { name: String(body.model?.name ?? 'unknown'), version: String(body.model?.version ?? 'unknown') };
  const state = !risk && !anomaly && missing.length ? 'insufficient' : risk || anomaly ? 'ok' : 'error';
  return {
    state,
    demo,
    assessedAt: typeof body.assessedAt === 'string' ? body.assessedAt : null,
    model,
    risk,
    anomaly,
    missing,
    message: state === 'error' ? 'The assessment could not be read.' : null,
  };
}

/**
 * The one function the screen calls. The real endpoint will take the backend astronautId (UUID).
 * `mockKey` (the crew code) is used only to pick a demo example and can be dropped with the mock.
 */
// eslint-disable-next-line no-unused-vars
export async function getAssessment(astronautId, mockKey) {
  // TODO: real endpoint (see the comment at the top of this file).
  const body = MOCK_ASSESSMENTS[mockKey];
  if (!body) return { state: 'insufficient', demo: true, assessedAt: null, model: null, risk: null, anomaly: null, missing: [], message: 'No demo example for this person.' };
  return normalizeAssessment(body, { demo: true });
}
