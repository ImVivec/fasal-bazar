'use client';
// Arrivals tab on the Analysis page: weekly arrivals (bars) with the price (line), and which mandis
// get the most of this crop. Data is fetched from /<crop>/arrivals only when the tab is opened.
import { useEffect, useMemo, useRef, useState } from 'react';
import type uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { DISTRICTS, MARKETS } from '@/lib/master';
import { fill, nameIn, type Strings } from '@/lib/strings';
import { inr, rupees } from '@/lib/format';
import { fromDay, shortDate, shortMonth } from '@/lib/dates';
import { totalByWeek, totalSeries, type ArrivalsData, type MonthlyArrivals } from '@/lib/arrivals-core';
import { useSessionState } from '@/lib/session-state';
import type { Lang } from '@/lib/session';

const MKT = new Map(MARKETS.map((m) => [m.id, m]));
const DIST = new Map(DISTRICTS.map((d) => [d.id, d]));
// > 0: weeks back (about 3 months, about a year); <= 0: month by month, -60 = last 5 years, 0 = all years.
const RANGES = [13, 53, -60, 0] as const;
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
      <Trend crop={crop} data={data} district={district} lang={lang} t={t} />
      <Share data={data} district={district} lang={lang} t={t} />
    </>
  );
}

const inDistrict = (district: string) => (d: number) => district === 'all' || String(d) === district;

function Trend({ crop, data, district, lang, t }: { crop: string; data: ArrivalsData; district: string; lang: Lang; t: Strings }) {
  const [range, setRange] = useSessionState<number>('arrRange', 13);
  const all = useMemo(() => { const keep = inDistrict(district); return totalByWeek(data, (m) => keep(m.d)); }, [data, district]);
  // 5 years / all years: month by month from the monthly summaries, fetched the first time such a range is
  // picked (starts at the first month with data; shows the 1-year view until it arrives).
  const [mo, setMo] = useState<MonthlyArrivals | null>(null);
  useEffect(() => {
    if (range > 0 || mo) return;
    fetch(`/${crop}/arrivals-all`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then(setMo, () => {});
  }, [range, mo, crop]);
  const monthlyAll = useMemo(() => {
    if (!mo?.months.length) return null;
    const keep = inDistrict(district);
    const s = totalSeries(mo.months.length, mo.mandis, (m) => keep(m.d));
    const withData = s.t.findIndex((v, i) => v > 0 || s.p[i] !== null);
    if (withData < 0) return null;
    const first = range < 0 ? Math.max(withData, mo.months.length + range) : withData;
    return { keys: mo.months.slice(first), t: s.t.slice(first), p: s.p.slice(first) };
  }, [mo, district, range]);
  const monthly = range <= 0 && !!monthlyAll;
  const n = monthly ? monthlyAll!.keys.length : Math.min(range || 53, data.weeks.length);
  const weeks = monthly ? monthlyAll!.keys : data.weeks.slice(-n);
  const tt = monthly ? monthlyAll!.t : all.t.slice(-n);
  const pp = monthly ? monthlyAll!.p : all.p.slice(-n);
  const half = monthly ? 15 : 3; // x = middle of the week (Thu) or month
  const lastWeekT = all.t.length ? all.t[all.t.length - 1] : 0;
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
      // x = middle of the week (Thursday) or month, so bars sit inside their period.
      const data = [weeks.map((w) => (w + half) * 86400), tt, pp] as uPlot.AlignedData;
      plot = new U({
        width: el.clientWidth,
        height: 240,
        legend: { show: false },
        cursor: { y: false },
        scales: { x: { time: true, range: (_u, min, max) => [min - (half + 1) * 86400, max + (half + 1) * 86400] }, t: { range: (_u, _min, max) => [0, max * 1.1 || 1] }, p: {} },
        axes: [
          { ...axis, incrs: [7, 14, 28, 56, 91, 182, 365, 730, 1825, 3650].map((d) => d * 86400),
            values: (_u, v, _ax, _sp, incr) => v.map((s) => {
              const iso = fromDay(Math.round(s / 86400));
              return incr >= 365 * 86400 ? iso.slice(0, 4) : monthly ? shortMonth(iso, lang) : shortDate(iso, lang);
            }) },
          { ...axis, scale: 't', size: 44, values: (_u, v) => v.map(tonnes) },
          { ...axis, scale: 'p', side: 1, size: 56, grid: { show: false }, stroke: PRICE_COLOR,
            values: (_u, v) => v.map((x) => `₹${inr(x)}`) },
        ],
        series: [
          {},
          { label: t.tabArrivals, scale: 't', fill: accent + '88', stroke: accent, width: 1,
            paths: U.paths.bars!({ size: [0.7, monthly ? 12 : 28] }), points: { show: false } },
          { label: t.tabPrice, scale: 'p', stroke: PRICE_COLOR, width: 2, spanGaps: true, points: { show: n <= 13, size: 5 } },
        ],
      }, data, el);
      ro = new ResizeObserver(() => plot?.setSize({ width: el.clientWidth, height: 240 }));
      ro.observe(el);
    });
    return () => { dead = true; ro?.disconnect(); plot?.destroy(); };
  }, [all, monthlyAll, monthly, n, lang, has]); // weeks/tt/pp derive from these

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
          {monthly && <p className="muted small">{t.arrMonthly}</p>}
          <p>{fill(t.arrLastWeek, { n: inr(Math.round(lastWeekT)) })}</p>
          {peak >= 0 && peak !== tt.length - 1 && (
            <p>{fill(monthly ? t.arrPeakMonth : t.arrPeak, {
              w: monthly ? shortMonth(fromDay(weeks[peak]), lang) : shortDate(fromDay(weeks[peak]), lang),
              n: inr(Math.round(tt[peak])), p: pp[peak] ? rupees(pp[peak]!) : '–',
            })}</p>
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
