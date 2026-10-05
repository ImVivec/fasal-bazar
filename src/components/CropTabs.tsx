'use client';
// Tab row at the top of crop/analysis pages: "All crops" first, then the farmer's own crops.
// The current crop is always shown (highlighted), even if it isn't a favourite.
// `suffix` keeps the farmer on the same kind of page ("" = prices, "/analysis" = analysis).
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CROPS } from '@/lib/master';
import { favouriteCrops } from '@/lib/settings';
import { nameIn } from '@/lib/strings';
import { CropIcon } from './CropIcon';
import type { Lang } from '@/lib/session';

const GridIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

export function CropTabs({ current, suffix = '', lang, allLabel }: { current: string; suffix?: string; lang: Lang; allLabel: string }) {
  const [favs, setFavs] = useState<string[]>([]);
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => setFavs(favouriteCrops()), []);

  const slugs = favs.includes(current) ? favs : [current, ...favs];
  const crops = slugs.map((s) => CROPS.find((c) => c.slug === s)).filter((c): c is (typeof CROPS)[number] => !!c);

  // Keep the current crop's tab visible (only the crop tabs scroll; "All crops" stays put).
  useEffect(() => {
    const r = row.current;
    const el = r?.querySelector<HTMLElement>('[aria-current="page"]');
    if (r && el && (el.offsetLeft < r.scrollLeft || el.offsetLeft + el.offsetWidth > r.scrollLeft + r.clientWidth)) {
      r.scrollLeft = el.offsetLeft - 8;
    }
  }, [current, favs]);

  return (
    <nav className="crop-tabs" aria-label={allLabel}>
      <Link href="/" className="ctab ctab-all"><GridIcon /><span>{allLabel}</span></Link>
      <div className="crop-tabs-row" ref={row}>
        {crops.map((c) => (
          <Link key={c.slug} href={`/${c.slug}${suffix}`} className="ctab" aria-current={c.slug === current ? 'page' : undefined}>
            <CropIcon slug={c.slug} icon={c.icon} size={28} className="ctab-photo" />
            <span>{nameIn(c, lang)}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
