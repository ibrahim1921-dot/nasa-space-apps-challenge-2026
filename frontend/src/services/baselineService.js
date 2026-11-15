// Personal baselines and monitoring rules, read-only (backend/docs/personal-baselines-phase4d1.md,
// backend/docs/monitoring-rules-phase4d2.md). Writes (propose/approve, create/activate) need real
// observation UUIDs, comparison scope UUIDs and (for approval) a second officer; not offered here yet.
//
// These routes return database rows as JSON maps (JdbcTemplate.queryForList), so keys are the SQL
// column names in snake_case, e.g. indicator_code, reference_value, approved_at.
import { api as defaultApi } from '../lib/api.js';

/** GET /api/crew/{astronautId}/baselines/versions → stored baseline versions. */
export const baselineVersions = (astronautId, api = defaultApi) =>
  api.get(`/api/crew/${encodeURIComponent(astronautId)}/baselines/versions`);

/** GET /api/crew/{astronautId}/baselines → proposal history with approval details. */
export const baselineProposals = (astronautId, api = defaultApi) =>
  api.get(`/api/crew/${encodeURIComponent(astronautId)}/baselines`);

/** GET /api/monitoring-rules → every rule version with provenance and activation history (officer). */
export const monitoringRules = (api = defaultApi) => api.get('/api/monitoring-rules');

/** activation_history arrives as a JSON string; parse it safely. */
export function activationEvents(rule) {
  const raw = rule?.activation_history;
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Active now? The latest activation event with effective_at ≤ now decides; no event = inactive (rules start inactive). */
export function ruleActiveNow(rule, now = Date.now()) {
  const due = activationEvents(rule)
    .filter((e) => Date.parse(e.effective_at) <= now)
    .sort((a, b) => Date.parse(a.effective_at) - Date.parse(b.effective_at));
  return due.length ? Boolean(due.at(-1).active) : false;
}

/** A version is approved only with an approval row; legacy rows without one are not. */
export const baselineApproved = (row) => Boolean(row?.approved_at);
