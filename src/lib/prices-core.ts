// Pure shaping of one crop's `daily`/`monthly` docs into what the crop page needs (no I/O).
// Rows carry their district so the page can filter by district in the browser.
import { toDay } from './dates';

export type Point = [day: number, price: number]; // day = days since epoch

export type MarketRow = {
  id: number;
  name: string;
  d: number; // district id
  date: string; // latest reported date
  price: number; // latest modal price
  min: number;
  max: number;
  arrivals: number; // on the latest day
  prevDate: string | null;
  change: number | null; // modal vs. previous reported day
  weekDelta: number | null; // modal vs. its report closest to 7 days earlier (5–10 days back)
  stale: boolean; // latest report is much older than the newest across all mandis
};

export type Series = { id: number; name: string; d: number; points: Point[] };

export type CropView = {
  rows: MarketRow[]; // high -> low; stale rows last
  latestDate: string | null;
  series: Series[]; // daily modal since `sinceDay` (mandis active in the table only)
  monthly: Series[]; // monthly avg modal, all history (day = 1st of month)
};

/** Mandis whose last report is older than this (vs. newest overall) are flagged stale. */
export const STALE_DAYS = 7;
/** Mandis with no report for this long are left out of the table. */
export const ROW_MAX_AGE_DAYS = 60;

type Q = [number, number, number, number];
type DocIn = { _id: string; m?: Record<string, unknown> };
export type MarketInfo = (id: number) => { name: string; d: number } | undefined;

export function shapeCropView(dailyDocs: DocIn[], monthlyDocs: DocIn[], market: MarketInfo, sinceDay = -Infinity): CropView {
  const byMarket = new Map<number, Map<string, Q>>(); // mandi -> date -> quote
  for (const doc of dailyDocs) {
    const date = doc._id.split(':')[1];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) continue;
    for (const [mid, q] of Object.entries(doc.m ?? {})) {
      if (!Array.isArray(q) || q.length < 3 || !(Number(q[2]) > 0)) continue;
      const id = Number(mid);
      if (!market(id)) continue; // not (yet) in the code list
      const m = byMarket.get(id) ?? new Map<string, Q>();
      m.set(date, q.map(Number) as Q);
      byMarket.set(id, m);
    }
  }

  const rows: MarketRow[] = [];
  const dailyPoints = new Map<number, Point[]>();
  for (const [id, m] of byMarket) {
    const info = market(id)!;
    const dates = [...m.keys()].sort();
    const date = dates[dates.length - 1];
    const prevDate = dates.length > 1 ? dates[dates.length - 2] : null;
    const [min, max, price, arrivals] = m.get(date)!;
    // Week change: closest report to 7 days before the latest one, within 5–10 days.
    const target = toDay(date) - 7;
    let best: [number, number] | null = null;
    for (const d of dates) {
      const dd = toDay(d);
      if (dd > toDay(date) - 5 || dd < toDay(date) - 10) continue;
      if (!best || Math.abs(dd - target) < best[0]) best = [Math.abs(dd - target), m.get(d)![2]];
    }
    rows.push({
      id, name: info.name, d: info.d, date, price, min, max, arrivals: arrivals || 0, prevDate,
      change: prevDate ? price - m.get(prevDate)![2] : null, weekDelta: best ? price - best[1] : null, stale: false,
    });
    dailyPoints.set(id, dates.map((d) => [toDay(d), m.get(d)![2]] as Point).filter(([d]) => d >= sinceDay));
  }

  const latestDate = rows.reduce<string | null>((a, r) => (!a || r.date > a ? r.date : a), null);
  if (latestDate) for (const r of rows) r.stale = toDay(latestDate) - toDay(r.date) > STALE_DAYS;
  const recent = latestDate ? rows.filter((r) => toDay(latestDate) - toDay(r.date) <= ROW_MAX_AGE_DAYS) : rows;
  recent.sort((a, b) => Number(a.stale) - Number(b.stale) || b.price - a.price || a.name.localeCompare(b.name));

  // Monthly: stored summaries, plus months not summarised yet (e.g. this month) averaged from daily.
  const monthlyBy = new Map<number, Map<string, number>>();
  for (const doc of monthlyDocs) {
    const ym = doc._id.split(':')[1];
    if (!/^\d{4}-\d{2}$/.test(ym ?? '')) continue;
    for (const [mid, v] of Object.entries(doc.m ?? {})) {
      if (!Array.isArray(v) || !(Number(v[0]) > 0) || !market(Number(mid))) continue;
      const mm = monthlyBy.get(Number(mid)) ?? new Map<string, number>();
      mm.set(ym, Math.round(Number(v[0])));
      monthlyBy.set(Number(mid), mm);
    }
  }
  for (const [id, m] of byMarket) {
    const sums = new Map<string, [number, number]>();
    for (const [d, q] of m) { const a = sums.get(d.slice(0, 7)) ?? [0, 0]; a[0] += q[2]; a[1]++; sums.set(d.slice(0, 7), a); }
    const mm = monthlyBy.get(id) ?? new Map<string, number>();
    for (const [ym, [s, n]] of sums) if (!mm.has(ym)) mm.set(ym, Math.round(s / n));
    monthlyBy.set(id, mm);
  }

  const inTable = new Set(recent.map((r) => r.id));
  const series: Series[] = recent.filter((r) => dailyPoints.get(r.id)?.length)
    .map((r) => ({ id: r.id, name: r.name, d: r.d, points: dailyPoints.get(r.id)! }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const monthly: Series[] = [...monthlyBy].filter(([, mm]) => mm.size)
    .map(([id, mm]) => ({ id, name: market(id)!.name, d: market(id)!.d,
      points: [...mm].sort((a, b) => a[0].localeCompare(b[0])).map(([ym, v]) => [toDay(`${ym}-01`), v] as Point) }))
    // Closed mandis stay in the long-range chart; active ones first.
    .sort((a, b) => Number(!inTable.has(a.id)) - Number(!inTable.has(b.id)) || a.name.localeCompare(b.name));
  return { rows: recent, latestDate, series, monthly };
}

/** Average week change across the given rows (fresh only), or null. */
export function weekChangeOf(rows: MarketRow[]): number | null {
  const ds = rows.filter((r) => !r.stale && r.weekDelta !== null).map((r) => r.weekDelta!);
  return ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null;
}
