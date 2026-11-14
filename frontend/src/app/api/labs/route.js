import { SOURCE_NASA } from '../../../lib/nightlyScore.js';
import { getLabs } from '../../../lib/nightsData.js';

export const dynamic = 'force-dynamic';

/** GET /api/labs[?analyte=MCV] — Inspiration4 lab values with each person's preflight baseline. */
export function GET(request) {
  const analyte = new URL(request.url).searchParams.get('analyte');
  const all = getLabs();
  const analytes = [...new Set(all.map((r) => r.analyte))].sort();

  if (analyte !== null && !analytes.includes(analyte)) {
    return Response.json(
      { source: SOURCE_NASA, error: `Unknown analyte "${analyte}".`, analytes },
      { status: 404 },
    );
  }

  const rows = analyte === null ? all : all.filter((r) => r.analyte === analyte);
  return Response.json({ source: SOURCE_NASA, analytes, count: rows.length, rows });
}
