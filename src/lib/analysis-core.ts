// Pure analysis for one crop across a set of mandis (no I/O): "is today a good price?", best mandi,
// mandi comparison, arrivals vs normal, and which months usually pay best.
import { toDay } from './dates';

type DocIn = { _id: string; m?: Record<string, unknown> };
type Q = [number, number, number, number]; // min, max, modal, arrivals

export type Verdict = 'good' | 'normal' | 'weak';

export type Analysis = {
  date: string | null; // latest report day in the district
  avg: number | null; // average modal across mandis on that day
  vs30: { avg: number; pct: number } | null; // vs average of the previous 30 days
  vsLastYear: { avg: number; pct: number } | null; // vs the same ±15 days a year ago
  vsMsp: { msp: number; diff: number } | null;
  verdict: Verdict | null;
  best: { id: number; name: string; d: number; price: number; aboveAvg: number } | null;
  mandis: { id: number; name: string; d: number; price: number; min: number; max: number; arrivals: number }[];
  arrivals: { today: number; normal: number; pct: number } | null; // district total vs 30-day avg
  seasonal: { month: number; pct: number }[] | null; // 1..12, % vs yearly average (last 5 full years)
  bestMonths: number[]; // up to 2 calendar months with the highest seasonal %
  years: number; // how many years the seasonal pattern is based on
};

/** Verdict threshold: ±3% vs the last 30 days. */
export const VERDICT_PCT = 3;

const pct = (a: number, b: number) => Math.round(((a - b) / b) * 1000) / 10;
const avgOf = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

export function analyzeCrop(
  dayDocs: DocIn[],
  monthDocs: DocIn[],
  market: (id: number) => { name: string; d: number } | undefined,
  msp: number | null,
  include: (m: { id: number; d: number }) => boolean = () => true,
): Analysis {
  const ok = (id: number) => { const m = market(id); return !!m && include({ id, d: m.d }); };
  // date -> marketId -> quote
  const byDate = new Map<string, Map<number, Q>>();
  for (const doc of dayDocs) {
    const date = doc._id.split(':')[1];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) continue;
    for (const [mid, q] of Object.entries(doc.m ?? {})) {
      if (!Array.isArray(q) || !(Number(q[2]) > 0) || !ok(Number(mid))) continue;
      const m = byDate.get(date) ?? new Map<number, Q>();
      m.set(Number(mid), q.map(Number) as Q);
      byDate.set(date, m);
    }
  }
  const dates = [...byDate.keys()].sort();
  // Use the latest *well-reported* day: today is often half-reported until evening, which would skew
  // the average. "Well-reported" = at least half the median number of mandis over the last 14 report days.
  const recentCounts = dates.slice(-14).map((d) => byDate.get(d)!.size).sort((a, b) => a - b);
  const median = recentCounts.length ? recentCounts[Math.floor(recentCounts.length / 2)] : 0;
  const date = [...dates].reverse().find((d) => byDate.get(d)!.size >= median / 2) ?? null;
  const dayAvg = (d: string) => avgOf([...byDate.get(d)!.values()].map((q) => q[2]));

  const empty: Analysis = {
    date, avg: null, vs30: null, vsLastYear: null, vsMsp: null, verdict: null, best: null, mandis: [],
    arrivals: null, seasonal: null, bestMonths: [], years: 0,
  };
  const out = { ...empty };

  if (date) {
    const today = byDate.get(date)!;
    const avg = Math.round(dayAvg(date));
    out.avg = avg;
    out.mandis = [...today].map(([id, q]) => ({ id, name: market(id)!.name, d: market(id)!.d, price: q[2], min: q[0], max: q[1], arrivals: q[3] || 0 }))
      .sort((a, b) => b.price - a.price);
    const top = out.mandis[0];
    out.best = { id: top.id, name: top.name, d: top.d, price: top.price, aboveAvg: top.price - avg };

    const t = toDay(date);
    const prev30 = dates.filter((d) => toDay(d) < t && toDay(d) >= t - 30 && byDate.get(d)!.size >= median / 2);
    if (prev30.length >= 3) {
      const a = Math.round(avgOf(prev30.map(dayAvg)));
      out.vs30 = { avg: a, pct: pct(avg, a) };
      out.verdict = out.vs30.pct > VERDICT_PCT ? 'good' : out.vs30.pct < -VERDICT_PCT ? 'weak' : 'normal';
    }
    const ly = dates.filter((d) => Math.abs(toDay(d) - (t - 365)) <= 15);
    if (ly.length >= 3) {
      const a = Math.round(avgOf(ly.map(dayAvg)));
      out.vsLastYear = { avg: a, pct: pct(avg, a) };
    }
    if (msp) out.vsMsp = { msp, diff: avg - msp };

    const total = (d: string) => [...byDate.get(d)!.values()].reduce((s, q) => s + (q[3] || 0), 0);
    if (prev30.length >= 3) {
      const normal = avgOf(prev30.map(total));
      const todayArr = total(date);
      if (normal > 0) out.arrivals = { today: Math.round(todayArr), normal: Math.round(normal), pct: pct(todayArr, normal) };
    }
  }

  // Seasonal pattern from monthly summaries: per year, each month's district average as % of that
  // year's average (removes inflation/trend), then averaged over the last 5 complete years.
  const monthAvg = new Map<string, number>(); // YYYY-MM -> district avg of mandi monthly averages
  for (const doc of monthDocs) {
    const ym = doc._id.split(':')[1];
    if (!/^\d{4}-\d{2}$/.test(ym ?? '')) continue;
    const vals = Object.entries(doc.m ?? {}).filter(([mid]) => ok(Number(mid)))
      .map(([, v]) => (Array.isArray(v) ? Number(v[0]) : NaN)).filter((x) => x > 0);
    if (vals.length) monthAvg.set(ym, avgOf(vals));
  }
  const lastFullYear = (date ? +date.slice(0, 4) : new Date().getFullYear()) - 1;
  const perMonth: number[][] = Array.from({ length: 12 }, () => []);
  let years = 0;
  for (let y = lastFullYear - 4; y <= lastFullYear; y++) {
    const ms = Array.from({ length: 12 }, (_, i) => monthAvg.get(`${y}-${String(i + 1).padStart(2, '0')}`));
    const present = ms.filter((x): x is number => x !== undefined);
    if (present.length < 6) continue; // too sparse to say anything about this year
    const ya = avgOf(present);
    ms.forEach((v, i) => { if (v !== undefined) perMonth[i].push(((v - ya) / ya) * 100); });
    years++;
  }
  if (years >= 2) {
    out.seasonal = perMonth.map((xs, i) => ({ month: i + 1, pct: xs.length ? Math.round(avgOf(xs) * 10) / 10 : NaN }))
      .filter((s) => !Number.isNaN(s.pct));
    out.bestMonths = [...out.seasonal].sort((a, b) => b.pct - a.pct).filter((s) => s.pct > 0).slice(0, 2).map((s) => s.month);
    out.years = years;
  }
  return out;
}
