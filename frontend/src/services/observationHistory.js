import { API_URL } from '../lib/backend.js';

/** Authenticated database history only: never substitute local or sample readings. */
export async function getObservationHistory(crewCode, { page = 0, activity = '', signal } = {}, fetcher = (...args) => globalThis.fetch(...args)) {
  async function request(path) {
    let response;
    try { response = await fetcher(`${API_URL}${path}`, { credentials: 'include', cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) }); }
    catch (error) { if (error.name === 'AbortError') throw error; throw new Error('Persisted observations are unavailable. Check the backend connection.'); }
    if (!response.ok) {
      const message = response.status === 401 ? 'Sign in to the backend service to view persisted observations.'
        : response.status === 403 ? 'Your backend account cannot access this crew member’s observations.'
        : 'Persisted observations are unavailable. Check the backend connection and API deployment.';
      throw new Error(message);
    }
    return response.json();
  }
  const profile = await request(`/api/crew/by-code/${encodeURIComponent(crewCode)}`);
  if (!profile.astronautId || profile.crewCode !== crewCode) throw new Error('The backend returned a different crew identity.');
  const query = new URLSearchParams({ page: String(page), size: '10', ...(activity ? { activity } : {}) });
  return request(`/api/crew/${encodeURIComponent(profile.astronautId)}/observations?${query}`);
}
