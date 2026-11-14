import { regionIndicators } from '../../../mocks/regions.js';
import { applyRangeStatus } from '../../../lib/rangeCheck.js';

export const dynamic = 'force-dynamic';

// GET /api/indicators?region=head  -> every indicator for one body region (the region drawer)
export function GET(request) {
  const regionId = request.nextUrl.searchParams.get('region');
  if (regionId === null) {
    return Response.json({ error: `region is missing. Use one of: ${Object.keys(regionIndicators).join(', ')}.` }, { status: 400 });
  }
  if (!Object.hasOwn(regionIndicators, regionId)) {
    return Response.json({ error: `Unknown body region: ${regionId}` }, { status: 404 });
  }
  return Response.json(regionIndicators[regionId].map(applyRangeStatus));
}
