# Database changes

Every change to collections, indexes, document shapes or data migrations is logged here.
All collection/index creation lives in `scripts/db-setup.ts` (`npm run db:setup`, idempotent, never drops).

Database: `fasal_bazar` (set via `MONGODB_DB`) on the existing Atlas cluster. The legacy
`CropsRealPrices` database on the same cluster is left untouched.

## 2026-10-02: initial schema

**Collections**

| Collection | Shape | Purpose |
|---|---|---|
| `prices` | `{ _id: "cropId:districtId:year:marketId", p: { "MMDD": int ₹/quintal } }` | One doc per crop × district × year × market. Bucketed daily prices. |
| `meta` | single doc `_id: "agmarknet"`: `lastRunAt, lastOkAt, lastError, failed[], cursor, latestDate, msp{cropId: ₹}, latest{cropId: date}` | Ingestion state and MSPs. |

**Indexes:** only the default `_id` index on each collection. The page query
("crop X in district Y, last 2 years") is a range scan on `_id`:
`{_id: {$gte: "1:328:2025:", $lt: "1:328:2027:"}}`. `:` sorts after digits, so `1:328:` never
matches `1:3280:`; this is covered by a unit test.

**Writes:** `updateOne({_id}, {$set: {"p.0930": 2800}}, {upsert: true})`, batched into a single
unordered `bulkWrite` per run. Re-running only overwrites the same keys, so it's idempotent.

**Storage estimate**
- One day costs ~10 B (BSON: `"MMDD\0"` key 5 B + type 1 B + int32 4 B).
- A doc holding a full year (~310 reporting days) is ~3.2 KB.
- ~250 market×crop pairs actually report in the 7 districts × 11 crops → **~0.8 MB/year**.
  Worst case, all 83 markets × 11 crops = 913 pairs → **~2.9 MB/year**.
- `_id` index: under 100 KB/year. `meta`: under 2 KB.
- The M0 limit is 512 MB, so this lasts for decades.

**Why:** two collections, no secondary indexes, short keys, ints, and only the price field the UI uses
(arrivals, variety and grade are dropped). Master data (crops, districts, markets) lives in
`src/lib/master.ts`, not in Mongo.

## 2026-10-02 (later): switch source to the date-wise report, backfill from 2015

**What changed**
- **Value semantics of `prices.p`:** each value is now the day's **modal price, weighted by arrivals
  across varieties**, from the date-wise report. Before, it was the dashboard's single averaged
  price. The document shape is unchanged. The backfill and daily runs overwrite the same `p.MMDD`
  keys, so the earlier dashboard values for 28 Sep – 2 Oct are replaced in place. Nothing was deleted.
- **`meta`:** added `backfill: { next: "YYYY-MM" | null, i: <crop index>, from: "2015-01", doneAt? }`,
  the resumable backfill cursor. Removed (`$unset`) the old `cursor` field from the per-market
  dashboard design.
- **Collections / indexes:** no change (still `prices` + `meta`, `_id` indexes only).

**Storage:** about 12 years × ~250–400 active market×crop pairs × ~3.2 KB/doc-year
≈ **10–15 MB**. Worst case, every market×crop pair every year, is ≈ 35 MB. Either way that's well under 512 MB.

## 2026-10-02 (later): `users` collection for login and approval

**New collection `users`** (created by `npm run db:setup`): one doc per account.

```js
{ _id: "ramesh01",            // user ID, lower-case; unique because it's the _id
  pw: "scrypt$<salt>$<hash>", // never the plain password
  ph: "9876543210",           // mobile number
  d: 335,                     // home district id
  l: "hi",                    // language: "hi" | "en"
  role: "user",               // "user" | "admin"
  st: "pending",              // "pending" | "approved" | "rejected" | "blocked"
  at: Date,                   // signed up
  apAt: Date, by: "vivek",    // approved at / last admin action by
  last: "2026-10-02", days: 6,// activity: last day seen (IST), number of days used
  fails: 0, lockUntil: Date } // login lockout after 8 wrong passwords (15 min)
```

**Indexes:** only `_id`. Login is a lookup by `_id`, and the admin list is a full scan of a
collection with fewer than 100 docs. Phone numbers are not unique: family members can share a phone.

**Writes:** signup (1 insert), login (0–1 updates), daily ping (at most 1 update per user per day),
admin actions.

**Storage:** about 250 B per user, so under 25 KB even at 100 users.

**Also created during testing:** a separate database `fasal_bazar_test` (`prices`, `meta`,
`users`), holding two test accounts (`testadmin`, `testfarmer1`). It's safe to drop. Ask before
dropping, per the rule above.

## 2026-10-02 (later): new price structure, `days` + `months` (replaces `prices`)

**Why:** with `prices` (one doc per crop × market × year) the daily job touched ~400 docs a day.
With one doc per district per day, a new day is simply 7 new docs.

**New collection `days`**: one doc per (district, date) with every crop and mandi reported that day.
```js
{ _id: "328:2026-10-02",                        // districtId : date
  c: { "13": { "2097": [5100, 5900, 5680, 412.5],  // crop 13 @ market 2097: [min, max, modal, arrivals t]
               "1086": [...] },
       "1":  { ... } } }
```
- Prices are ₹/quintal ints; arrivals are tonnes (2 dp). Across varieties: min = lowest min,
  max = highest max, modal = arrival-weighted modal, arrivals = sum.
- No trading means no doc (Sundays and holidays).
- The page query is an `_id` range for one district plus a projection of one crop (`c.13`).

**New collection `months`**: one summary doc per (district, **completed** month), written once.
```js
{ _id: "328:2026-09", c: { "13": { "2097": [5612, 24] } } }   // [avg modal, days reported]
```
Used by the "All" chart, so it doesn't read every daily doc. The current month is averaged on the fly from `days`.

**Indexes:** `_id` only on both.

**`meta`:** new field `daysBackfill: { next, emptyRun, startedAt, earliest, doneAt }`, the cursor for
the new backfill. The old `backfill` field is now unused.

**`prices`:** no longer read or written by the app. `db:setup` no longer creates it. It still holds
1,452 docs (~1.8 MB, Mar 2022 – Oct 2026, old format). **Drop only after approval**, once `days`
covers that period.

**Backfill result (finished 2026-10-03):** 309 months (Oct 2026 back to **Feb 2002**, the start of
Agmarknet's data for these districts), 3,399 API calls, about 3 h 53 min, with no failures.

| Collection | Docs | Data size | On disk |
|---|---|---|---|
| `days` | 48,143 | 26.8 MB | 17.2 MB |
| `months` | 1,839 | 1.1 MB | 0.7 MB |

Growth from here is about 1.8 MB/year (~2,100 day docs/year).

## 2026-10-03: `prices` dropped; daily job live on the new structure

- **Dropped `prices`** (1,452 docs, ~1.8 MB, old per-crop-year format) with the owner's approval.
  Everything in it is covered by `days` (Feb 2002 → today).
- **`meta` cleanup:** removed the unused `backfill`, `cursor` and `latest` fields from earlier designs.
  Added `monthSummaryUpTo: "YYYY-MM"`, the last month that has `months` summaries; the daily job uses it
  to write each month's summary exactly once.
- **Daily job writes** (GitHub Actions, twice a day): upserts `days` docs only for **today and the
  previous 3 days** (~7–28 small docs). Older days are never touched. On the 1st of a month it also writes
  last month's `months` summary (7 docs). No new collections or indexes.
- Collections now: `days`, `months`, `meta`, `users`.

## 2026-10-04: crop-keyed `daily` / `monthly`, curated crops, Rajasthan, market watch

**Why:** the app is now crop-first ("this crop in every mandi"). With district-keyed docs a crop page
read about 9 × 300 docs; crop-keyed it reads about 300. The data source also switched to Agmarknet's
market-wise daily report: 1 call per date covers every commodity in every listed mandi.

**New collection `daily`** (replaces `days`): one doc per (crop, date).
```js
{ _id: "13:2026-10-03",                      // cropId : date
  m: { "2097": [1100, 5790, 5400, 691.61],   // mandi 2097: [min, max, modal, arrivals t]
       "634":  [ ... ] } }                   // all 95 mandis, both states
```
**New collection `monthly`** (replaces `months`): one doc per (crop, completed month).
```js
{ _id: "13:2026-09", m: { "2097": [5018, 20] } }   // [avg modal, days reported]
```
- **Indexes:** `_id` only. A crop page is `_id` ranges `13:<from>`–`13:<to>` on both collections.
- **Writes:** the daily job upserts about 25–37 docs per date (one per crop traded), for today plus 2 days of
  late reports. Older days are never touched. Month summaries are written once, after the month ends.
- **Units:** all curated crops are ₹/quintal. Agmarknet labels coriander leaves "Rs./Bundle", but the
  prices are per quintal, and grain mandis file coriander seed under "Coriander(Leaves)". Those rows are
  counted as coriander seed. Rows in other units are skipped and counted.

**Conversion (2026-10-04):** legacy `days`/`months` were reshaped into `daily`/`monthly` inside MongoDB:
544,736 daily entries into 68,214 docs, and 37,299 monthly entries into 2,708 docs. Every entry was
verified with **0 mismatches**. This used no Agmarknet calls, because the market-wise report was checked
to give identical values for past dates.

**Phase A backfill (2026-10-04):** every day from 2026-10-04 back to 2025-09-01, all 40 curated crops and
all 95 mandis (MP + Kota and Jhalawar in Rajasthan), about 400 calls. Phase B (2016 → 2025-08) runs later
in chunks; Phase C (2002–2015) is skipped.

**`meta` additions:**
- `fill: { next, until, startedAt, doneAt }`: day-by-day backfill cursor.
- `active: { cropId: { date, mandis, lo, hi } }`: crop picker data (last 60 days). Rebuilt by the daily job.
- `marketWatch: { checkedAt, added[], missing[], renamed[] }`: mandis in our districts on Agmarknet but
  not in the code list (their prices are already fetched and stored), or the reverse. Shown on `/admin`
  and as GitHub Actions warnings.
- `cropWatch: { agmId: { name, firstSeen, lastSeen, days } }`: non-curated commodities trading in our
  mandis, to inform the curated list.

**`users`:** unchanged. `d` can now be a Rajasthan district (502 Jhalawar, 508 Kota).

**Pending (needs approval, already given):** drop legacy `days` and `months` once the new pages are verified.
- **2026-10-04: dropped legacy `days` (48,143 docs) and `months` (1,839 docs)** with the owner's approval, after
  the conversion verified 0 mismatches and the crop-first pages were checked on the new collections.
  Collections now: `daily`, `monthly`, `meta`, `users`.

## 2026-10-04: `users` keyed by mobile number; PIN instead of username/password

**Why:** farmers found typing an English user ID plus a password hard. Login is now mobile number + 4-digit PIN,
typed on the number keypad.

**New shape** (one doc per account):
```js
{ _id: "9876543210",          // mobile number (10 digits), unique
  n: "रमेश पटेल",              // name (any script)
  pin: "scrypt$<salt>$<hash>", // hashed PIN (4 digits for farmers, 6–8 for admins); never stored plain
  d: 508, l: "hi", role: "user", st: "pending", at: Date,
  apAt?, by?, last?, days?, fails?, lockUntil? }
```
- Removed fields: `pw` (password hash) and `ph` (the phone is now the `_id`). No indexes changed.
- Lockout is tighter for PINs: 5 wrong tries lock the account for 30 minutes (was 8 tries → 15 minutes).
  The admin's "Set new PIN" also clears a lock.
- **Migration:** there is no automatic migration. The only real account, the admin `vivek_patidar`, is in the
  old format and can't log in with mobile + PIN. Create the admin again with `npm run admin:create` (mobile +
  6–8 digit PIN). The old doc can then be deleted, on approval.
- The test database `fasal_bazar_test` gained 2 test accounts in the new format (9000000009 admin, 9000000002 farmer).
