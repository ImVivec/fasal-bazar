// Ingestion: Agmarknet market-wise daily report -> Mongo `daily` (+ `monthly`, `meta`). Safe to re-run.
//
// One API call = one date, every commodity, every mandi we watch (both states).
// - runDaily: today + 2 days back (late reports/corrections), market watch, crop watch, MSPs,
//   last month's summary once, and the "active crops" summary for the crop picker.
// - runFill:  backfill day by day, newest -> oldest, down to a date; resumable via meta.fill.
//
// Agmarknet rate-limits bursts (HTTP 429 for ~5 min after ~75 quick calls); calls are sequential
// with a pause (~1.6 s response + 1 s gap ≈ 23 calls/min).
import 'server-only';
import { fetchDay, fetchMarketList, fetchMsp, HttpError, type DayReport } from './agmarknet';
import { activeSummary, addDays, addMonths, advanceFetchedThrough, buildDailyOps, buildMonthlyOps, cropRange, dailyPlan, marketWatchDiff, mergeCropWatch } from './ingest-core';
import { cols } from './db';
import { CROPS, DISTRICTS, MARKETS } from './master';
import { todayIST } from './dates';

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
type Log = (m: string) => void;

/** Mandis to request: the code list plus any new ones the market watch found (so no prices are lost). */
async function watchedMarketIds() {
  const { meta } = await cols();
  const extra = (await meta.findOne({ _id: 'agmarknet' }))?.marketWatch?.added ?? [];
  return [...new Set([...MARKETS.map((m) => m.id), ...extra.map((m) => m.id)])];
}

/** Fetch one date with retries on rate limits/outages. null = gave up. */
async function fetchDayRetry(date: string, ids: number[], o: { retries: number; waitMs: (e: unknown) => number; log: Log }) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchDay(date, ids);
    } catch (e) {
      const transient = e instanceof HttpError ? e.transient : true; // network errors too
      if (!transient || attempt >= o.retries) { o.log(`  ${date}: ${e instanceof Error ? e.message : e} (giving up)`); return null; }
      const w = o.waitMs(e);
      o.log(`  ${date}: ${e instanceof Error ? e.message : e} → retry in ${Math.round(w / 1000)} s`);
      await sleep(w);
    }
  }
}

/** Write one day's report: one upsert per crop. Returns docs written. */
async function writeDay(date: string, r: DayReport) {
  const ops = buildDailyOps(date, r.quotes);
  if (!ops.length) return 0;
  const { daily } = await cols();
  const res = await daily.bulkWrite(ops, { ordered: false });
  return res.upsertedCount + res.modifiedCount;
}

/** Build a completed month's summaries from its daily docs (all crops). */
export async function summarizeMonth(ym: string) {
  const { daily, monthly } = await cols();
  const docs = (await Promise.all(CROPS.map((c) => daily.find(cropRange(c.id, `${ym}-01`, `${ym}-31`)).toArray()))).flat();
  const ops = buildMonthlyOps(ym, docs);
  if (ops.length) await monthly.bulkWrite(ops, { ordered: false });
  return ops.length;
}

/** Recompute meta.active (crop picker data) from the last 60 days of daily docs. */
async function refreshActive(today: string) {
  const { daily, meta } = await cols();
  const from = addDays(today, -60);
  const docs = (await Promise.all(CROPS.map((c) => daily.find(cropRange(c.id, from, today)).toArray()))).flat();
  const active = activeSummary(docs);
  await meta.updateOne({ _id: 'agmarknet' }, { $set: { active } }, { upsert: true });
  return active;
}

export type DailyResult = {
  today: string;
  dates: { date: string; crops: number; mandis: number; written: number }[];
  failed: string[];
  summarized: string[];
  newMarkets: { id: number; name: string; district: number }[];
  missingMarkets: number[];
  renamedMarkets: { id: number; code: string; agm: string }[];
  /** Outage longer than the catch-up limit: days before this date were not fetched (run a backfill). */
  gapBefore: string | null;
  ok: boolean;
  ms: number;
};

/** The daily job (GitHub Actions 2×/day, or the admin "Refresh" button). */
export async function runDaily(opts: { gapMs?: number; retries?: number; retryWaitMs?: number; log?: Log } = {}): Promise<DailyResult> {
  const t0 = Date.now();
  const { gapMs = 1000, retries = 4, retryWaitMs = 60_000, log = () => {} } = opts;
  const { meta } = await cols();
  const m0 = await meta.findOne({ _id: 'agmarknet' });
  const today = todayIST();
  const plan = dailyPlan(today, m0?.monthSummaryUpTo ?? addMonths(today.slice(0, 7), -1), m0?.fetchedThrough ?? null);
  const res: DailyResult = { today, dates: [], failed: [], summarized: [], newMarkets: [], missingMarkets: [], renamedMarkets: [], gapBefore: plan.gapBefore, ok: false, ms: 0 };
  log(`fetching ${plan.dates[0]} → ${today} (${plan.dates.length} days)${plan.gapBefore ? `; outage longer than the catch-up limit: days before ${plan.gapBefore} need \`npm run backfill\`` : ''}`);
  const set: Record<string, unknown> = {};

  // 1) Market watch: compare Agmarknet's mandi list for our districts with the code list.
  try {
    const agm = await fetchMarketList(DISTRICTS.map((d) => d.id));
    const w = marketWatchDiff(MARKETS, agm, m0?.marketWatch?.added ?? [], today);
    const marketWatch = { checkedAt: new Date(), ...w };
    res.newMarkets = w.added; res.missingMarkets = w.missing; res.renamedMarkets = w.renamed;
    if (w.added.length) log(`market watch: ${w.added.length} new mandi(s): ${w.added.map((m) => `${m.name} (${m.id})`).join(', ')}`);
    await meta.updateOne({ _id: 'agmarknet' }, { $set: { marketWatch } }, { upsert: true });
  } catch (e) {
    log(`market watch failed: ${e instanceof Error ? e.message : e}`);
  }

  // 2) Prices: the correction window (7 days) or, after an outage, everything since the last good day
  //    (oldest first, so the crop watch counts days right).
  const ids = await watchedMarketIds();
  let cropWatch = m0?.cropWatch ?? {};
  for (const [i, date] of plan.dates.entries()) {
    if (i) await sleep(gapMs);
    const r = await fetchDayRetry(date, ids, { retries, waitMs: () => retryWaitMs, log });
    if (!r) { res.failed.push(date); continue; }
    const written = await writeDay(date, r);
    cropWatch = mergeCropWatch(cropWatch, r.uncurated, date);
    res.dates.push({ date, crops: r.quotes.size, mandis: r.reporting, written });
    log(`${date}: ${r.quotes.size} crops from ${r.reporting} mandis, ${written} docs written${r.unitSkipped ? `, ${r.unitSkipped} rows skipped (unit)` : ''}`);
  }
  set.cropWatch = cropWatch;

  // 3) Last month's summary, once (only when its last day has been fetched without failures).
  let summaryUpTo = m0?.monthSummaryUpTo ?? null;
  for (const ym of plan.summarize) {
    if (res.failed.some((d) => d.startsWith(ym))) break;
    await summarizeMonth(ym);
    res.summarized.push(ym);
    summaryUpTo = ym;
  }
  if (summaryUpTo) set.monthSummaryUpTo = summaryUpTo;

  // 4) MSPs (1 call) and the crop picker summary.
  try {
    await sleep(gapMs);
    for (const [id, v] of Object.entries(await fetchMsp())) set[`msp.${id}`] = v;
  } catch (e) {
    log(`msp: ${e instanceof Error ? e.message : e}`);
  }
  const active = await refreshActive(today);
  const latestDate = Object.values(active).reduce<string | null>((a, x) => (!a || x.date > a ? x.date : a), null);

  res.ok = res.failed.length === 0;
  const now = new Date();
  await meta.updateOne({ _id: 'agmarknet' }, {
    $set: {
      ...set,
      lastRunAt: now,
      failed: res.failed,
      lastError: res.ok ? (plan.gapBefore ? `gap before ${plan.gapBefore}: run a backfill` : null) : `${res.failed.length} of ${plan.dates.length} days failed`,
      fetchedThrough: advanceFetchedThrough(m0?.fetchedThrough ?? null, plan.dates, res.failed),
      ...(res.dates.length ? { lastOkAt: now } : {}),
      ...(latestDate ? { latestDate } : {}),
    },
  }, { upsert: true });
  res.ms = Date.now() - t0;
  return res;
}

export type FillResult = { days: number; written: number; months: string[]; next: string | null; done: boolean; stoppedBy: 'done' | 'budget' | 'failed'; ms: number };

/**
 * Backfill day by day, newest -> oldest, from meta.fill.next (or `from`) down to `until` inclusive.
 * A completed month gets its summary as soon as its first day is written. Resumable any time.
 */
export async function runFill(opts: { from?: string; until: string; gapMs?: number; budgetMs?: number; log?: Log }): Promise<FillResult> {
  const t0 = Date.now();
  const { gapMs = 1000, budgetMs = Infinity, log = () => {} } = opts;
  const { meta } = await cols();
  const m0 = await meta.findOne({ _id: 'agmarknet' });
  const thisMonth = todayIST().slice(0, 7);
  // Resume only if the saved cursor is for the same target; otherwise start fresh.
  let fill = m0?.fill && m0.fill.until === opts.until && !m0.fill.doneAt
    ? m0.fill
    : { next: opts.from ?? todayIST(), until: opts.until, startedAt: new Date() };
  const ids = await watchedMarketIds();
  const res: FillResult = { days: 0, written: 0, months: [], next: fill.next, done: false, stoppedBy: 'done', ms: 0 };

  while (fill.next && fill.next >= fill.until) {
    if (Date.now() - t0 > budgetMs) { res.stoppedBy = 'budget'; break; }
    const date = fill.next;
    if (res.days) await sleep(gapMs);
    const r = await fetchDayRetry(date, ids, {
      retries: 30, log,
      waitMs: (e) => (e instanceof HttpError && e.status === 429 ? 6 * 60_000 : 2 * 60_000),
    });
    if (!r) { res.stoppedBy = 'failed'; break; }
    res.written += await writeDay(date, r);
    res.days++;
    // Crossing into the previous month: the month we just finished (date's month) is complete.
    const nextDate = addDays(date, -1);
    const ym = date.slice(0, 7);
    if (nextDate.slice(0, 7) !== ym && ym < thisMonth) {
      await summarizeMonth(ym);
      res.months.push(ym);
      log(`${ym}: month complete, summary written`);
    }
    fill = nextDate >= fill.until ? { ...fill, next: nextDate } : { ...fill, next: null, doneAt: new Date() };
    if (res.days % 10 === 0 || !fill.next) {
      await meta.updateOne({ _id: 'agmarknet' }, { $set: { fill } }, { upsert: true });
      log(`${date}: ${r.quotes.size} crops, ${r.reporting} mandis (cursor saved)`);
    }
  }
  await meta.updateOne({ _id: 'agmarknet' }, { $set: { fill } }, { upsert: true });
  // If the fill reached the current month, refresh the picker summary too.
  if (res.days) await refreshActive(todayIST());
  res.next = fill.next;
  res.done = !!fill.doneAt;
  res.ms = Date.now() - t0;
  return res;
}
