'use client';
// Price history for selected mandis. uPlot (~45 KB) is loaded lazily after first paint.
import { useEffect, useMemo, useRef } from 'react';
import { useSessionState } from '@/lib/session-state';
import type uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { CropView } from '@/lib/prices-core';
import { fromDay, shortDate, shortMonth } from '@/lib/dates';
import type { Lang } from '@/lib/session';

const COLORS = ['#2a78d6', '#e8743b', '#1f9e74', '#c2439b', '#8f6bd6', '#b59a12', '#d64545', '#3aa3b5'];

const RANGES = { '3M': 92, '1Y': 366, All: 0 } as const;
type Range = keyof typeof RANGES;

type T = { historyHint: string; mspLine: string; historyEmpty: string; monthlyAvg: string; rangeNames: string };

export function HistoryChart({ daily, monthly, msp, defaultIds, lang, t, storeKey }: {
  daily: CropView['series']; monthly: CropView['monthly']; msp: number | null; defaultIds: number[]; lang: Lang; t: T;
  /** Session key for the picked mandis (e.g. "soyabean.all"); range is remembered for all charts. */
  storeKey: string;
}) {
  const [range, setRange] = useSessionState<Range>('chartRange', '3M');
  // "All" uses monthly averages (light payload); 3M/1Y use daily points.
  const series = useMemo(() => {
    if (range === 'All') return monthly;
    const lastDay = Math.max(0, ...daily.flatMap((s) => s.points.map((p) => p[0])));
    return daily.map((s) => ({ ...s, points: s.points.filter((p) => p[0] > lastDay - RANGES[range]) }));
  }, [range, daily, monthly]);
  const names = monthly.length ? monthly : daily; // stable chip list + colours across ranges
  const defaults = (() => {
    const ids = defaultIds.filter((id) => names.some((s) => s.id === id));
    return ids.length ? ids : names.slice(0, 3).map((s) => s.id);
  })();
  const [picked, setSel] = useSessionState<number[] | null>(`chartSel.${storeKey}`, null);
  // Remembered picks that still exist here; otherwise the default top mandis.
  const kept = (picked ?? []).filter((id) => names.some((s) => s.id === id));
  const sel = picked === null || (!kept.length && picked.length) ? defaults : kept;
  const box = useRef<HTMLDivElement>(null);
  const colorOf = (id: number) => COLORS[Math.max(0, names.findIndex((s) => s.id === id)) % COLORS.length];
  const days = new Set(series.flatMap((s) => s.points.map((p) => p[0])));

  useEffect(() => {
    const el = box.current;
    const chosen = series.filter((s) => sel.includes(s.id));
    if (!el || !chosen.length || days.size < 2) return;
    let plot: uPlot | undefined;
    let ro: ResizeObserver | undefined;
    let dead = false;
    import('uplot').then(({ default: U }) => {
      if (dead) return;
      const xs = [...new Set(chosen.flatMap((s) => s.points.map((p) => p[0])))].sort((a, b) => a - b);
      const ys = chosen.map((s) => {
        const m = new Map(s.points);
        return xs.map((x) => m.get(x) ?? null);
      });
      const data = [xs.map((d) => d * 86400), ...ys] as uPlot.AlignedData;
      const css = getComputedStyle(document.documentElement);
      const axis = { stroke: css.getPropertyValue('--muted'), grid: { stroke: css.getPropertyValue('--line'), width: 1 }, ticks: { show: false } };
      plot = new U({
        width: el.clientWidth,
        height: 240,
        legend: { show: false },
        cursor: { y: false },
        scales: { x: { time: true } },
        axes: [{
          ...axis,
          // Whole days only; label as "28 Sep".
          incrs: [1, 2, 7, 14, 30, 61, 91, 182, 365, 730].map((d) => d * 86400),
          values: (_u, v) => v.map((s) => {
            const iso = fromDay(Math.round(s / 86400));
            return range === 'All' ? shortMonth(iso, lang) : shortDate(iso, lang);
          }),
        }, { ...axis, size: 52, values: (_u, v) => v.map((n) => `₹${n.toLocaleString('en-IN')}`) }],
        series: [{}, ...chosen.map((s) => ({
          label: s.name, stroke: colorOf(s.id), width: 2, spanGaps: true, points: { show: xs.length < 120, size: 5 },
        }))],
        hooks: msp ? { draw: [(u: uPlot) => {
          const y = u.valToPos(msp, 'y', true);
          if (y < u.bbox.top || y > u.bbox.top + u.bbox.height) return;
          const c = u.ctx; c.save(); c.setLineDash([4, 4]); c.strokeStyle = css.getPropertyValue('--muted');
          c.beginPath(); c.moveTo(u.bbox.left, y); c.lineTo(u.bbox.left + u.bbox.width, y); c.stroke(); c.restore();
        }] } : {},
      }, data, el);
      ro = new ResizeObserver(() => plot?.setSize({ width: el.clientWidth, height: 240 }));
      ro.observe(el);
    });
    return () => { dead = true; ro?.disconnect(); plot?.destroy(); };
  }, [series, sel, msp, days.size, range, lang]);

  if (!names.length) return <p className="card muted">{t.historyEmpty}</p>;

  return (
    <div className="card">
      <div className="row">
        {(Object.keys(RANGES) as Range[]).map((r, i) => (
          <button key={r} type="button" className="chip" aria-pressed={range === r} onClick={() => setRange(r)}>{t.rangeNames.split('|')[i]}</button>
        ))}
        <span className="muted">{range === 'All' ? t.monthlyAvg : ''}</span>
      </div>
      <div className="muted" style={{ marginTop: 6 }}>{t.historyHint}{msp ? ` ${t.mspLine}` : ''}</div>
      <div className="chips">
        {names.map((s) => (
          <button key={s.id} type="button" className="chip" aria-pressed={sel.includes(s.id)}
            style={sel.includes(s.id) ? { background: colorOf(s.id), borderColor: colorOf(s.id), color: '#fff' } : undefined}
            onClick={() => setSel(sel.includes(s.id) ? sel.filter((y) => y !== s.id) : [...sel, s.id])}>
            {s.name}
          </button>
        ))}
      </div>
      {days.size < 2 ? <p className="muted">{t.historyEmpty}</p> : <div ref={box} className="chart" />}
    </div>
  );
}
