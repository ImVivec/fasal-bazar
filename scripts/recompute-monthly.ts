// Recompute every completed month's summary from `daily` (one-time, 2026-10-07: adds the arrivals total
// as the third value of each monthly entry). Reads only Mongo, no Agmarknet calls; idempotent.
//   npm run recompute:monthly            write
//   npm run recompute:monthly -- --dry   only report what would change
import { client, cols } from '../src/lib/db';
import { buildMonthlyOps, cropRange } from '../src/lib/ingest-core';
import { CROPS } from '../src/lib/master';
import { todayIST } from '../src/lib/dates';

const dry = process.argv.includes('--dry');
const thisMonth = todayIST().slice(0, 7);
const { daily, monthly } = await cols();
let written = 0, changedAvg = 0;
for (const c of CROPS) {
  const docs = await daily.find(cropRange(c.id, '2000-01-01', `${thisMonth}-00`)).toArray(); // before this month
  const byMonth = new Map<string, typeof docs>();
  for (const d of docs) {
    const ym = d._id.split(':')[1].slice(0, 7);
    byMonth.set(ym, [...(byMonth.get(ym) ?? []), d]);
  }
  const ops = [...byMonth].flatMap(([ym, ds]) => buildMonthlyOps(ym, ds));
  // Sanity: the average and day count should match what's stored (only the arrivals total is new).
  const old = new Map((await monthly.find(cropRange(c.id, '2000-01', thisMonth)).toArray()).map((d) => [d._id, d.m]));
  for (const op of ops) {
    const prev = old.get(op.updateOne.filter._id) ?? {};
    for (const [k, v] of Object.entries(op.updateOne.update.$set)) {
      const p = prev[k.slice(2)];
      if (!p || p[0] !== v[0] || p[1] !== v[1]) changedAvg++;
    }
  }
  if (!dry && ops.length) await monthly.bulkWrite(ops, { ordered: false });
  written += ops.length;
  console.log(`${c.slug}: ${docs.length} days -> ${ops.length} months`);
}
console.log(`${dry ? 'would write' : 'wrote'} ${written} monthly docs; ${changedAvg} mandi-months differ in avg/days from before`);
await (await client()).close();
