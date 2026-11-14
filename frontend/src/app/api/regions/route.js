import { regionStatuses } from '../../../mocks/regions.js';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(regionStatuses);
}
