# Data sources: what the old app used and what works today

> Verified live on **2026-10-02** from a dev machine (curl + browser).

## Summary

| Source | Used by old app? | Status 2026-10 | Good for |
|---|---|---|---|
| `agmarknet.gov.in/SearchCmmMkt.aspx` (HTML scrape) | **Yes, the only data source** | ❌ **Dead.** The URL now serves the Agmarknet 2.0 React app; the HTML table no longer exists. | — |
| `agmarknet.gov.in/MarketWiseGraph/...` (Selenium metadata) | Yes, one-off | ❌ Dead (same reason) | — |
| **Agmarknet 2.0 API** `https://api.agmarknet.gov.in/v1/` | No (new) | ✅ Partly public (details below) | Latest prices, all IDs/metadata |
| data.gov.in OGD API (mandi price datasets) | No | ⚠️ Unverified. TLS handshake reset from this machine (server-side filter). Retest from an Indian network or phone. | Daily prices, possibly history |
| Google Finance CBOT soybean | Manually exported CSV | n/a (never an API) | Global price comparison |
| MongoDB Atlas `cluster0.9fjpr` / `CropsRealPrices` | Yes | ❓ Not tested (no `.env` locally). Last data written 2025-01-10. | Historical backfill 2020–2025 if the cluster still exists |
| Streamlit app `vivek-agri.streamlit.app` | Yes | Returns 303 (probably asleep or at the auth wall) | — |

**Biggest finding:** Agmarknet moved to **Agmarknet 2.0** (go-live **7 Nov 2025**). All IDs
changed. For example, Madhya Pradesh was `MP` and is now `19`. The Shajapur market was a plain
name and is now `Shajapur APMC`, id `2097`.

---

## Agmarknet 2.0 API: `https://api.agmarknet.gov.in/v1/`

JSON over HTTPS, called by the agmarknet.gov.in SPA. Endpoints marked "public" below need no auth
(tested with plain curl, no cookies). This is an **undocumented internal API**, so it may change
without notice. Wrap it behind one adapter module.

### 1. `GET /daily-price-arrival/filters` ✅ public

All master data in one call (~525 KB). Response: `{status, message, data:{...}}`.

| key | count | shape |
|---|---|---|
| `cmdt_data` | 605 | `{cmdt_id, cmdt_name, cmdt_group_id}` |
| `cmdt_group_data` | 16 | `{id, cmdt_grp_name}` |
| `state_data` | 37 | `{state_id, state_name}` (MP = 19) |
| `district_data` | 751 | `{id, state_id, district_name}` (MP has 55) |
| `market_data` | 4172 | `{id, mkt_name, state_id, district_id}` (MP has 435) |
| `variety_data` | 2154 | `{id, cmdt_id:[...], variety_name}` |
| `grade_data` | 18 | `{grade_id, grade_name, cmdt_id:[...]}` (FAQ = 4) |
| `type_data` | 3 | Price=100004, Arrival=100005, Both=100006 |
| `range_data` | 1 | Allowed date ranges: **price/arrival from 2021-01-01**, max 1-year span per query; "both" only from 2025-11-07 |

The "All …" sentinel IDs differ between this endpoint and the dashboard (see below), so check them per endpoint.

### 2. `POST /dashboard-data/` ✅ public: latest prices

The homepage widget ("Market Wise Price & Arrival"). Body (JSON):

```json
{
  "dashboard": "marketwise_price_arrival",
  "date": "2026-09-30",
  "group": [100000],          // all commodity groups
  "commodity": [1],           // cmdt_id list, or [100001] = all
  "variety": 100021,          // all varieties
  "state": 19,                // single int; 100006 = all states
  "district": [328],          // or [100007] = all
  "market": [2097],           // or [100009] = all
  "grades": [4],              // FAQ
  "limit": 50,
  "format": "json"
}
```

Response record (verified for Wheat @ Shajapur APMC):

```json
{"cmdt_name":"Wheat","cmdt_grp_name":"Cereals","msp_price":"2585.00",
 "as_on_price":"2800.00","one_day_ago_price":"2575.94","two_day_ago_price":"2770.00",
 "as_on_arrival":"65.64","one_day_ago_arrival":"68.12","two_day_ago_arrival":"7.19",
 "reported_date":"30-09-2026","trend":"up"}
```

- Prices are ₹/quintal and arrivals are metric tonnes. Numbers come back as strings and can be `null`.
- Includes the **MSP**, which the old app never had.
- Paginated: `pagination.{total_count,total_pages,next_page}`.
- ⚠️ **The `date` field is ignored.** It always returns the latest 3 reported days, even when you ask for 2025-03-15. So this endpoint can't backfill history. It's only good for a daily "today" snapshot.
- Not confirmed: whether `as_on_price` is the modal price or an average. Only one price per day is returned, with no min/max.

### 3. `POST /daily-price-arrival/report` 🔒 captcha / token

This is the full report (per-market, date range, min/max/modal). A call without credentials returns
`{"detail":"Captcha key and captcha value are required.","code":"TOKEN_OR_CAPTCHA_REQUIRED"}`.
Params used by the SPA include `from_date`/`to_date` (yyyy-MM-dd), `commodities`, `states`, `districts`,
`markets`, `grades`, `variety`, `page`, `itemsPerPage`.
The error says a **token** is accepted instead of a captcha. The SPA has `guest-login/send-otp`
(mobile-number OTP login) and `/api-config` / `apiconfigurationlist` admin pages, which suggests
official API keys exist for registered users.
**Do not automate the captcha.** Options: request API access from Agmarknet/DMI, use
data.gov.in, or have a logged-in user's token drive a manual "sync" (check the terms first).

### Other endpoints seen in the bundle (untested)
`/dashboard-filters/?dashboard_name=marketwise_price_arrival`, `/commoditywisemajormarkets`,
`/commoditypricelastweek*`, `/abovemspmarketprice`, `/belowMSPmarketprice`, `/gis-market-atlas`,
`/importantcommodities`, district weekly/monthly analysis reports. Worth probing for history.

---

## data.gov.in (Open Government Data) ⚠️ retest

The official, documented, key-based API (`https://api.data.gov.in/resource/<id>?api-key=…&format=json&filters[state.keyword]=…`).
Free API key on signup. Known mandi datasets:
- `9ef84268-d588-465a-a308-a864a43d0070`: *Current daily price of various commodities from various markets (Mandi)*. Today only.
- `35985678-0d79-46b4-9ed6-6f13308a1d24`: *Variety-wise daily market prices*. Supports historical filtering.

From this machine, TCP:443 connects but the TLS handshake is reset (`SSL_ERROR_SYSCALL`), with both
curl/LibreSSL and Python, inside and outside the sandbox. `data.gov.in` itself returns 200. This is
probably a WAF or geo filter. **Retest from an Indian ISP or a phone** before choosing it. If it
works, it's the most "legit" source for a production app: documented, keyed, and published for reuse.

---

## ID mapping files (in this folder)

- `commodities_of_interest.csv`: the 11 crops with Hindi names and Agmarknet 2.0 `cmdt_id`.
- `mp_markets_agmarknet2.csv`: all 435 MP markets with new `market_id` and district.
- `mp_markets_old_to_new.csv`: the old 81 markets mapped to new IDs. **9 have no automatic match**
  (Bercha(F&V), Nalkehda, Hatpiplya(F&V), Sonkachh(F&V), Mhow, Mhow(F&V), Jawad(F&V),
  Jirapur(F&V), Khaachrod(F&V)). They may have been renamed or merged, so map them by hand.

Shajapur district = 328, Ujjain = 335. Wheat = 1, Soyabean = 13, Onion = 23, Garlic = 25.

---

## Security (action needed)

- The **MongoDB Atlas connection string, including username and password**, for `cluster0.9fjpr.mongodb.net`
  is in the git history of the **public** GitHub repo (first added in `b825a8a`; `git log --all -S 'mongodb+srv'` lists them).
  **Rotate that DB user's password / delete the user.** Rewriting history isn't enough once it's public.
- The Streamlit admin password is hard-coded in `frontend/main.py`.

## Implications for the new design (Next.js web app on Vercel + MongoDB Atlas)

- Call `api.agmarknet.gov.in` **from server code only**. Browsers are blocked by CORS, and server
  calls let us cache and rate-limit.
- Mongo is accessed only from server code, with the connection string in Vercel env vars. The browser
  never sees it.
- History is the hard part. Today's prices are freely available. Multi-year history needs the old
  Mongo data (if it still exists), data.gov.in, or official Agmarknet API access.
