// Stateless signed session cookie. Used by proxy.ts (every request) and server code.
// Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256). No DB lookup to verify.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'fb_s';
/** Non-httpOnly mirror with display info only (never trusted for authorization). */
export const UI_COOKIE = 'fb_ui';
export const SESSION_DAYS = 30;

export type Lang = 'en' | 'hi';
export const LANGS: Lang[] = ['en', 'hi'];
export type Session = { u: string; r: 'admin' | 'user'; l: Lang; d: number; exp: number };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_SECRET must be set (32+ chars)');
  return s;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sig = (data: string) => createHmac('sha256', secret()).update(data).digest('base64url');

export function signSession(s: Omit<Session, 'exp'>, days = SESSION_DAYS): { value: string; session: Session } {
  const session: Session = { ...s, exp: Math.floor(Date.now() / 1000) + days * 86400 };
  const data = b64(JSON.stringify(session));
  return { value: `${data}.${sig(data)}`, session };
}

export function verifySession(value: string | undefined): Session | null {
  if (!value) return null;
  const [data, mac] = value.split('.');
  if (!data || !mac) return null;
  const a = Buffer.from(mac);
  const b = Buffer.from(sig(data));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(data, 'base64url').toString()) as Session;
    if (typeof s.exp !== 'number' || s.exp < Date.now() / 1000) return null;
    if (!LANGS.includes(s.l) || (s.r !== 'admin' && s.r !== 'user') || typeof s.u !== 'string') return null;
    return s;
  } catch {
    return null;
  }
}

export const cookieOpts = (maxAgeDays = SESSION_DAYS) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: maxAgeDays * 86400,
});
