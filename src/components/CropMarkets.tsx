'use client';
// "Where to sell": every mandi for one crop across all districts, highest price first.
// District chips filter in the browser (the page itself is static). The farmer's home district
// (from the UI cookie) is highlighted and offered as a quick filter.
import { useEffect, useMemo, useRef, useState } from 'react';
import { DISTRICTS, MARKETS, STATES } from '@/lib/master';
import { fill, nameIn, type Strings } from '@/lib/strings';
import { weekChangeOf, type MarketRow, type Series } from '@/lib/prices-core';
import { inr } from '@/lib/format';
import { shortDate } from '@/lib/dates';
import type { Lang } from '@/lib/session';
import { DayLabel } from './DayLabel';
import { useSessionState } from '@/lib/session-state';
import { HistoryChart } from './HistoryChart';
import { readUiCookie } from './Header';

const TOP = 10;
const DIST = new Map(DISTRICTS.map((d) => [d.id, d]));
const STATE = new Map(STATES.map((s) => [s.id, s]));
const MKT = new Map(MARKETS.map((m) => [m.id, m]));
const marketName = (id: number, lang: Lang) => { const m = MKT.get(id); return m ? nameIn(m, lang) : String(id); };

export function CropMarkets({ crop, rows, msp, lang, t }: {
  crop: string; rows: MarketRow[]; msp: number | null; lang: Lang; t: Strings;
}) {
  const [home, setHome] = useState<number | null>(null);
  // Chart data is fetched separately, only when the chart scrolls near the screen (keeps the page
  // small on slow networks; most visits never scroll that far).
  const [hist, setHist] = useState<{ series: Series[]; monthly: Series[] } | null>(null);
  const histRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const el = histRef.current;
    if (!el) return;
    let dead = false;
    const named = (xs: Series[]) => xs.map((x) => ({ ...x, name: marketName(x.id, lang) }));
    const load = () => fetch(`/${crop}/history`).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!dead && d) setHist({ series: named(d.series), monthly: named(d.monthly) }); }).catch(() => {});
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '400px' });
    io.observe(el);
    return () => { dead = true; io.disconnect(); };
  }, [crop, lang]);
  // Remembered for the session and shared with the analysis page ('all' or a district id).
  const [district, setDistrict] = useSessionState<string>('district', 'all');
  const [expanded, setExpanded] = useSessionState<boolean>('showAll', false);
  useEffect(() => { setHome(DISTRICTS.find((d) => d.slug === readUiCookie().d)?.id ?? null); }, []);

  // District chips: all, the farmer's district, then others by number of mandis reporting.
  const counts = useMemo(() => {
    const c = new Map<number, number>();
    for (const r of rows) if (!r.stale) c.set(r.d, (c.get(r.d) ?? 0) + 1);
    return c;
  }, [rows]);
  const chips = [...counts.keys()].sort((a, b) => Number(b === home) - Number(a === home) || counts.get(b)! - counts.get(a)!);

  // A remembered district this crop isn't traded in shows "All" here, but stays remembered.
  const filter: 'all' | number = district !== 'all' && counts.has(Number(district)) ? Number(district) : 'all';
  const shown = filter === 'all' ? rows : rows.filter((r) => r.d === filter);
  const fresh = shown.filter((r) => !r.stale);
  const stale = shown.filter((r) => r.stale);
  const week = weekChangeOf(fresh);
  const dayT = { today: t.today, yesterday: t.yesterday, daysAgo: t.daysAgo };
  const homeState = home ? DIST.get(home)?.state : null;

  // Fresh rows grouped by report day (newest first), high -> low inside; capped at TOP until expanded.
  const dates = [...new Set(fresh.map((r) => r.date))].sort().reverse();
  let budget = expanded ? Infinity : TOP;
  const groups = dates.map((date) => {
    const list = fresh.filter((r) => r.date === date).sort((a, b) => b.price - a.price);
    const take = list.slice(0, Math.max(0, budget));
    budget -= take.length;
    return { date, list: take };
  }).filter((g) => g.list.length);

  const districtLabel = (d: number) => {
    const dist = DIST.get(d);
    if (!dist) return '';
    const st = dist.state !== homeState && STATE.get(dist.state) ? `, ${lang === 'hi' ? STATE.get(dist.state)!.short : STATE.get(dist.state)!.en}` : '';
    return `${nameIn(dist, lang)}${st}`;
  };

  const row = (r: MarketRow, showDate = false) => (
    <li key={r.id} className={`mrow${r.d === home ? ' home' : ''}`}>
      <div className="mrow-l">
        <div className="mname">{r.name}</div>
        <div className="msub">
          {r.d === home ? <b className="home-tag">{t.yourDistrict}</b> : districtLabel(r.d)}
          {showDate ? ` · ${shortDate(r.date, lang)}` : r.arrivals > 0 ? ` · ${t.arrivals} ${r.arrivals >= 1 ? inr(r.arrivals) : '<1'} ${t.tonnes}` : ''}
        </div>
      </div>
      <div className="mrow-r">
        <div className="mprice">₹{inr(r.price)}</div>
        <div className={`msub ${r.change ? (r.change > 0 ? 'up' : 'down') : ''}`}>
          {r.change === null ? t.firstPrice : r.change === 0 ? t.same
            : <><span aria-hidden="true">{r.change > 0 ? '▲' : '▼'}</span> ₹{inr(Math.abs(r.change))} {r.change > 0 ? t.up : t.down}</>}
        </div>
      </div>
    </li>
  );

  const chartIds = new Set(shown.map((r) => r.id));
  return (
    <>
      {chips.length > 1 && (
        <div className="chips dist-chips" role="group" aria-label={t.district}>
          <button type="button" className="chip" aria-pressed={filter === 'all'} onClick={() => setDistrict('all')}>
            {t.allDistricts} ({[...counts.values()].reduce((a, b) => a + b, 0)})
          </button>
          {chips.map((d) => (
            <button key={d} type="button" className="chip" aria-pressed={filter === d} onClick={() => setDistrict(String(d))}>
              {d === home ? t.myDistrict : nameIn(DIST.get(d)!, lang)} ({counts.get(d)})
            </button>
          ))}
        </div>
      )}

      {week !== null && fresh.length > 0 && (
        <p className={`trend ${week > 0 ? 'up' : week < 0 ? 'down' : ''}`}>
          <span aria-hidden="true">{week > 0 ? '▲' : week < 0 ? '▼' : '●'}</span>{' '}
          {Math.abs(week) < 10 ? t.weekSame : fill(week > 0 ? t.weekUp : t.weekDown, { n: inr(Math.abs(week)) })}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="card">{t.noData}<br /><span className="muted">{t.noDataHint}</span></p>
      ) : (
        <>
          {groups.map((g, i) => (
            <section key={g.date} className="day">
              <h2 className="day-head">
                <span><DayLabel date={g.date} lang={lang} t={dayT} /></span>
                {i === 0 && <span className="muted small">{t.highestFirst}</span>}
              </h2>
              <ul className="mlist">{g.list.map((r) => row(r))}</ul>
            </section>
          ))}
          {fresh.length > TOP && (
            <button type="button" className="big secondary showall" onClick={() => setExpanded((x) => !x)}>
              {expanded ? t.showLess : fill(t.showAllN, { n: fresh.length })}
            </button>
          )}
          {(expanded || fresh.length <= TOP) && stale.length > 0 && (
            <section className="day stale">
              <h2 className="day-head"><span>{t.olderPrices}</span></h2>
              <ul className="mlist">{stale.map((r) => row(r, true))}</ul>
            </section>
          )}
        </>
      )}

      <h2 ref={histRef}>{t.history}</h2>
      {!hist ? <p className="card muted">{t.loading}</p> : <HistoryChart
        key={String(filter)}
        storeKey={`${crop}.${filter}`}
        daily={hist.series.filter((s) => chartIds.has(s.id))}
        monthly={hist.monthly.filter((s) => filter === 'all' || s.d === filter)}
        msp={msp} lang={lang}
        defaultIds={[...fresh].sort((a, b) => b.price - a.price).slice(0, 3).map((r) => r.id)}
        t={{ historyHint: t.historyHint, mspLine: t.mspLine, historyEmpty: t.historyEmpty, monthlyAvg: t.monthlyAvg, rangeNames: t.rangeNames }}
      />}
    </>
  );
}
