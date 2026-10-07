// Arrivals tab data: weekly arrivals per mandi (with that week's arrival-weighted price) and each
// mandi's total for the last 30 days. Pure, so it can be unit-tested; names are added on the phone.
import type { DailyDoc } from './db';
import { fromDay, toDay } from './dates';

export type ArrivalsData = {
  /** Monday of each complete week (days since epoch), oldest first. */
  weeks: number[];
  /** Per mandi, aligned with `weeks`: tonnes that week, and the arrival-weighted modal price (null = none). */
  mandis: { id: number; d: number; t: number[]; p: (number | null)[] }[];
  /** Tonnes per mandi id over the 30 days ending `to`. */
  recent: { from: string; to: string; t: Record<string, number> };
};

export type MonthlyArrivals = {
  /** 1st of each month (days since epoch), oldest first. */
  months: number[];
  /** Per mandi, aligned with `months`: tonnes that month, and the month's average modal price (null = none). */
  mandis: { id: number; d: number; t: number[]; p: (number | null)[] }[];
};

/** Monday on or before `day` (day 0, 1 Jan 1970, was a Thursday). */
export const weekOf = (day: number) => day - ((day + 3) % 7);

const RECENT_DAYS = 30;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function shapeArrivals(docs: DailyDoc[], districtOf: (id: number) => number | undefined, weeksBack = 53): ArrivalsData {
  const days = docs.map((doc) => ({ day: toDay(doc._id.slice(doc._id.indexOf(':') + 1)), m: doc.m }));
  const latest = Math.max(-Infinity, ...days.map((x) => x.day));
  if (!Number.isFinite(latest)) return { weeks: [], mandis: [], recent: { from: '', to: '', t: {} } };

  // The latest week counts once it reaches Saturday (Sunday is nearly empty); otherwise it'd look like a dip.
  const lastWeek = latest - weekOf(latest) >= 5 ? weekOf(latest) : weekOf(latest) - 7;
  const firstWeek = lastWeek - (weeksBack - 1) * 7;
  const recentFrom = latest - RECENT_DAYS + 1;

  const acc = new Map<number, { t: number[]; pt: number[]; w: number[] }>(); // tonnes, Σ price×weight, Σ weight
  const recent: Record<string, number> = {};
  let firstSeen = Infinity;
  for (const { day, m } of days) {
    const wk = weekOf(day);
    const i = (wk - firstWeek) / 7;
    for (const [k, q] of Object.entries(m)) {
      const id = Number(k);
      const arr = q[3] || 0;
      if (day >= recentFrom && arr > 0) recent[k] = (recent[k] ?? 0) + arr;
      if (wk < firstWeek || wk > lastWeek) continue;
      firstSeen = Math.min(firstSeen, wk);
      let a = acc.get(id);
      if (!a) acc.set(id, (a = { t: Array(weeksBack).fill(0), pt: Array(weeksBack).fill(0), w: Array(weeksBack).fill(0) }));
      const w = arr > 0 ? arr : 0.001; // a price with no reported arrivals still counts, barely
      a.t[i] += arr;
      a.pt[i] += q[2] * w;
      a.w[i] += w;
    }
  }

  // Drop the empty weeks before this crop's data starts.
  const skip = Number.isFinite(firstSeen) ? (firstSeen - firstWeek) / 7 : weeksBack;
  const weeks = Array.from({ length: weeksBack - skip }, (_, j) => firstWeek + (j + skip) * 7);
  const mandis = [...acc].map(([id, a]) => ({
    id,
    d: districtOf(id) ?? 0,
    t: a.t.slice(skip).map(round1),
    p: a.pt.slice(skip).map((x, j) => (a.w[j + skip] ? Math.round(x / a.w[j + skip]) : null)),
  })).filter((x) => x.t.some((v) => v > 0)).sort((a, b) => a.id - b.id);

  for (const k of Object.keys(recent)) recent[k] = round1(recent[k]);
  return { weeks, mandis, recent: { from: fromDay(recentFrom), to: fromDay(latest), t: recent } };
}

/** Month-by-month arrivals and prices per mandi from `monthly` docs ("cropId:YYYY-MM"). */
export function shapeMonthlyArrivals(docs: { _id: string; m?: Record<string, unknown> }[], districtOf: (id: number) => number | undefined): MonthlyArrivals {
  const yms = [...new Set(docs.map((d) => d._id.slice(d._id.indexOf(':') + 1)).filter((ym) => /^\d{4}-\d{2}$/.test(ym)))].sort();
  const idx = new Map(yms.map((ym, i) => [ym, i]));
  const acc = new Map<number, { t: number[]; p: (number | null)[] }>();
  for (const doc of docs) {
    const i = idx.get(doc._id.slice(doc._id.indexOf(':') + 1));
    if (i === undefined) continue;
    for (const [k, v] of Object.entries(doc.m ?? {})) {
      if (!Array.isArray(v) || !(Number(v[0]) > 0)) continue;
      const id = Number(k);
      if (districtOf(id) === undefined) continue; // not in the code list (yet)
      let a = acc.get(id);
      if (!a) acc.set(id, (a = { t: yms.map(() => 0), p: yms.map(() => null) }));
      a.t[i] = round1(Number(v[2]) > 0 ? Number(v[2]) : 0);
      a.p[i] = Math.round(Number(v[0]));
    }
  }
  return {
    months: yms.map((ym) => toDay(`${ym}-01`)),
    mandis: [...acc].map(([id, a]) => ({ id, d: districtOf(id)!, t: a.t, p: a.p })).sort((a, b) => a.id - b.id),
  };
}

/** Sum the mandis kept by `keep` into one series (tonnes, and arrival-weighted price). Works for weeks or months. */
export function totalSeries(
  length: number,
  mandis: { id: number; d: number; t: number[]; p: (number | null)[] }[],
  keep: (m: { id: number; d: number }) => boolean,
) {
  const t = Array.from({ length }, () => 0);
  const pt = Array.from({ length }, () => 0);
  for (const m of mandis) {
    if (!keep(m)) continue;
    m.t.forEach((v, i) => {
      t[i] += v;
      if (m.p[i] !== null && v > 0) pt[i] += m.p[i]! * v;
    });
  }
  return { t: t.map(round1), p: t.map((v, i) => (v > 0 ? Math.round(pt[i] / v) : null)) };
}

/** Weekly totals (kept for the existing callers). */
export const totalByWeek = (data: ArrivalsData, keep: (m: { id: number; d: number }) => boolean) =>
  totalSeries(data.weeks.length, data.mandis, keep);
