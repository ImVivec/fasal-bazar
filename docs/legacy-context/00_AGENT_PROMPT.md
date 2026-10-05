# Prompt for the build agent

> Copy this whole `legacy-context/` folder into the new repo under `docs/legacy-context/`, then give
> the agent the prompt below.

---

You're building **fasal-bazar**, a mobile-friendly **web app** that shows Indian farmers today's
wholesale mandi prices for their crops in nearby markets, plus how prices have moved. It rewrites an
old student project. Don't port its code; only its idea and hard-won knowledge carry over.

**Read first:** `docs/legacy-context/01_legacy_system.md` (what the old app did and its mistakes) and
`docs/legacy-context/02_data_sources_status.md` (which government APIs work as of Oct 2026, with
request and response shapes). The CSVs there map crops and markets to current Agmarknet 2.0 IDs.
Treat those docs as findings, not gospel. Re-verify an endpoint before building on it.

## Priorities, in order

1. **Make it work end to end, small.** We ship a thin working version first and add features later
   in separate iterations. If something isn't on the v1 list below, don't build it. Note it in the README's "Later" list instead.
2. **Cheap.** Free tiers only: Vercel Hobby and MongoDB Atlas M0 (512 MB). Minimise stored bytes,
   document count, indexes, Mongo round-trips and function invocations. Choose cheap over clever.
3. **Simple code** that's easy to extend later. Target ~20–50 users.

You're trusted to make good engineering calls on the details. When a decision is expensive to reverse,
or depends on something only I know, ask me instead of guessing.

## v1 scope (only this)

- **Prices page:** pick a crop and see the latest price in each mandi in the user's district/area,
  sorted high → low, with the reported date and the change vs. the previous day. Show the MSP if available.
- **History chart:** the same crop over time for the selected mandis, from whatever history we
  have stored.
- **Settings in the browser:** home district and favourite crops, saved in localStorage. No login.
- **Data refresh:** a daily Vercel Cron job, plus a protected "refresh now" endpoint/button for
  maintainers. The secret comes from an env var.
- Crop names in **English + Hindi**. UI text is English for now, with strings kept in one place so
  Hindi is easy to add later.
- Mobile-first, light pages, fast on slow networks.

Default scope: Madhya Pradesh, the 7 districts and 11 crops listed in the legacy docs.

**Later (not v1):** "is today a good price" comparisons, "what to grow" analysis, full Hindi UI,
backfilling 2020–2025 history from the old database, data.gov.in as a second source, more states.

## Stack

- Next.js (App Router) + TypeScript on Vercel. Use a lightweight chart library and simple styling.
- Use the official MongoDB Node driver with one cached `MongoClient`. No ORM.
- **Mongo and Agmarknet are accessed only from server code.** The connection string lives in Vercel
  env vars / `.env.local` (git-ignored) and never reaches the browser. Provide `.env.example`.
- Cache pages and queries aggressively, since data changes about once a day. Revalidate after each ingestion run.

## Data and MongoDB: cheap first, minimal collections

You're free to design the data model; the legacy model was wasteful. Guidance:

- **As few collections as possible.** A likely shape is just two:
  - one collection for price data;
  - one tiny collection for ingestion state (last successful run per source/crop, last error).
- **Static master data stays out of Mongo.** Crops (with Hindi names), districts and markets go in a
  JSON/TS file in the repo, generated from the CSVs in the docs. It changes rarely, so it's free to serve and needs no queries.
- **Store compactly.** Consider a bucket pattern, e.g. one document per (market, crop, month or year)
  holding a compact array of daily `[day, min, max, modal]` values. Use short field names and numeric
  IDs instead of repeated strings. Store only the fields the UI uses. Keep indexes minimal: ideally just
  the one the main query needs. Estimate the storage footprint and put the numbers in the README.
- Writes must be **idempotent upserts**. Re-running ingestion must never duplicate data.
- Agmarknet's public dashboard endpoint returns only the latest ~3 days, so a daily cron builds
  history going forward. Don't burn time on historical backfill in v1.
- **Never bypass the captcha** on Agmarknet's report endpoint and never scrape behind a login.

### Reporting Mongo changes to me (required)

I need to know about every change to the database.
- Put all collection and index creation in **one idempotent setup script** (e.g. `npm run db:setup`).
  Never create collections or indexes ad hoc in app code.
- Whenever you add or change a collection, an index, a schema shape, or a data migration, **tell
  me explicitly** in your message: what changed, why, and its rough storage cost. Also log it in
  `docs/DB_CHANGES.md`.
- If you have DB access in your environment, run the setup script yourself and show me the result.
  If you don't, give me the exact command to run.
- Never drop or delete collections/data without asking me first.

## Quality bar (keep it light)

- Unit tests for the Agmarknet adapter (using a recorded JSON fixture) and for the data-shaping logic.
- Handle `null`s, string-typed numbers, missing days and Sundays from upstream without crashing.
  Show "last updated" honestly.
- Short README: setup, env vars, `db:setup`, triggering a refresh, deploying to Vercel, and the "Later" list.

## How to work

1. Re-verify the Agmarknet 2.0 endpoints in the docs and report briefly, in a few lines.
2. Propose the data model (with a storage estimate) and the page list, then wait for my OK.
3. Build one thin slice: one crop × one district → ingest → Mongo → prices page. Show me. Then
   widen to all v1 crops and districts.
4. Stop at the end of v1 and summarise what's done, what's next, and the DB changes made.
