export async function POST(request) {
  let payload = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }
  if (!payload || typeof payload !== 'object') {
    return Response.json({ error: 'Check-in payload is missing' }, { status: 400 });
  }
  return Response.json({ ok: true });
}
