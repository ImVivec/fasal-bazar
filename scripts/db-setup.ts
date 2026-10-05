// Idempotent DB setup: the ONLY place collections/indexes are created. Never drops anything.
// Run: npm run db:setup   (reads MONGODB_URI / MONGODB_DB from .env.local)
import { client, db } from '../src/lib/db';

const COLLECTIONS = ['daily', 'monthly', 'meta', 'users'];
// `days`/`months` (district-keyed, legacy) are only listed while they still exist; dropped on approval.
const LEGACY = ['days', 'months'];
// No secondary indexes: daily/monthly are _id range scans, users/meta are looked up by _id (see src/lib/db.ts).

const d = await db();
const existing = new Set((await d.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
for (const name of COLLECTIONS) {
  if (existing.has(name)) console.log(`✓ ${name} exists`);
  else { await d.createCollection(name); console.log(`+ created ${name}`); }
}
for (const name of [...COLLECTIONS, ...LEGACY.filter((n) => existing.has(n))]) {
  const s = await d.command({ collStats: name }).catch(() => null);
  const idx = await d.collection(name).indexes();
  console.log(`  ${name}: docs=${s?.count ?? 0} size=${s?.size ?? 0}B storage=${s?.storageSize ?? 0}B indexes=[${idx.map((i) => i.name).join(', ')}]`);
}
console.log(`db=${d.databaseName}`);
await (await client()).close();
