import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const COOKIE_NAME = 'att_session';
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'fallback-secret-change-in-production-32chars'
);

async function verifyTokenFromRequest(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as { userId: string; email: string; role: string };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow scan API without auth (device_key validated in handler)
  if (pathname.startsWith('/api/scan/')) {
    return NextResponse.next();
  }

  // Allow auth API without auth
  if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  // Allow login page
  if (pathname === '/login') {
    return NextResponse.next();
  }

  // Protect scanner page — only ADMIN or STAFF can operate the scanner
  // Students must NOT be able to open this page
  if (pathname === '/scan') {
    const payload = await verifyTokenFromRequest(request);
    if (!payload) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', '/scan');
      return NextResponse.redirect(loginUrl);
    }
    if (payload.role !== 'ADMIN' && payload.role !== 'STAFF') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  // Protect all admin routes and admin API routes
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    const payload = await verifyTokenFromRequest(request);

    if (!payload) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Only ADMIN and STAFF can access admin routes
    if (payload.role !== 'ADMIN' && payload.role !== 'STAFF') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
    '/api/scan/:path*',
    '/api/auth/:path*',
    '/scan',
    '/login'
  ]
};
