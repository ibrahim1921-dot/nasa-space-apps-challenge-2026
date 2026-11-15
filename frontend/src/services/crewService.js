// Crew profiles from the backend (docs/astronaut-api-phase3.md). All routes require a session.
import { api as defaultApi } from '../lib/api.js';
import { toCrewView, toCrewViews } from '../lib/crewAdapter.js';

/** GET /api/crew → active roster as crew views (both roles). */
export async function listCrew(api = defaultApi) {
  return toCrewViews(await api.get('/api/crew'));
}

/** GET /api/crew/me → the astronaut's own profile (officers get 403: they have no astronaut link). */
export async function myProfile(api = defaultApi) {
  return toCrewView(await api.get('/api/crew/me'));
}

/** GET /api/crew/{uuid} → one profile (astronaut: own only; officer: any, including archived). */
export async function crewById(astronautId, api = defaultApi) {
  return toCrewView(await api.get(`/api/crew/${encodeURIComponent(astronautId)}`));
}
