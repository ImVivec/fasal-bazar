'use client';
// Crop picker: search + "my crops" + crops grouped by category.
// mode "browse": tiles link to the crop page. mode "select": tiles toggle favourites (Settings).
// Crops with no report in the last 60 days are hidden unless they're a favourite or searched for.
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CROPS, GROUPS, type Crop } from '@/lib/master';
import { favouriteCrops } from '@/lib/settings';
import { fill, nameIn } from '@/lib/strings';
import { shortDate } from '@/lib/dates';
import { CropIcon } from './CropIcon';
import type { Lang } from '@/lib/session';

type Active = Record<string, { date: string; mandis: number; lo: number; hi: number }>;
type T = { searchCrop: string; myCrops: string; noCropFound: string; noRecent: string; mandisN: string; groupNames: string; upTo: string };

// Common spellings farmers type (Hinglish / local names), by crop slug.
const ALIASES: Record<string, string> = {
  wheat: 'gehu gehun gahu kanak', maize: 'makka makki corn bhutta', barley: 'jau jo', paddy: 'dhan rice chawal', jowar: 'jwar sorghum',
  chana: 'gram channa chickpea', 'kabuli-chana': 'kabuli dollar chana', masoor: 'masur lentil', urad: 'udad urd', moong: 'mung mug',
  tur: 'arhar toor tuar', soyabean: 'soya soybean soyabin', mustard: 'sarso sarson rai', linseed: 'alsi', til: 'sesame tilli',
  groundnut: 'mungfali moongphali peanut', garlic: 'lahsun lehsun lasun', 'coriander-seed': 'dhaniya dhania', 'methi-seed': 'methi fenugreek',
  'dry-chilli': 'mirch mirchi lal', ajwain: 'ajwan carom', 'dry-ginger': 'sonth saunth adrak', isabgol: 'isabgul psyllium',
  ashwagandha: 'asgandh asgand', kalonji: 'nigella', 'poppy-seed': 'khaskhas khus posta', onion: 'pyaj pyaz kanda', potato: 'aloo alu',
  tomato: 'tamatar', 'coriander-leaves': 'hara dhaniya kothmir', 'methi-leaves': 'methi bhaji', cauliflower: 'gobhi phool',
  cabbage: 'patta gobhi band', bhindi: 'okra lady finger', 'green-chilli': 'hari mirch', brinjal: 'baingan bengan', 'bottle-gourd': 'lauki dudhi',
  'bitter-gourd': 'karela', 'green-peas': 'matar mutter', orange: 'santra santara',
};

const norm = (s: string) => s.toLowerCase().normalize('NFC').replace(/[\s()-]+/g, ' ').trim();

export function CropPicker({ mode, lang, t, active, selected, onToggle }: {
  mode: 'browse' | 'select';
  lang: Lang;
  t: T;
  active: Active;
  selected?: string[];
  onToggle?: (slug: string) => void;
}) {
  const [q, setQ] = useState('');
  const [favs, setFavs] = useState<string[]>(selected ?? []);
  useEffect(() => { if (mode === 'browse') setFavs(favouriteCrops()); }, [mode]);
  useEffect(() => { if (selected) setFavs(selected); }, [selected]);

  const groupNames = t.groupNames.split('|');
  const query = norm(q);
  const matches = (c: Crop) => !query || [c.en, c.hi, c.slug, ALIASES[c.slug] ?? ''].some((x) => norm(x).includes(query));
  const isActive = (c: Crop) => !!active[c.id];

  const myCrops = useMemo(() => favs.map((s) => CROPS.find((c) => c.slug === s)).filter((c): c is Crop => !!c), [favs]);
  const visible = CROPS.filter((c) => matches(c) && (query || mode === 'select' || isActive(c)))
    .sort((a, b) => (active[b.id]?.mandis ?? 0) - (active[a.id]?.mandis ?? 0));

  const tile = (c: Crop, big = false) => {
    const a = active[c.id];
    const fav = favs.includes(c.slug);
    const body = (
      <>
        <CropIcon slug={c.slug} icon={c.icon} size={big ? 48 : 40} />
        <span className="crop-name">{nameIn(c, lang)}</span>
        {big && a ? <span className="crop-meta">{fill(t.upTo, { n: a.hi.toLocaleString('en-IN') })}</span>
          : a ? <span className="crop-meta">{fill(t.mandisN, { n: a.mandis })}</span>
          : <span className="crop-meta muted">{t.noRecent}</span>}
        {big && a && <span className="crop-meta">{shortDate(a.date, lang)}</span>}
        {mode === 'select' && fav && <span className="crop-fav" aria-hidden="true">★</span>}
      </>
    );
    const cls = `crop${big ? ' big' : ''}${a ? '' : ' inactive'}`;
    return mode === 'browse'
      ? <Link key={c.slug} href={`/${c.slug}`} className={cls}>{body}</Link>
      : <button key={c.slug} type="button" className={cls} aria-pressed={fav} onClick={() => onToggle?.(c.slug)}>{body}</button>;
  };

  return (
    <div className="picker">
      <label className="search">
        <span className="sr-only">{t.searchCrop}</span>
        <span aria-hidden="true">🔍</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchCrop} autoComplete="off" />
      </label>

      {mode === 'browse' && !query && myCrops.length > 0 && (
        <section>
          <h2 className="group-head">{t.myCrops}</h2>
          <div className="crops">{myCrops.map((c) => tile(c, true))}</div>
        </section>
      )}

      {GROUPS.map((g, i) => {
        const list = visible.filter((c) => c.group === g && !(mode === 'browse' && !query && favs.includes(c.slug)));
        if (!list.length) return null;
        return (
          <section key={g}>
            <h2 className="group-head">{groupNames[i]}</h2>
            <div className="crops">{list.map((c) => tile(c))}</div>
          </section>
        );
      })}
      {visible.length === 0 && <p className="card muted">{t.noCropFound}</p>}
    </div>
  );
}
