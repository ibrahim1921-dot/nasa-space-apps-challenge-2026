import { crewRoster } from '../../../mocks/crew.js';
import { CRITERIA, PERSONAL_MARGIN, STAND_TEST_ENGINE_VERSION, evaluateStandTest } from '../../../lib/standTest.js';
import { getPreflightTests, getStandTestFile, getStandTests } from '../../../lib/standTestsData.js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stand-tests[?crew=crew-01]
 * The seeded (synthetic) stand tests, each with its evaluation against the same person's
 * other preflight tests.
 */
export function GET(request) {
  const crew = new URL(request.url).searchParams.get('crew');
  const file = getStandTestFile();

  if (crew !== null && !crewRoster.some((c) => c.id === crew)) {
    return Response.json(
      { source: file.source, error: `Unknown crew "${crew}". Use one of: ${crewRoster.map((c) => c.id).join(', ')}.` },
      { status: 404 },
    );
  }

  const tests = getStandTests(crew ?? undefined).map((t) => {
    const { status, reasons, changes } = evaluateStandTest(t, getPreflightTests(t.crew_id));
    return { ...t, result: { status, reasons, changes } };
  });

  return Response.json({
    source: file.source,
    note: file.note,
    protocol: file.protocol,
    engine_version: STAND_TEST_ENGINE_VERSION,
    criteria: CRITERIA,
    personal_margin: PERSONAL_MARGIN,
    crew: crewRoster,
    count: tests.length,
    tests,
  });
}
