'use client';
import { useActionState } from 'react';
import { loginAction, type FormState } from '@/lib/auth-actions';
import type { Strings } from '@/lib/strings';

const MSG: Record<string, keyof Strings> = {
  invalid: 'errInvalid', pending: 'errPending', rejected: 'errRejected', blocked: 'errBlocked', locked: 'errLocked',
};

export function LoginForm({ t }: { t: Strings }) {
  const [state, action, busy] = useActionState<FormState, FormData>(loginAction, null);
  return (
    <form action={action}>
      {state?.error && <div className="notice err" role="alert">{t[MSG[state.error] ?? 'errInvalid']}</div>}
      <label className="field">{t.phone}
        <input name="phone" type="tel" inputMode="numeric" autoComplete="tel" required placeholder="98xxxxxxxx"
          defaultValue={state?.values?.phone} maxLength={14} />
      </label>
      <label className="field">{t.pin}
        <input name="pin" type="password" inputMode="numeric" autoComplete="current-password" required
          pattern="\d{4,8}" maxLength={8} className="pin-input" />
      </label>
      <button type="submit" className="big" disabled={busy}>{busy ? '…' : t.login}</button>
    </form>
  );
}
