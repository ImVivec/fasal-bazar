// Pure user validation (no I/O), shared by server actions and tests.
// Accounts are keyed by mobile number; farmers log in with mobile + a 4-digit PIN (number keypad only).
import { DISTRICTS } from './master';
import type { Lang } from './session';

export type UserStatus = 'pending' | 'approved' | 'rejected' | 'blocked';
export type Role = 'admin' | 'user';

export type SignupInput = { name: string; phone: string; pin: string; pin2: string; district: string; lang: string };
export type SignupError = 'name' | 'phone' | 'pin' | 'pin2' | 'district' | 'lang';

export const PIN_RE = /^\d{4}$/;
/** Admin accounts use a longer PIN (6–8 digits); farmers use exactly 4. */
export const ADMIN_PIN_RE = /^\d{6,8}$/;

/** Accepts "98765 43210", "+91 98765-43210", "098765..." -> "9876543210" (Indian mobile) or null. */
export function normPhone(s: string): string | null {
  const d = s.replace(/[\s\-()]/g, '').replace(/^(\+?91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** Collapse spaces; 2–40 characters of any script (Hindi names welcome). */
export const normName = (s: string) => s.replace(/\s+/g, ' ').trim();

export function validateSignup(i: SignupInput):
  | { ok: true; value: { name: string; phone: string; pin: string; districtId: number; lang: Lang } }
  | { ok: false; errors: SignupError[] } {
  const errors: SignupError[] = [];
  const name = normName(i.name);
  if (name.length < 2 || name.length > 40) errors.push('name');
  const phone = normPhone(i.phone);
  if (!phone) errors.push('phone');
  if (!PIN_RE.test(i.pin)) errors.push('pin');
  else if (i.pin !== i.pin2) errors.push('pin2');
  const district = DISTRICTS.find((d) => d.slug === i.district);
  if (!district) errors.push('district');
  if (i.lang !== 'en' && i.lang !== 'hi') errors.push('lang');
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { name, phone: phone!, pin: i.pin, districtId: district!.id, lang: i.lang as Lang } };
}

/** A 4-digit PIN has 10,000 combinations, so lock early: 5 wrong tries -> 30 minutes. */
export const MAX_FAILS = 5;
export const LOCK_MINUTES = 30;
