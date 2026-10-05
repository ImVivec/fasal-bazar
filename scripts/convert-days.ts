// One-time: convert legacy district-keyed `days`/`months` into crop-keyed `daily`/`monthly`.
// No Agmarknet calls. Idempotent ($set per mandi), so it can be re-run. Verifies counts and values.
//   npm run convert
import { client, cols } from '../src/lib/db';
import { dailyId, monthlyId } from '../src/lib/ingest-core';

const { legacyDays, legacyMonths, daily, monthly } = await cols();

async function convert(name: string, src: typeof legacyDays | typeof legacyMonths, dst: typeof daily | typeof monthly, idOf: (crop: number, key: string) => string) {
  const t0 = Date.now();
  const sets = new Map<string, Record<string, unknown>>(); // new _id -> { "m.<mkt>": value }
  let entries = 0, docs = 0;
  for await (const d of src.find({})) {
    docs++;
    const key = d._id.split(':')[1];
    for (const [crop, mkts] of Object.entries(d.c ?? {})) {
      const id = idOf(Number(crop), key);
      const set = sets.get(id) ?? {};
      for (const [mkt, v] of Object.entries(mkts)) { set[`m.${mkt}`] = v; entries++; }
      sets.set(id, set);
    }
  }
  const ops = [...sets].map(([_id, $set]) => ({ updateOne: { filter: { _id }, update: { $set }, upsert: true } }));
  for (let i = 0; i < ops.length; i += 1000) await (dst as typeof daily).bulkWrite(ops.slice(i, i + 1000) as any, { ordered: false });
  console.log(`${name}: ${docs} legacy docs, ${entries} entries -> ${ops.length} new docs in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return { entries, sets };
}

const a = await convert('days -> daily', legacyDays, daily, dailyId);
const b = await convert('months -> monthly', legacyMonths, monthly, monthlyId);

// Verify: every legacy entry is present in the new collection with the same value.
for (const [label, { entries, sets }, dst] of [['daily', a, daily], ['monthly', b, monthly]] as const) {
  let checked = 0, mismatch = 0;
  const ids = [...sets.keys()];
  for (let i = 0; i < ids.length; i += 2000) {
    const got = new Map((await (dst as typeof daily).find({ _id: { $in: ids.slice(i, i + 2000) } }).toArray()).map((d) => [d._id, d]));
    for (const id of ids.slice(i, i + 2000)) {
      for (const [path, v] of Object.entries(sets.get(id)!)) {
        checked++;
        const have = (got.get(id) as any)?.m?.[path.slice(2)];
        if (JSON.stringify(have) !== JSON.stringify(v)) { mismatch++; if (mismatch <= 3) console.log('  mismatch', id, path, have, v); }
      }
    }
  }
  console.log(`verify ${label}: ${checked}/${entries} entries checked, ${mismatch} mismatches`);
}
await (await client()).close();
