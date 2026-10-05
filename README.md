# fasal-bazar · फसल बाज़ार

Wholesale mandi prices for farmers in Malwa (Madhya Pradesh) and Hadoti (Kota, Jhalawar in Rajasthan).
**Crop-first:** pick your crop, see every mandi's price, and decide where to sell.
Next.js on Vercel and MongoDB Atlas M0, built to stay inside the free tiers.

- **Crops** `/`: search plus "my crops", and 40 curated crops grouped as cereals, pulses, oilseeds,
  spices, vegetables and fruit.
- **Crop page** `/<crop>`: every mandi across 9 districts, highest price first, with district chips
  (all / my district / each district), change since the last price, arrivals, the weekly trend, MSP,
  and a history chart (3M / 1Y / all years).
- **Analysis** `/<crop>/analysis`: is today's price good (vs 30 days, last year, MSP), best mandi,
  mandi comparison, and which months usually pay best. An **Arrivals** tab shows weekly arrivals (bars)
  against the price (line) for 3 months / 1 year, and each mandi's share of the last 30 days. Per district or all.
- **Login with admin approval**: sign up with name, mobile number and a 4-digit PIN (number keypad only),
  plus district and language. Hindi or English UI.
- **Admin** `/admin`: approve, reject or block users; reset passwords; see usage; see the **mandi watch**
  (new or missing mandis on Agmarknet) and the **crop watch**; refresh prices.

**Crop photos** (`public/crops/*.webp`, ~4 KB each) are free-licensed Wikimedia Commons images, chosen to show the
produce as sold in a mandi. Credits are on `/credits`, linked from Settings.

**Scope:** 7 MP districts (Agar Malwa, Dewas, Indore, Neemuch, Rajgarh, Shajapur, Ujjain) and 2 Rajasthan
districts (Jhalawar, Kota), which is 95 mandis and 40 crops. Districts and crops are chosen in
[`scripts/gen-master.ts`](scripts/gen-master.ts). Mandis in those districts come from Agmarknet's master
list automatically.

## How it works

```
GitHub Actions (19:00 + 08:00 IST) ─► npm run daily ─► api.agmarknet.gov.in market-wise daily report
                                           │            (1 call = 1 date × every crop × every mandi)
                                           ▼
                  MongoDB `daily` (+ `monthly`, `meta`) ─► static pages (ISR) ◄─ /api/revalidate
```

- **Source:** Agmarknet 2.0's public *Market-wise, Commodity-wise Daily Report*
  (`/v1/prices-and-arrivals/market-report/daily`). It's public, with no captcha and no login. It has
  history back to 2002. MSPs come from the homepage dashboard, and the mandi list from
  `/v1/daily-price-arrival/filters`.
- **Data** (details: [`docs/DB_CHANGES.md`](docs/DB_CHANGES.md)):
  - `daily`: one doc per crop per day (`"13:2026-10-03"`), with `[min, max, modal, arrivals]` per mandi.
  - `monthly`: one doc per crop per completed month, with `[avg modal, days]` per mandi.
  - `meta`: job status, MSPs, cursors, crop picker data, mandi and crop watch.
  - `users`: accounts.

  Names, Hindi labels, groups and districts live in code (`src/lib/master.ts`), linked by Agmarknet IDs.
- **Daily job:** fetches today plus 2 days back for late reports (3 calls), the mandi list (1 call) and MSPs (1 call).
  It writes about 25–37 new docs per date and writes last month's summary once on the 1st. It refreshes the
  crop picker data and flags new, missing or renamed mandis. New mandis' prices are stored immediately; add
  them to `gen-master.ts` with a Hindi name to show them in the app.
- **Data quirk:** Agmarknet files coriander seed from grain mandis under "Coriander (Leaves)" and labels
  real leaves "per bundle" although they're priced per quintal. The parser corrects both, so every crop is ₹/quintal.
- **Rate limit:** Agmarknet returns HTTP 429 for about 5 minutes after a burst, so calls are sequential with a 1 s pause.
- **Pages** are static per language and crop (2 × 40 crop pages + 2 × 40 analysis pages). District
  filtering happens in the browser. A page re-renders after the daily job marks it stale. Chart data is
  served separately (`/<crop>/history`, `/<crop>/arrivals`, also static) and fetched only when shown.
- **Auth:** `src/proxy.ts` checks a signed session cookie on every page (no DB call) and serves the user's
  language at the same URL. Accounts need admin approval. Login is mobile + PIN (hashed with scrypt; 5 wrong tries lock it for 30 min). A daily
  `/api/me` ping records usage and logs out blocked users within about a day.

## Setup

```bash
npm install
cp .env.example .env.local   # MONGODB_URI, AUTH_SECRET, CRON_SECRET
npm run db:setup             # idempotent: creates collections, prints stats
npm run admin:create         # your admin account: mobile + 6–8 digit PIN (typed hidden)
npm run backfill -- --until=2025-09-01   # last ~13 months, all crops (~17 min)
npm run daily                # today + mandi/crop watch + MSPs
npm run dev
```

| Script | What it does |
|---|---|
| `npm run daily` | The daily job (what GitHub Actions runs) |
| `npm run backfill -- --until=YYYY-MM-DD [--from=YYYY-MM-DD]` | Day-by-day history, newest first, resumable (Ctrl-C safe) |
| `npm run gen:master [-- --refresh]` | Regenerate crops/districts/mandis; `--refresh` re-downloads Agmarknet's master list |
| `npm run db:setup` | Create collections (idempotent) and print stats |
| `npm run convert` | One-time: legacy district-keyed `days`/`months` → `daily`/`monthly` (done 2026-10-04) |
| `npm run admin:create` | Create or reset an admin account (mobile + 6–8 digit PIN) |
| `python3 scripts/crop-photos.py [slug…]` | Re-download crop photos from Wikimedia Commons (choices and crop boxes are listed in the script) |
| `npm test` | Unit tests (parser fixtures, shaping, analysis, auth) |

| Env var | Required | Meaning |
|---|---|---|
| `MONGODB_URI` | yes | Atlas connection string (server-only) |
| `MONGODB_DB` | no | Database name, default `fasal_bazar` |
| `AUTH_SECRET` | yes | Signs login cookies, 32+ random characters. Changing it logs everyone out. |
| `CRON_SECRET` | yes (prod) | Protects `/api/revalidate` and `/api/ingest` for scripts. Same value in Vercel and GitHub. |

## Adding a district, mandi or crop
- **District:** add it to `DISTRICTS` in `scripts/gen-master.ts`, run `npm run gen:master -- --refresh`, add
  Hindi names for any new mandis it lists, then backfill.
- **Mandi** (flagged by the mandi watch): `npm run gen:master -- --refresh`, then add its Hindi name to `MARKET_HI`.
- **Crop:** add it to `CROPS` in `scripts/gen-master.ts` (the crop watch on `/admin` shows candidates), then backfill.

## History (backfill phases)
- **Converted:** the 11 original crops in MP, 2002 → today (no API calls).
- **Phase A (done):** Sep 2025 → today, all 40 crops, all 95 mandis.
- **Phase B (later):** 2016 → Aug 2025, in yearly chunks of ~16 min, for example
  `npm run backfill -- --from=2025-08-31 --until=2025-01-01`.
- **Phase C:** 2002–2015, skipped (very sparse).

## Triggering a refresh
- GitHub: Actions → **Daily mandi prices** → **Run workflow**.
- Browser: log in as admin, open `/admin`, and press **Refresh prices now**.
- Locally: `npm run daily`.

## GitHub Actions (daily job)
The repo is public, so Actions minutes are free. In Settings → Secrets and variables → Actions, add the secret
`MONGODB_URI` (required), `CRON_SECRET` (to refresh the site's pages) and the variable `APP_URL`.
Atlas → Network Access must allow `0.0.0.0/0`. Mandi changes appear as warnings on the run page.
GitHub pauses scheduled workflows in public repos after 60 days without commits; re-enable them from the Actions tab.

## Deploying to Vercel (Hobby)
1. Import the repo. Set `MONGODB_URI`, `AUTH_SECRET`, `CRON_SECRET` (and `MONGODB_DB` if needed).
2. Atlas → Network Access: allow `0.0.0.0/0`.
3. Deploy. `vercel.json` pins functions to `bom1` (Mumbai).
4. Run `npm run db:setup` and `npm run admin:create` once against the production DB.

## Later
- "Near me": distance-based mandi lists (needs mandi coordinates)
- More districts and states (after the pilot)
- Read-aloud (Hindi), WhatsApp share, add-to-home-screen/offline
- Phase B history (2016 → Aug 2025)
- Forgot-password self-service; instant logout on block
