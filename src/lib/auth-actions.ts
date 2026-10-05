'use server';
// Server actions for login, signup, settings and admin user management.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { endSession, requireAdmin, requireSession, startSession } from './auth';
import { createUser, login, resetPin, setPrefs, setStatus } from './users';
import { PIN_RE, validateSignup, type UserStatus } from './users-core';
import { DISTRICTS } from './master';
import type { Lang } from './session';

export type FormState = { error?: string; errors?: string[]; done?: boolean; values?: Record<string, string> } | null;

const field = (f: FormData, k: string) => String(f.get(k) ?? '');

export async function loginAction(_: FormState, f: FormData): Promise<FormState> {
  const r = await login(field(f, 'phone'), field(f, 'pin'));
  if (!r.ok) return { error: r.reason, values: { phone: field(f, 'phone') } };
  await startSession(r.user);
  redirect('/');
}

export async function signupAction(_: FormState, f: FormData): Promise<FormState> {
  const v = validateSignup({
    name: field(f, 'name'), phone: field(f, 'phone'), pin: field(f, 'pin'), pin2: field(f, 'pin2'),
    district: field(f, 'district'), lang: field(f, 'lang'),
  });
  // Echo back what was typed (not the PIN) so a farmer doesn't have to re-enter everything.
  const values = { name: field(f, 'name'), phone: field(f, 'phone'), district: field(f, 'district'), lang: field(f, 'lang') };
  if (!v.ok) return { errors: v.errors, values };
  const r = await createUser(v.value);
  if (!r.ok) return { errors: ['taken'], values };
  return { done: true };
}

export async function logoutAction() {
  await endSession();
  redirect('/login');
}

/** Language choice on the login/signup screens (before there is a session). */
export async function setGuestLang(lang: Lang) {
  (await cookies()).set('fb_lang', lang === 'en' ? 'en' : 'hi', { path: '/', maxAge: 365 * 86400, sameSite: 'lax' });
}

export async function savePrefsAction(f: FormData) {
  const s = await requireSession();
  const d = DISTRICTS.find((x) => x.slug === field(f, 'district'))?.id ?? s.d;
  const l: Lang = field(f, 'lang') === 'en' ? 'en' : 'hi';
  await setPrefs(s.u, { d, l });
  await startSession({ _id: s.u, role: s.r, l, d });
  redirect('/');
}

export async function adminSetStatusAction(f: FormData) {
  const admin = await requireAdmin();
  const st = field(f, 'st') as UserStatus;
  if (!['approved', 'rejected', 'blocked', 'pending'].includes(st)) return;
  await setStatus(field(f, 'id'), st, admin.u);
  revalidatePath('/admin');
}

export async function adminResetPinAction(f: FormData) {
  await requireAdmin();
  const pin = field(f, 'pin');
  if (!PIN_RE.test(pin)) return;
  await resetPin(field(f, 'id'), pin);
  revalidatePath('/admin');
}
