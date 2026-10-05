import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { dict } from '@/lib/strings';
import { DISTRICTS } from '@/lib/master';
import type { Lang } from '@/lib/session';
import { SettingsForm } from './SettingsForm';
import { getActive } from '@/lib/prices';
import { getUser } from '@/lib/users';
import { logoutAction } from '@/lib/auth-actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const s = await requireSession();
  const t = dict(lang);
  const [{ active }, user] = await Promise.all([getActive(), getUser(s.u)]);
  return (
    <>
      <h1>{t.settings}</h1>
      <p className="muted">{user?.n ? <><b>{user.n}</b> · </> : null}{t.mobileLabel}: <b>{s.u}</b></p>
      <SettingsForm t={t} lang={s.l} active={active} district={DISTRICTS.find((d) => d.id === s.d)?.slug ?? 'shajapur'} />
      <p style={{ marginTop: 20 }}><Link href="/credits" className="muted">{t.photoCredits}</Link></p>
      <form action={logoutAction} style={{ marginTop: 16 }}>
        <button type="submit" className="big secondary">{t.logout}</button>
      </form>
    </>
  );
}
