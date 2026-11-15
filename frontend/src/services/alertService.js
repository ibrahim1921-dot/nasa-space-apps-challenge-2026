// Health alerts (backend/docs/health-alert-api-phase4e2.md).
//
//   GET  /api/alerts/me                 ASTRONAUT      own alerts, paginated
//   GET  /api/alerts                    NASA_OFFICER   crew alerts, paginated, astronautId filter allowed
//   GET  /api/alerts/{id}               owner/officer  detail with evidence and history
//   POST /api/alerts/{id}/acknowledge   owner/officer  OPEN → ACKNOWLEDGED (no body)
//   POST /api/alerts/{id}/resolve       officer        ACKNOWLEDGED → RESOLVED, body { note } (1–2000 chars)
import { api as defaultApi, validateNote } from '../lib/api.js';

export const SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'];
export const STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'];
export const TRIGGER_TYPES = ['RULE', 'SELF_REPORT', 'ML', 'MANUAL'];
export const PAGE_SIZE = 20;

/**
 * The nine indicator codes and names seeded in backend migration V22 (health_indicators). The backend
 * validates `indicator` against that table and returns 400 for an unknown code.
 */
export const INDICATORS = [
  { code: 'heart_rate', name: 'Heart rate' },
  { code: 'blood_pressure', name: 'Blood pressure' },
  { code: 'blood_sugar', name: 'Blood glucose' },
  { code: 'body_temperature', name: 'Body temperature' },
  { code: 'sleep_hours', name: 'Sleep duration' },
  { code: 'mood', name: 'Mood' },
  { code: 'muscle', name: 'Muscle strength and mass' },
  { code: 'bone_mineral_density', name: 'Bone mineral density' },
  { code: 'cumulative_absorbed_radiation_dose', name: 'Personal cumulative radiation dose' },
];
export const INDICATOR_CODES = INDICATORS.map((i) => i.code);

/** A YYYY-MM-DD date input → ISO instant at 00:00 UTC, or null. `endOfDay` gives the next midnight (exclusive bound). */
export function dayToInstant(day, endOfDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) return null;
  const t = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return new Date(endOfDay ? t + 86_400_000 : t).toISOString();
}

/**
 * UI filter → backend query. Drops empty values and anything the backend would reject with 400.
 * `officer` controls whether astronautId may be sent (sending it to /me is a 400).
 */
export function buildAlertQuery(filter = {}, { officer = false } = {}) {
  const q = { page: Math.max(0, Math.min(10000, Math.trunc(Number(filter.page) || 0))), size: filter.size ?? PAGE_SIZE };
  if (SEVERITIES.includes(filter.severity)) q.severity = filter.severity;
  if (STATUSES.includes(filter.status)) q.status = filter.status;
  if (TRIGGER_TYPES.includes(filter.triggerType)) q.triggerType = filter.triggerType;
  if (filter.indicator) q.indicator = filter.indicator;
  if (filter.synthetic === 'true' || filter.synthetic === 'false') q.synthetic = filter.synthetic;
  if (officer && filter.astronautId) q.astronautId = filter.astronautId;
  const from = dayToInstant(filter.fromDay);
  const to = dayToInstant(filter.toDay, true);
  if (from) q.from = from;
  if (to && (!from || from < to)) q.to = to;
  return q;
}

export const listMyAlerts = (filter, api = defaultApi) => api.get('/api/alerts/me', { query: buildAlertQuery(filter) });
export const listCrewAlerts = (filter, api = defaultApi) => api.get('/api/alerts', { query: buildAlertQuery(filter, { officer: true }) });
export const getAlert = (id, api = defaultApi) => api.get(`/api/alerts/${encodeURIComponent(id)}`);
export const acknowledgeAlert = (id, api = defaultApi) => api.post(`/api/alerts/${encodeURIComponent(id)}/acknowledge`);

export async function resolveAlert(id, note, api = defaultApi) {
  const problem = validateNote(note);
  if (problem) throw new Error(problem);
  return api.post(`/api/alerts/${encodeURIComponent(id)}/resolve`, { note });
}

/** Which actions the UI offers, following the documented lifecycle table. */
export function alertActions(summary, role) {
  const status = summary?.status;
  return {
    canAcknowledge: status === 'OPEN' && (role === 'ASTRONAUT' || role === 'NASA_OFFICER'),
    canResolve: status === 'ACKNOWLEDGED' && role === 'NASA_OFFICER',
    needsAcknowledgeFirst: status === 'OPEN' && role === 'NASA_OFFICER',
  };
}

/** Is this alert synthetic / nonclinical, per the backend flags? */
export const isSyntheticAlert = (summary) => Boolean(summary?.synthetic || summary?.nonclinical);

/** Readable indicator label: the V22 name, else 'some_code' → 'Some code'. */
export const indicatorLabel = (code) =>
  INDICATORS.find((i) => i.code === code)?.name ??
  (typeof code === 'string' && code ? code.charAt(0).toUpperCase() + code.slice(1).replace(/_/g, ' ') : '');
