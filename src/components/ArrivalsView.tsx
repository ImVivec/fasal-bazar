'use client';
// Arrivals tab on the Analysis page: weekly arrivals (bars) with the price (line), and which mandis
// get the most of this crop. Data is fetched from /<crop>/arrivals only when the tab is opened.
import { useEffect, useMemo, useRef, useState } from 'react';
import type uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { DISTRICTS, MARKETS } from '@/lib/master';
import { fill, nameIn, type Strings } from '@/lib/strings';
import { inr, rupees } from '@/lib/format';
import { fromDay, shortDate } from '@/lib/dates';
import { totalByWeek, type ArrivalsData } from '@/lib/arrivals-core';
import { useSessionState } from '@/lib/session-state';
import type { Lang } from '@/lib/session';

const MKT = new Map(MARKETS.map((m) => [m.id, m]));
const DIST = new Map(DISTRICTS.map((d) => [d.id, d]));
const RANGES = [13, 53] as const; // weeks: about 3 months, about a year
const PRICE_COLOR = '#e8743b';
const tonnes = (n: number) => (n >= 1000 ? `${+(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n)));

export function ArrivalsView({ crop, district, lang, t }: { crop: string; district: string; lang: Lang; t: Strings }) {
  const [data, setData] = useState<ArrivalsData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let dead = false;
    fetch(`/${crop}/arrivals`).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => { if (!dead) setData(d); }).catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; };
  }, [crop]);

  if (failed) return <p className="card muted">{t.noData}</p>;
  if (!data) return <p className="card muted">{t.loading}</p>;
  return (
    <>
      <Trend data={data} district={district} lang={lang} t={t} />
      <Share data={data} district={district} lang={lang} t={t} />
    </>
  );
}

const inDistrict = (district: string) => (d: number) => district === 'all' || String(d) === district;

function Trend({ data, district, lang, t }: { data: ArrivalsData; district: string; lang: Lang; t: Strings }) {
  const [range, setRange] = useSessionState<number>('arrRange', 13);
  const all = useMemo(() => { const keep = inDistrict(district); return totalByWeek(data, (m) => keep(m.d)); }, [data, district]);
  const n = Math.min(range, data.weeks.length);
  const weeks = data.weeks.slice(-n);
  const tt = all.t.slice(-n);
  const pp = all.p.slice(-n);
  const has = tt.some((v) => v > 0);
  const peak = has ? tt.indexOf(Math.max(...tt)) : -1;
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || !has) return;
    let plot: uPlot | undefined;
    let ro: ResizeObserver | undefined;
    let dead = false;
    import('uplot').then(({ default: U }) => {
      if (dead) return;
      const css = getComputedStyle(document.documentElement);
      const accent = css.getPropertyValue('--accent').trim() || '#1d6b2b';
      const axis = { stroke: css.getPropertyValue('--muted'), grid: { stroke: css.getPropertyValue('--line'), width: 1 }, ticks: { show: false } };
      // x = middle of the week (Thursday), so bars sit inside their week.
      const data = [weeks.map((w) => (w + 3) * 86400), tt, pp] as uPlot.AlignedData;
      plot = new U({
        width: el.clientWidth,
        height: 240,
        legend: { show: false },
        cursor: { y: false },
        scales: { x: { time: true, range: (_u, min, max) => [min - 4 * 86400, max + 4 * 86400] }, t: { range: (_u, _min, max) => [0, max * 1.1 || 1] }, p: {} },
        axes: [
          { ...axis, incrs: [7, 14, 28, 56, 91, 182].map((d) => d * 86400),
            values: (_u, v) => v.map((s) => shortDate(fromDay(Math.round(s / 86400)), lang)) },
          { ...axis, scale: 't', size: 44, values: (_u, v) => v.map(tonnes) },
          { ...axis, scale: 'p', side: 1, size: 56, grid: { show: false }, stroke: PRICE_COLOR,
            values: (_u, v) => v.map((x) => `₹${inr(x)}`) },
        ],
        series: [
          {},
          { label: t.tabArrivals, scale: 't', fill: accent + '88', stroke: accent, width: 1,
            paths: U.paths.bars!({ size: [0.7, 28] }), points: { show: false } },
          { label: t.tabPrice, scale: 'p', stroke: PRICE_COLOR, width: 2, spanGaps: true, points: { show: n <= 13, size: 5 } },
        ],
      }, data, el);
      ro = new ResizeObserver(() => plot?.setSize({ width: el.clientWidth, height: 240 }));
      ro.observe(el);
    });
    return () => { dead = true; ro?.disconnect(); plot?.destroy(); };
  }, [all, n, lang, has]); // weeks/tt/pp derive from these

  const last = tt.length ? tt[tt.length - 1] : 0;
  return (
    <section className="acard">
      <h2>{t.arrTrendTitle}</h2>
      <div className="row">
        {RANGES.map((r, i) => (
          <button key={r} type="button" className="chip" aria-pressed={range === r} onClick={() => setRange(r)}>{t.rangeNames.split('|')[i]}</button>
        ))}
      </div>
      {!has ? <p className="muted">{t.arrNone}</p> : (
        <>
          <p className="muted small">{t.arrTrendHint}</p>
          <div ref={box} className="chart" role="img" aria-label={t.arrTrendTitle} />
          <p>{fill(t.arrLastWeek, { n: inr(Math.round(last)) })}</p>
          {peak >= 0 && peak !== tt.length - 1 && (
            <p>{fill(t.arrPeak, { w: shortDate(fromDay(weeks[peak]), lang), n: inr(Math.round(tt[peak])), p: pp[peak] ? rupees(pp[peak]!) : '–' })}</p>
          )}
        </>
      )}
    </section>
  );
}

function Share({ data, district, lang, t }: { data: ArrivalsData; district: string; lang: Lang; t: Strings }) {
  const keep = inDistrict(district);
  const [showAll, setAll] = useSessionState<boolean>('showAllArr', false);
  const rows = data.mandis
    .filter((m) => keep(m.d) && (data.recent.t[m.id] ?? 0) > 0)
    .map((m) => ({ id: m.id, d: m.d, t: data.recent.t[m.id] }))
    .sort((a, b) => b.t - a.t);
  const total = rows.reduce((s, r) => s + r.t, 0);
  const top = rows[0]?.t ?? 1;
  const list = showAll ? rows : rows.slice(0, 10);
  return (
    <section className="acard">
      <h2>{t.arrShareTitle}</h2>
      {!rows.length ? <p className="muted">{t.arrNone}</p> : (
        <>
          <p className="muted small">{shortDate(data.recent.from, lang)} – {shortDate(data.recent.to, lang)} · {t.arrShareHint}</p>
          <ul className="bars">
            {list.map((r) => {
              const m = MKT.get(r.id);
              const name = m ? nameIn(m, lang) : String(r.id);
              const dist = nameIn(DIST.get(r.d) ?? { en: '' }, lang);
              return (
                <li key={r.id}>
                  <div className="bar-label">
                    <span>{name} {dist !== name && <span className="muted small">{dist}</span>}</span>
                    <b>{inr(Math.round(r.t))} {t.tonnes}</b>
                  </div>
                  <div className="bar-track"><div className="bar" style={{ width: `${Math.max(3, (r.t / top) * 100)}%` }} /></div>
                  <div className="muted small">{Math.round((r.t / total) * 100)}%</div>
                </li>
              );
            })}
          </ul>
          {rows.length > 10 && (
            <button type="button" className="big secondary showall" onClick={() => setAll((x) => !x)}>
              {showAll ? t.showLess : fill(t.showAllN, { n: rows.length })}
            </button>
          )}
        </>
      )}
    </section>
  );
}
