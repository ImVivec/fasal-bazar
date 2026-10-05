// Gate in front of every page: only approved, logged-in users get through.
// Verifies the signed session cookie (no DB call), then rewrites /x to /<lang>/x so the user's
// language is served from the pre-built static pages at the same public URL.
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from './lib/session';

const PUBLIC = ['/login', '/signup'];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const s = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isPublic) return s ? NextResponse.redirect(new URL('/', req.url)) : NextResponse.next();
  if (!s) {
    const res = NextResponse.redirect(new URL('/login', req.url));
    if (req.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE); // expired/invalid
    return res;
  }
  // Canonical URLs carry no language prefix.
  const m = /^\/(en|hi)(\/.*)?$/.exec(pathname);
  if (m) return NextResponse.redirect(new URL((m[2] || '/') + search, req.url));
  if (pathname.startsWith('/admin') && s.r !== 'admin') return NextResponse.redirect(new URL('/', req.url));

  return NextResponse.rewrite(new URL(`/${s.l}${pathname === '/' ? '' : pathname}${search}`, req.url));
}

export const config = {
  // Everything except API routes (they check auth themselves), Next internals and static files.
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|robots.txt|.*\\.(?:png|jpg|webp|svg|ico|txt|webmanifest)$).*)'],
};
