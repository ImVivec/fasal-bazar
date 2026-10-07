// Server-side reads for pages. Everything is keyed by crop: 1–3 _id-range queries per page render.
import 'server-only';
import { cols } from './db';
import { addDays, cropRange } from './ingest-core';
import { shapeCropView, type MarketInfo } from './prices-core';
import { analyzeCrop, type Analysis } from './analysis-core';
import { shapeArrivals, shapeMonthlyArrivals } from './arrivals-core';
import { DISTRICTS, MARKETS } from './master';
import { todayIST, toDay } from './dates';

const MARKET = {
  en: new Map(MARKETS.map((m) => [m.id, { name: m.en, d: m.d }])),
  hi: new Map(MARKETS.map((m) => [m.id, { name: m.hi, d: m.d }])),
};
const marketInfo = (lang: 'en' | 'hi'): MarketInfo => (id) => MARKET[lang].get(id);

export const HISTORY_DAYS = 365; // daily points; older history comes from monthly summaries
const LOOKBACK_DAYS = HISTORY_DAYS + 35; // a bit more, so "previous report" and "last year" exist at the edge

async function load(cropId: number) {
  const today = todayIST();
  const { daily, monthly, meta } = await cols();
  const [dailyDocs, monthlyDocs, m] = await Promise.all([
    daily.find(cropRange(cropId, addDays(today, -LOOKBACK_DAYS), today)).toArray(),
    monthly.find(cropRange(cropId, '2000-01', today.slice(0, 7))).toArray(),
    meta.findOne({ _id: 'agmarknet' }, { projection: { msp: 1, lastOkAt: 1, lastRunAt: 1, lastError: 1 } }),
  ]);
  return { today, dailyDocs, monthlyDocs, m };
}

/** Crop page: every mandi (all districts) for one crop. */
export async function getCropView(cropId: number, lang: 'en' | 'hi') {
  const { today, dailyDocs, monthlyDocs, m } = await load(cropId);
  const view = shapeCropView(dailyDocs, monthlyDocs, marketInfo(lang), toDay(today) - HISTORY_DAYS);
  return {
    ...view,
    msp: m?.msp?.[cropId] ?? null,
    lastOkAt: m?.lastOkAt?.toISOString() ?? null,
    lastRunAt: m?.lastRunAt?.toISOString() ?? null,
    lastError: m?.lastError ?? null,
  };
}

/** Analysis page: the analysis for all mandis, and for each district that trades the crop. */
export async function getCropAnalysis(cropId: number, lang: 'en' | 'hi') {
  const { dailyDocs, monthlyDocs, m } = await load(cropId);
  const msp = m?.msp?.[cropId] ?? null;
  const info = marketInfo(lang);
  const variants: Record<string, Analysis> = { all: analyzeCrop(dailyDocs, monthlyDocs, info, msp) };
  for (const d of DISTRICTS) {
    const a = analyzeCrop(dailyDocs, monthlyDocs, info, msp, (x) => x.d === d.id);
    if (a.date) variants[d.id] = a;
  }
  return { variants, msp };
}

const districtOf = (id: number) => MARKET.en.get(id)?.d;

/** Arrivals tab: weekly arrivals per mandi for about a year and the last 30 days' totals. */
export async function getCropArrivals(cropId: number) {
  const today = todayIST();
  const { daily } = await cols();
  return shapeArrivals(await daily.find(cropRange(cropId, addDays(today, -LOOKBACK_DAYS), today)).toArray(), districtOf);
}

/** Arrivals tab, "All years": month-by-month arrivals and price per mandi from the monthly summaries. */
export async function getCropMonthlyArrivals(cropId: number) {
  const { monthly } = await cols();
  return shapeMonthlyArrivals(await monthly.find(cropRange(cropId, '2000-01', todayIST().slice(0, 7))).toArray(), districtOf);
}

/** Crop picker: per-crop activity summary (refreshed by the daily job). */
export async function getActive() {
  const { meta } = await cols();
  const m = await meta.findOne({ _id: 'agmarknet' }, { projection: { active: 1, lastOkAt: 1 } });
  return { active: m?.active ?? {}, lastOkAt: m?.lastOkAt?.toISOString() ?? null };
}
