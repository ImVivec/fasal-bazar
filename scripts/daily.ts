// Daily job entry point (run by GitHub Actions, or by hand): npm run daily
// Exits 1 if any download failed, so the workflow run shows red and GitHub emails the owner.
// If APP_URL and CRON_SECRET are set, asks the deployed site to rebuild its pages afterwards.
import { client } from '../src/lib/db';
import { runDaily } from '../src/lib/ingest';

const ts = () => new Date().toISOString().slice(11, 19);
let code = 0;
try {
  const r = await runDaily({ log: (m) => console.log(ts(), m) });
  console.log(JSON.stringify(r, null, 2));
  if (!r.ok) code = 1;
  // GitHub Actions annotations: show mandi changes on the run's summary page.
  if (process.env.GITHUB_ACTIONS) {
    for (const m of r.newMarkets) console.log(`::warning title=New mandi found::${m.name} (id ${m.id}, district ${m.district}). Add it to scripts/gen-master.ts (Hindi name) to show it in the app; its prices are already being stored.`);
    for (const id of r.missingMarkets) console.log(`::warning title=Mandi missing from Agmarknet::id ${id} is in our list but no longer in Agmarknet's.`);
    for (const m of r.renamedMarkets) console.log(`::notice title=Mandi renamed::id ${m.id}: "${m.code}" is now "${m.agm}" on Agmarknet.`);
  }

  const { APP_URL, CRON_SECRET } = process.env;
  if (APP_URL && CRON_SECRET && r.dates.some((d) => d.written > 0)) {
    const res = await fetch(`${APP_URL.replace(/\/$/, '')}/api/revalidate`, {
      method: 'POST', headers: { Authorization: `Bearer ${CRON_SECRET}` }, signal: AbortSignal.timeout(30_000),
    }).catch((e) => ({ ok: false, status: String(e) }) as const);
    console.log(ts(), `revalidate ${APP_URL}: ${res.status}`);
    if (!res.ok) code = 1;
  }
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await (await client()).close().catch(() => {});
}
process.exit(code);
