import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

function equal(left: string, right: string) {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Single-tenant access gate. Both pages and API proxy require the same credentials.
export function proxy(request: NextRequest) {
  const username = process.env.APP_USERNAME || 'admin';
  const password = process.env.APP_PASSWORD;
  if (!password || password.length < 16) {
    return new NextResponse('Configurez APP_PASSWORD (16 caractères minimum).', { status: 503 });
  }
  const authorization = request.headers.get('authorization') || '';
  if (authorization.startsWith('Basic ')) {
    const supplied = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const separator = supplied.indexOf(':');
    if (separator !== -1 && equal(supplied.slice(0, separator), username)
        && equal(supplied.slice(separator + 1), password)) return NextResponse.next();
  }
  return new NextResponse('Authentification requise.', {
    status: 401, headers: { 'WWW-Authenticate': 'Basic realm="SynthoCrowd", charset="UTF-8"' },
  });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
