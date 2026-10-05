import 'server-only';
import { cookies } from 'next/headers';
import type { Lang } from '@/lib/session';

/** Language on login/signup (no session yet): cookie, default Hindi. */
export async function guestLang(): Promise<Lang> {
  return (await cookies()).get('fb_lang')?.value === 'en' ? 'en' : 'hi';
}
