import { crewRoster } from '../../../lib/crewRoster.js';
export function GET(request) {
  const id = new URL(request.url).searchParams.get('crew');
  const member = crewRoster.find((person) => person.id === id);
  return member ? Response.json({ ...member, roster: crewRoster, missionDay: null, totalMissionDays: null, lastUpdated: null }) : Response.json({ error: 'Crew identity unavailable' }, { status: 404 });
}
