import { crewMember, crewMemberFor, crewRoster } from '../../../mocks/crew.js';

export const dynamic = 'force-dynamic';

// GET /api/crew[?crew=crew-03]  the signed-in demo crew member (default: crew-01) and the roster.
// lastUpdated is computed per request ("a few minutes ago") so it does not drift on a long-running server.
export function GET(request) {
  const crewId = new URL(request.url).searchParams.get('crew');
  const member = crewId === null ? crewMember : crewMemberFor(crewId);
  if (!member) {
    return Response.json(
      { error: `Unknown crew "${crewId}". Use one of: ${crewRoster.map((c) => c.id).join(', ')}.` },
      { status: 404 },
    );
  }
  return Response.json({
    ...member,
    roster: crewRoster,
    lastUpdated: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
  });
}
