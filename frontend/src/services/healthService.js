// Data access without bundled health samples or synthetic fallbacks.
import { crewRoster } from '../lib/crewRoster.js';
import { USE_MOCKS, backend } from '../lib/backend.js';

export async function getCrewMember(crewId) {
  const member = crewRoster.find((person) => person.id === crewId);
  if (!member) throw new Error('Crew identity unavailable');
  return { ...member, roster: crewRoster, missionDay: null, totalMissionDays: null, lastUpdated: null };
}
export async function getRegionIndicators() { return []; }
export async function getRegionStatuses() { return {}; }
export async function getRadiation() { return USE_MOCKS ? { days: [], source: null } : backend('/api/environment/radiation'); }
export async function getNights() { throw new Error('Sleep & recovery has been removed.'); }
export async function getLabs() { throw new Error('Lab baseline has been removed.'); }
export async function getStandTests() { throw new Error('Stand test has been removed.'); }
export async function scoreTonight() { throw new Error('Sleep & recovery has been removed.'); }
export async function submitContextCheckin() { throw new Error('No check-in submission service is connected.'); }
