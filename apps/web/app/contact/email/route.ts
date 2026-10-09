const noStore = { 'Cache-Control': 'no-store' };
const validEmail = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/;

export const dynamic = 'force-dynamic';

function sameHostOrigin(request: Request, origin: string): boolean {
  try {
    const parsedOrigin = new URL(origin);
    if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== origin) return false;
    const hostHeader = request.headers.get('host');
    if (hostHeader && /[\s/?#@\\]/u.test(hostHeader)) return false;
    const requestHost = hostHeader ? new URL(`${parsedOrigin.protocol}//${hostHeader}`).host : new URL(request.url).host;
    return parsedOrigin.host === requestHost;
  } catch { return false; }
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (request.headers.get('X-OpenScience-Contact-Intent') !== 'compose' ||
    (origin && !sameHostOrigin(request, origin))) {
    return Response.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return Response.json({ error: 'invalid_request' }, { status: 400, headers: noStore });
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid_request' }, { status: 400, headers: noStore }); }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
    Object.keys(body).length !== 1 || (body as Record<string, unknown>).intent !== 'compose') {
    return Response.json({ error: 'invalid_request' }, { status: 400, headers: noStore });
  }
  const email = [process.env.OPENSCIENCE_CONTACT_EMAIL, process.env.NEXT_PUBLIC_OPENSCIENCE_CONTACT_EMAIL, 'chunanqing@opt.ac.cn']
    .map(value => value?.trim() ?? '').find(value => validEmail.test(value));
  if (!email) return Response.json({ error: 'unavailable' }, { status: 500, headers: noStore });
  return Response.json({ email }, { headers: noStore });
}
