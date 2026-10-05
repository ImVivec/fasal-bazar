// Backfill `daily` (+ `monthly`) day by day, newest -> oldest, from Agmarknet's market-wise report.
// Resumable: stop any time (Ctrl-C) and run the same command again; the cursor lives in meta.fill.
// Waits out rate limits (429), outages (5xx) and network/DB drops instead of failing.
//   npm run backfill -- --until=2025-09-01                 Phase A (from today)
//   npm run backfill -- --from=2025-08-31 --until=2025-01-01   one chunk of Phase B
import { client } from '../src/lib/db';
import { runFill } from '../src/lib/ingest';

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const until = arg('until');
if (!until || !/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new Error('usage: npm run backfill -- --until=YYYY-MM-DD [--from=YYYY-MM-DD]');
const from = arg('from');

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
for (;;) {
  try {
    const r = await runFill({ from, until, log: (m) => console.log(ts(), m) });
    console.log(ts(), JSON.stringify(r));
    if (r.done || r.stoppedBy !== 'failed') break;
    console.log(ts(), 'Agmarknet unavailable; retrying in 10 min');
    await sleep(10 * 60_000);
  } catch (e) {
    console.log(ts(), `error: ${e instanceof Error ? e.message : e} → retrying in 2 min`);
    await sleep(2 * 60_000);
  }
}
await (await client()).close();
