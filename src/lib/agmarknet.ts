// Adapter for the undocumented Agmarknet 2.0 API (api.agmarknet.gov.in/v1). Server-only.
//
// Prices: the public "Market-wise, commodity-wise daily report". One call = one date, every
// commodity, every listed mandi (both states), with min/max/modal + arrivals per variety/grade.
// History back to 2002, no captcha. Mandi IDs must be listed explicitly (no "all" option).
// Master list: /daily-price-arrival/filters (all mandis with their district), used by the market watch.
// MSP: the homepage dashboard.
import { CROPS, STATES } from './master';

const BASE = 'https://api.agmarknet.gov.in/v1';
// The default "node" User-Agent is rejected with 403; identify ourselves honestly instead.
const HEADERS = { Accept: 'application/json', 'User-Agent': 'fasal-bazar/0.1' };

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
  /** Rate limit or upstream outage: worth waiting and retrying. */
  get transient() { return this.status === 429 || this.status >= 500; }
}

/** Parse "2800.00" / 2800 / null / "" into a positive number or null. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** One mandi-day: [min, max, modal, arrivals]. Prices ₹ per crop unit (int); arrivals tonnes or bundles (2 dp). */
export type DayQuote = [min: number, max: number, modal: number, arrivals: number];

/** Agmarknet commodity id (incl. aliases) -> curated crop. */
const CROP_BY_AGM_ID = new Map(CROPS.flatMap((c) => [c.id, ...c.alias].map((id) => [id, c] as const)));
const UNIT_OF: Record<string, 'qtl' | 'bundle'> = { 'rs./quintal': 'qtl', 'rs./bundle': 'bundle' };

// Agmarknet data quirks for "Coriander(Leaves)" (id 39), checked against real reports (Oct 2026):
// - grain mandis file coriander *seed* under it (₹5,500–16,000), so there it counts as coriander seed (92);
// - in fruit & vegetable mandis it is real leaves, labelled "Rs./Bundle" but priced per quintal (₹400–3,500).
const CORIANDER_LEAVES = 39;
const CORIANDER_SEED = 92;
const isFv = (marketName: string) => /\(F&V\)/i.test(marketName);

/** Which curated crop a row belongs to, and the unit its price is really in. */
function resolve(cid: number, marketName: string, unitLabel: string): { crop: (typeof CROPS)[number]; unit: 'qtl' | 'bundle' | undefined } | null {
  const unit = UNIT_OF[unitLabel.toLowerCase()];
  if (cid === CORIANDER_LEAVES) {
    const crop = CROP_BY_AGM_ID.get(isFv(marketName) ? CORIANDER_LEAVES : CORIANDER_SEED);
    return crop ? { crop, unit: unit === 'bundle' ? 'qtl' : unit } : null;
  }
  const crop = CROP_BY_AGM_ID.get(cid);
  return crop ? { crop, unit } : null;
}

export type DayReport = {
  /** curated cropId -> marketId -> quote */
  quotes: Map<number, Record<string, DayQuote>>;
  /** non-curated commodities seen: id -> { name, mandis } (for the crop watch) */
  uncurated: Record<string, { name: string; mandis: number }>;
  /** rows skipped because their price unit didn't match the crop's unit */
  unitSkipped: number;
  /** mandis that reported anything (incl. "NIL transaction") */
  reporting: number;
};

/**
 * Shape a market-wise daily report. Per (crop, mandi), across varieties/grades:
 * min = lowest min, max = highest max, modal = arrival-weighted modal (plain mean if no arrivals),
 * arrivals = sum. Aliases of a crop are merged into its primary id.
 */
export function parseDayReport(json: any): DayReport {
  const out: DayReport = { quotes: new Map(), uncurated: {}, unitSkipped: 0, reporting: 0 };
  const acc = new Map<string, { lo: number; hi: number; ws: number; w: number; s: number; n: number }>(); // "crop:mkt"
  for (const st of Array.isArray(json?.states) ? json.states : []) {
    for (const m of Array.isArray(st?.markets) ? st.markets : []) {
      const mkt = Number(m?.marketId);
      if (!Number.isFinite(mkt)) continue;
      out.reporting++;
      for (const c of Array.isArray(m.commodities) ? m.commodities : []) {
        const cid = Number(c?.commodityId);
        if (!cid) continue; // "NIL Transaction" entries carry no id
        if (!CROP_BY_AGM_ID.has(cid)) {
          const u = (out.uncurated[cid] ??= { name: String(c.commodityName ?? cid), mandis: 0 });
          u.mandis++;
          continue;
        }
        for (const r of Array.isArray(c.data) ? c.data : []) {
          const p = num(r?.modalPrice);
          if (p === null) continue;
          const res = resolve(cid, String(m.marketName ?? ''), String(r?.unitOfPrice ?? ''));
          if (!res) continue;
          const { crop } = res;
          if (res.unit !== crop.unit) { out.unitSkipped++; continue; }
          const key = `${crop.id}:${mkt}`;
          const a = acc.get(key) ?? { lo: Infinity, hi: -Infinity, ws: 0, w: 0, s: 0, n: 0 };
          const arr = num(r?.arrivals) ?? 0;
          a.ws += p * arr; a.w += arr; a.s += p; a.n++;
          a.lo = Math.min(a.lo, num(r?.minimumPrice) ?? p);
          a.hi = Math.max(a.hi, num(r?.maximumPrice) ?? p);
          acc.set(key, a);
        }
      }
    }
  }
  for (const [key, a] of acc) {
    const [crop, mkt] = key.split(':');
    const modal = Math.round(a.w > 0 ? a.ws / a.w : a.s / a.n);
    const q: DayQuote = [Math.round(Math.min(a.lo, modal)), Math.round(Math.max(a.hi, modal)), modal, Math.round(a.w * 100) / 100];
    const rec = out.quotes.get(Number(crop)) ?? {};
    rec[mkt] = q;
    out.quotes.set(Number(crop), rec);
  }
  return out;
}

async function getJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { ...HEADERS, ...init?.headers }, signal: AbortSignal.timeout(120_000), cache: 'no-store' });
  if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} ${url.replace(BASE, '')}`);
  return res.json();
}

/** Every commodity in the given mandis on one date (YYYY-MM-DD). */
export async function fetchDay(date: string, marketIds: number[]): Promise<DayReport> {
  return parseDayReport(await getJson(`${BASE}/prices-and-arrivals/market-report/daily`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, marketIds, stateIds: STATES.map((s) => s.id), includeExcel: false }),
  }));
}

export type AgmMarket = { id: number; name: string; district: number; state: number };

/** Agmarknet's current list of mandis in the given districts (for the market watch). */
export async function fetchMarketList(districtIds: number[]): Promise<AgmMarket[]> {
  const d = (await getJson(`${BASE}/daily-price-arrival/filters`)).data;
  const want = new Set(districtIds);
  return (Array.isArray(d?.market_data) ? d.market_data : [])
    .filter((m: any) => want.has(m.district_id))
    .map((m: any) => ({ id: m.id, name: String(m.mkt_name), district: m.district_id, state: m.state_id }));
}

const CROP_BY_AGM_NAME = new Map(CROPS.map((c) => [c.agm.toLowerCase(), c.id]));

/** cropId -> MSP from a dashboard response. */
export function parseMsp(json: any): Record<number, number> {
  const out: Record<number, number> = {};
  for (const r of Array.isArray(json?.data?.records) ? json.data.records : []) {
    const id = CROP_BY_AGM_NAME.get(String(r?.cmdt_name ?? '').toLowerCase());
    const msp = num(r?.msp_price);
    if (id && msp) out[id] = msp;
  }
  return out;
}

/** Current MSPs for our crops: one dashboard call (MSP is national; MP is used as the state). */
export async function fetchMsp(): Promise<Record<number, number>> {
  return parseMsp(await getJson(`${BASE}/dashboard-data/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dashboard: 'marketwise_price_arrival',
      date: new Date().toISOString().slice(0, 10), // ignored upstream, but required
      group: [100000], commodity: CROPS.map((c) => c.id), variety: 100021, state: 19,
      district: [100007], market: [100009], grades: [4], limit: 100, format: 'json',
    }),
  }));
}
