import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const origin = request.headers.get('origin');
  if (request.method === 'POST' && origin && new URL(origin).host !== request.headers.get('host')) {
    return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403 });
  }
  const { path } = await context.params;
  if (path[0] !== 'campaigns' || path.some(part => !/^[a-zA-Z0-9-]+$/.test(part))) {
    return NextResponse.json({ error: 'Route inconnue.' }, { status: 404 });
  }
  const base = process.env.BACKEND_URL || 'http://localhost:8000';
  const token = process.env.API_TOKEN;
  if (!token) return NextResponse.json({ error: 'API_TOKEN non configuré.' }, { status: 503 });
  try {
    const response = await fetch(`${base}/api/v1/${path.join('/')}${request.nextUrl.search}`, {
      method: request.method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: request.method === 'POST' ? (await request.text()) || undefined : undefined,
      cache: 'no-store', signal: AbortSignal.timeout(20000),
    });
    if (path.includes('artifacts') && response.ok) {
      const data = await response.json();
      return NextResponse.redirect(data.url, { status: 307, headers: { 'Cache-Control': 'no-store' } });
    }
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Le backend est indisponible.' }, { status: 503 });
  }
}

export { forward as GET, forward as POST };
