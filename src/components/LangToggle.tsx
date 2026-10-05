'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { setGuestLang } from '@/lib/auth-actions';
import type { Lang } from '@/lib/session';

export function LangToggle({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const other: Lang = lang === 'hi' ? 'en' : 'hi';
  return (
    <div style={{ textAlign: 'right' }}>
      <button type="button" className="chip" disabled={busy}
        onClick={() => start(async () => { await setGuestLang(other); router.refresh(); })}>
        {other === 'en' ? 'English' : 'हिंदी'}
      </button>
    </div>
  );
}
