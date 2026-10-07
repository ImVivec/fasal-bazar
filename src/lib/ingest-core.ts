// Pure helpers for ingestion (no I/O) so they can be unit-tested.
import type { AgmMarket, DayQuote } from './agmarknet';
import type { WatchedMarket } from './db';

export const dailyId = (cropId: number, date: string) => `${cropId}:${date}`;
export const monthlyId = (cropId: number, ym: string) => `${cropId}:${ym}`;

/** _id range for one crop between two keys (dates "YYYY-MM-DD" or months "YYYY-MM"), inclusive. */
export const cropRange = (cropId: number, from: string, to: string) => ({
  _id: { $gte: `${cropId}:${from}`, $lte: `${cropId}:${to}` },
});

/** One idempotent upsert per crop for this date; each mandi is its own $set path (merges, never wipes). */
export function buildDailyOps(date: string, quotes: Map<number, Record<string, DayQuote>>) {
  return [...quotes].map(([crop, mkts]) => ({
    updateOne: {
      filter: { _id: dailyId(crop, date) },
      update: { $set: Object.fromEntries(Object.entries(mkts).map(([m, q]) => [`m.${m}`, q])) },
      upsert: true,
    },
  }));
}

/** Month summary per crop from that month's daily docs: mandi -> [avg modal, days reported, arrivals (t)]. */
export function buildMonthlyOps(ym: string, docs: { _id: string; m?: Record<string, unknown> }[]) {
  const acc = new Map<number, Map<string, [number, number, number]>>(); // crop -> mandi -> [Σ modal, n, Σ arrivals]
  for (const d of docs) {
    const [crop, date] = d._id.split(':');
    if (!date?.startsWith(ym)) continue;
    const c = acc.get(Number(crop)) ?? new Map<string, [number, number, number]>();
    for (const [mkt, q] of Object.entries(d.m ?? {})) {
      const modal = Array.isArray(q) ? Number(q[2]) : NaN;
      if (!(modal > 0)) continue;
      const a = c.get(mkt) ?? [0, 0, 0];
      const arr = Number((q as unknown[])[3]);
      a[0] += modal; a[1]++; a[2] += arr > 0 ? arr : 0;
      c.set(mkt, a);
    }
    acc.set(Number(crop), c);
  }
  return [...acc].filter(([, c]) => c.size).map(([crop, c]) => ({
    updateOne: {
      filter: { _id: monthlyId(crop, ym) },
      update: { $set: Object.fromEntries([...c].map(([m, [s, n, arr]]) => [`m.${m}`, [Math.round(s / n), n, Math.round(arr * 100) / 100]])) },
      upsert: true,
    },
  }));
}

/** "YYYY-MM" month arithmetic. */
export function addMonths(ym: string, n: number): string {
  const i = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" day arithmetic (UTC, no TZ drift). */
export function addDays(date: string, n: number): string {
  const t = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Re-fetch this many days back every run: late uploads and corrections within a week are picked up. */
export const CORRECTION_DAYS = 7;
/** After an outage, catch up at most this many days back in one run (older gaps need `npm run backfill`). */
export const MAX_CATCHUP_DAYS = 45;

/**
 * The daily job's plan for an IST date:
 * - dates (oldest first): from `today - CORRECTION_DAYS`, or earlier if the job was down — then from the day
 *   after `fetchedThrough` (last date up to which every day was fetched OK), capped at MAX_CATCHUP_DAYS.
 * - gapBefore: set when the outage was longer than the cap (days before it still need a manual backfill).
 * - summarize: completed months still missing a summary (normally just last month, once, on the 1st;
 *   more only after downtime across a month boundary; capped at 3).
 */
export function dailyPlan(todayIso: string, summaryUpTo: string | null, fetchedThrough: string | null = null) {
  const window = addDays(todayIso, -CORRECTION_DAYS);
  const cap = addDays(todayIso, -MAX_CATCHUP_DAYS);
  const resume = fetchedThrough ? addDays(fetchedThrough, 1) : window;
  const wanted = resume < window ? resume : window;
  const start = wanted < cap ? cap : wanted;
  const dates: string[] = [];
  for (let d = start; d <= todayIso; d = addDays(d, 1)) dates.push(d);
  const prev = addMonths(todayIso.slice(0, 7), -1);
  const summarize: string[] = [];
  for (let m = summaryUpTo ? addMonths(summaryUpTo, 1) : prev; m <= prev && summarize.length < 3; m = addMonths(m, 1)) summarize.push(m);
  return { dates, summarize, gapBefore: wanted < cap ? cap : null };
}

/** Last date up to which every planned date succeeded (in order), else the previous value. */
export function advanceFetchedThrough(prev: string | null, dates: string[], failed: string[]) {
  let through = prev;
  for (const d of dates) {
    if (failed.includes(d)) break;
    if (!through || d > through) through = d;
  }
  return through;
}

/** Per crop: latest date, mandis reporting in the window, and the modal range on the latest date. */
export function activeSummary(docs: { _id: string; m?: Record<string, unknown> }[]) {
  const byCrop = new Map<string, { latest: string; mandis: Set<string>; latestDoc?: Record<string, unknown> }>();
  for (const d of docs) {
    const [crop, date] = d._id.split(':');
    const e = byCrop.get(crop) ?? { latest: '', mandis: new Set<string>() };
    for (const k of Object.keys(d.m ?? {})) e.mandis.add(k);
    if (date > e.latest) { e.latest = date; e.latestDoc = d.m; }
    byCrop.set(crop, e);
  }
  const out: Record<string, { date: string; mandis: number; lo: number; hi: number }> = {};
  for (const [crop, e] of byCrop) {
    const modals = Object.values(e.latestDoc ?? {}).map((q) => (Array.isArray(q) ? Number(q[2]) : NaN)).filter((x) => x > 0);
    if (!modals.length) continue;
    out[crop] = { date: e.latest, mandis: e.mandis.size, lo: Math.min(...modals), hi: Math.max(...modals) };
  }
  return out;
}

/**
 * Compare Agmarknet's mandi list for our districts with the code list.
 * added: in Agmarknet, not in code (keeps the first-seen date across runs); missing: in code, gone
 * from Agmarknet; renamed: same id, different name.
 */
export function marketWatchDiff(
  code: { id: number; en: string }[],
  agm: AgmMarket[],
  prevAdded: WatchedMarket[],
  today: string,
) {
  const codeById = new Map(code.map((m) => [m.id, m]));
  const agmIds = new Set(agm.map((m) => m.id));
  const first = new Map(prevAdded.map((m) => [m.id, m.firstSeen]));
  const clean = (s: string) => s.replace(/\s*APMC$/i, '').replace(/\s+/g, ' ').trim();
  return {
    added: agm.filter((m) => !codeById.has(m.id))
      .map((m) => ({ id: m.id, name: m.name, district: m.district, firstSeen: first.get(m.id) ?? today })),
    missing: code.filter((m) => !agmIds.has(m.id)).map((m) => m.id),
    renamed: agm.filter((m) => codeById.has(m.id) && clean(m.name).toLowerCase() !== clean(codeById.get(m.id)!.en).toLowerCase())
      .map((m) => ({ id: m.id, code: codeById.get(m.id)!.en, agm: m.name })),
  };
}

/** Fold one day's non-curated commodities into the running crop watch. */
export function mergeCropWatch(
  prev: Record<string, { name: string; firstSeen: string; lastSeen: string; days: number }>,
  uncurated: Record<string, { name: string }>,
  date: string,
) {
  const out = { ...prev };
  for (const [id, u] of Object.entries(uncurated)) {
    const p = out[id];
    if (!p) out[id] = { name: u.name, firstSeen: date, lastSeen: date, days: 1 };
    else if (date > p.lastSeen) out[id] = { ...p, lastSeen: date, days: p.days + 1 };
    else if (date < p.firstSeen) out[id] = { ...p, firstSeen: date };
  }
  return out;
}
