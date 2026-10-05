# Legacy system: what the old `agri_startup` app was

> Context for the agent building the revamped app in a new repo.
> Source repo: https://github.com/ImVivec/agri_startup (public). Written 2026-10-02.

## Product idea (still valid)

Aggregate wholesale **mandi (APMC market) prices** for crops in the markets near a
farmer, so they can answer:

- **Where to sell now:** which nearby market pays the most today for my crop?
- **When to sell:** is today's price above or below the last week/month/quarter/year average?
- **What to grow next season:** which crops have trended well historically, and how do they compare with MSP?

Target user: farmers in the **Malwa region of Madhya Pradesh** (around Shajapur). Crop
names were shown in Hindi as well as English.

## Scope the old app covered

- **State:** Madhya Pradesh only.
- **Districts of interest (7):** Shajapur, Agar Malwa, Dewas, Indore, Neemuch, Rajgarh, Ujjain.
- **Markets:** 81 APMC markets across those districts. Each town usually has two: a grain mandi and an `(F&V)` fruit & vegetable mandi.
- **Crops (11):** Wheat, Rice, Soyabean, Mustard, Potato, Onion, Tomato, Orange, Garlic,
  Coriander seed, Maize. Hindi names are in `commodities_of_interest.csv`.
- **History:** 2020-01-01 to 2025-01-10. That was the last scrape; the data has not been updated since.

## Architecture (old)

```
agmarknet.gov.in (HTML page) --scrape--> Python (requests + BeautifulSoup)
                                               |
                                               v
                                   MongoDB Atlas  db: CropsRealPrices
                                               |
                                               v
                        Streamlit dashboard (vivek-agri.streamlit.app)
                        + half-finished Flask API (backend/)
```

| Piece | Where | Notes |
|---|---|---|
| Scraper | `backend/service/writer_util.py`, `CandleStick/data_collection/` | Built a GET URL for `SearchCmmMkt.aspx` and parsed the HTML table `cphBody_GridPriceData`. Made one HTTP call per (crop × market × date range). |
| Metadata scraper | `CandleStick/data_collection/metadata_collection.py` | Selenium script that read dropdown option values (commodity, state, district, market IDs) from the old site into CSVs. |
| Scrape state | `backend/cron_data/cron.csv` | Per-crop `first_scrap_date`, `last_scrap_date`, `active`. The code that writes `last_scrap_date` back is commented out. |
| DB | MongoDB Atlas, cluster `cluster0.9fjpr.mongodb.net`, db `CropsRealPrices` | **One collection per crop**, named after the crop (e.g. `Wheat`). |
| UI | `frontend/main.py` (Streamlit + Plotly) | Talks to Mongo directly. |
| API (unfinished) | `backend/` (Flask) | `POST /api/reader/graph`, `/api/reader/analysis/<commodity>`, `/api/reader/get_commodities`, `/api/writer/update/<commodity>`. A user signup/signin controller exists but isn't registered on any route. |
| Experiments | `CandleStick/` | Candlestick charts, local CSV storage, and a manual Google Finance CBOT soybean CSV used for a global-vs-local price comparison (USD price × 272/80 as a rough conversion). No live API is involved. |

## Data model (old Mongo document)

One document per **(District Name, Market Name, formatted_date)** in collection `<Crop>`:

| Field | Type | Example | Meaning |
|---|---|---|---|
| `Sl No` | int | 42 | Row number from the source table (meaningless) |
| `District Name` | str | Shajapur | |
| `Market Name` | str | Shajapur | |
| `Commodity` | str | Wheat | |
| `Variety` | str | Other | |
| `Grade` | str | FAQ | Fair Average Quality |
| `Min Price` | number | 2250 | ₹ / quintal |
| `Max Price` | number | 2505 | ₹ / quintal |
| `Modal Price` | number | 2400 | ₹ / quintal, the most common trading price. **The main metric.** |
| `Price Date` | str | 01 Jan 2023 | |
| `formatted_date` | datetime | 2023-01-01 | Used for range queries |

Upsert key: `{District Name, Market Name, formatted_date}`. Because Variety and Grade aren't in
the key, a market that reports two varieties on the same day overwrites one with the other. This is a bug.

Local CSV snapshots in `CandleStick/dataset/rawdata/*.csv` are small samples (Shajapur only,
2023 to Aug 2024). They are not a full backup of the Mongo data.

## Features in the old dashboard

1. **Average price over time:** mean modal price per day across all markets, filterable by year range (2020–2025). Sundays are excluded.
2. **Market-wise price over time:** one line per selected market.
3. **"Compare from history" stat cards:** today's price, plus average over the last week, month (30d), quarter (90d) and year (365d), each with a % delta.
4. **Admin "Update Data in Atlas":** hard-coded password, one button per crop that runs a scrape.
5. `ANALYSIS.csv`: static India production/consumption/export numbers for a few crops. It's in the repo but not used in the UI.

## Lessons / things not to carry over

- One collection per crop. Use a single `prices` collection with `commodity_id` and a compound index instead.
- Key on the source's numeric IDs (market_id, commodity_id, variety, grade), not display names. Names change: in Agmarknet 2.0 every market got an ` APMC` suffix.
- No idempotent scrape cursor (`last_scrap_date` was never saved).
- Secrets were committed to git (see `02_data_sources_status.md` → Security).
- Hard-coded admin password in the UI.
