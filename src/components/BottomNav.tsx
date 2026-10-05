'use client';
// Bottom tab bar (thumb reach). Crops and Analysis follow the crop being worked on this session:
// Crops -> that crop's prices, Analysis -> its analysis (crop list / home until a crop is picked;
// "All crops" at the top of crop pages opens the full list). Admin tab only for admins (server enforces access).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CROPS } from '@/lib/master';
import { readUiCookie } from './Header';
import { useSessionState } from '@/lib/session-state';

type T = { crops: string; analysis: string; settings: string; admin: string };

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const ICONS = {
  crops: 'M12 22V12M12 12C12 7 8 4 3 4c0 5 4 8 9 8zM12 12c0-4 3-7 8-7 0 4-3 7-8 7z', // sprout
  analysis: 'M4 20V10M10 20V4M16 20v-7M22 20H2', // bar chart
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  admin: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', // shield
};

/** "/soyabean[/analysis]" -> { c, analysis } when it's a crop page. */
function parse(path: string) {
  const [, c, extra] = path.split('/');
  if (!CROPS.some((x) => x.slug === c)) return null;
  if (extra && extra !== 'analysis') return null;
  return { c, analysis: extra === 'analysis' };
}

export function BottomNav({ t }: { t: T }) {
  // The proxy serves /x from /<lang>/x, so the router may report the internal path: strip the prefix.
  const path = (usePathname() || '/').replace(/^\/(en|hi)(?=\/|$)/, '') || '/';
  const [admin, setAdmin] = useState(false);
  const [last, setLast] = useSessionState<string | null>('lastCrop', null); // crop picked this session
  const here = parse(path);

  useEffect(() => { setAdmin(readUiCookie().r === 'admin'); }, []);
  useEffect(() => { if (here && here.c !== last) setLast(here.c); }, [here?.c]); // eslint-disable-line react-hooks/exhaustive-deps

  const crop = here?.c ?? (last && CROPS.some((x) => x.slug === last) ? last : null);
  const cropsHref = crop ? `/${crop}` : '/';
  const analysisHref = crop ? `/${crop}/analysis` : '/';

  const tabs: { key: keyof typeof ICONS; href: string; label: string; active: boolean }[] = [
    { key: 'crops', href: cropsHref, label: t.crops, active: path === '/' || (!!here && !here.analysis) },
    { key: 'analysis', href: analysisHref, label: t.analysis, active: !!here?.analysis },
    { key: 'settings', href: '/settings', label: t.settings, active: path.startsWith('/settings') },
    ...(admin ? [{ key: 'admin' as const, href: '/admin', label: t.admin, active: path.startsWith('/admin') }] : []),
  ];

  return (
    <nav className="bottomnav" aria-label="Menu">
      {tabs.map((x) => (
        <Link key={x.key} href={x.href} className="tab" aria-current={x.active ? 'page' : undefined}>
          <Icon d={ICONS[x.key]} />
          <span>{x.label}</span>
        </Link>
      ))}
    </nav>
  );
}
