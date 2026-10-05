'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import { signupAction, type FormState } from '@/lib/auth-actions';
import type { Strings } from '@/lib/strings';
import type { Lang } from '@/lib/session';
import { DistrictOptions } from '@/components/DistrictSelect';

const ERR: Record<string, keyof Strings> = {
  name: 'errName', phone: 'errPhone', pin: 'errPin', pin2: 'errPin2', district: 'errDistrict', taken: 'errTaken',
};

export function SignupForm({ t, lang }: { t: Strings; lang: Lang }) {
  const [state, action, busy] = useActionState<FormState, FormData>(signupAction, null);
  if (state?.done) {
    return <div className="notice ok" role="status">{t.signupDone}<br /><br /><Link href="/login"><b>{t.login}</b></Link></div>;
  }
  const v = state?.values ?? {};
  const lg = v.lang || lang;
  const err = (k: string) => (state?.errors?.includes(k) ? <p className="err">{t[ERR[k]]}</p> : null);
  return (
    <form action={action}>
      <label className="field">{t.yourName}
        <input name="name" autoComplete="name" required minLength={2} maxLength={40} defaultValue={v.name} />
        <span className="hint">{t.nameHint}</span>
        {err('name')}
      </label>
      <label className="field">{t.phone}
        <input name="phone" type="tel" inputMode="numeric" autoComplete="tel" required placeholder="98xxxxxxxx"
          maxLength={14} defaultValue={v.phone} />
        <span className="hint">{t.privacy}</span>
        {err('phone')}{err('taken')}
      </label>
      <label className="field">{t.pin}
        <input name="pin" type="password" inputMode="numeric" autoComplete="new-password" required
          pattern="\d{4}" minLength={4} maxLength={4} className="pin-input" autoFocus={!!state?.errors} />
        <span className="hint">{t.pinHint}</span>
        {err('pin')}
      </label>
      <label className="field">{t.pin2}
        <input name="pin2" type="password" inputMode="numeric" autoComplete="new-password" required
          pattern="\d{4}" minLength={4} maxLength={4} className="pin-input" />
        {err('pin2')}
      </label>
      <label className="field">{t.homeDistrict}
        <select name="district" defaultValue={v.district || 'shajapur'} key={v.district}>
          <DistrictOptions lang={lang} />
        </select>
        {err('district')}
      </label>
      <div className="field" role="radiogroup" aria-label={t.language}>{t.language}
        <div className="seg">
          <label><input type="radio" name="lang" value="hi" defaultChecked={lg === 'hi'} />हिंदी</label>
          <label><input type="radio" name="lang" value="en" defaultChecked={lg === 'en'} />English</label>
        </div>
      </div>
      <button type="submit" className="big" disabled={busy}>{busy ? '…' : t.signup}</button>
    </form>
  );
}
