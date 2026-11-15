import { crewMemberFor, crewRoster } from '../../../mocks/crew.js';

export const dynamic = 'force-dynamic';

// GET /api/crew?crew=crew-03  one crew member's header details plus the roster.
// GET /api/crew               the roster only ({ roster, lastUpdated }, no member): there is no
//                             default person, the app always asks for the signed-in crew member.
// lastUpdated is computed per request ("a few minutes ago") so it does not drift on a long-running server.
export function GET(request) {
  const crewId = new URL(request.url).searchParams.get('crew');
  const lastUpdated = new Date(Date.now() - 4 * 60 * 1000).toISOString();
  if (crewId === null) return Response.json({ roster: crewRoster, lastUpdated });

  const member = crewMemberFor(crewId);
  if (!member) {
    return Response.json(
      { error: `Unknown crew "${crewId}". Use one of: ${crewRoster.map((c) => c.id).join(', ')}.` },
      { status: 404 },
    );
  }
  return Response.json({ ...member, roster: crewRoster, lastUpdated });
}
