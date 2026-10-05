import Link from 'next/link';
import { dict } from '@/lib/strings';
import { LangToggle } from '@/components/LangToggle';
import { SignupForm } from './SignupForm';
import { guestLang } from '../guest-lang';

export default async function SignupPage() {
  const lang = await guestLang();
  const t = dict(lang);
  return (
    <>
      <LangToggle lang={lang} />
      <h1>{t.signup}</h1>
      <SignupForm t={t} lang={lang} />
      <p style={{ marginTop: 24 }}>{t.haveAccount} <Link href="/login"><b>{t.login}</b></Link></p>
    </>
  );
}
