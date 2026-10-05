// Session helpers for server components, server actions and route handlers.
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cookieOpts, SESSION_COOKIE, signSession, UI_COOKIE, verifySession, type Session } from './session';
import { DISTRICTS } from './master';
import type { UserDoc } from './db';

export async function getSession(): Promise<Session | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect('/login');
  return s;
}

export async function requireAdmin(): Promise<Session> {
  const s = await requireSession();
  if (s.r !== 'admin') redirect('/');
  return s;
}

/** Issue the signed session cookie plus a readable UI cookie (display only). */
export async function startSession(u: Pick<UserDoc, '_id' | 'role' | 'l' | 'd'>) {
  const { value } = signSession({ u: u._id, r: u.role, l: u.l, d: u.d });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, value, cookieOpts());
  const district = DISTRICTS.find((x) => x.id === u.d)?.slug ?? DISTRICTS[0].slug;
  jar.set(UI_COOKIE, JSON.stringify({ u: u._id, r: u.role, d: district }), { ...cookieOpts(), httpOnly: false });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(UI_COOKIE);
}
