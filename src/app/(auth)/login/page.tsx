import Link from 'next/link';
import { dict } from '@/lib/strings';
import { LangToggle } from '@/components/LangToggle';
import { LoginForm } from './LoginForm';
import { guestLang } from '../guest-lang';

export default async function LoginPage() {
  const lang = await guestLang();
  const t = dict(lang);
  return (
    <>
      <LangToggle lang={lang} />
      <h1>{t.login}</h1>
      <p className="muted">{t.tagline}</p>
      <LoginForm t={t} />
      <p style={{ marginTop: 24 }}>{t.noAccount} <Link href="/signup"><b>{t.signup}</b></Link></p>
    </>
  );
}
