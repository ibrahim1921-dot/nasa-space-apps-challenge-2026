export function GET() { return Response.json({ error: 'This feature has been removed.' }, { status: 410 }); }
export const POST = GET;
