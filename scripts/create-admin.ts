// Create (or promote/reset) an admin account. Interactive: the PIN is typed hidden.
//   npm run admin:create
// Idempotent: re-running for an existing mobile number sets role=admin, status=approved and the new PIN.
import { createInterface } from 'node:readline';
import { client, cols } from '../src/lib/db';
import { hashPassword } from '../src/lib/password';
import { ADMIN_PIN_RE, normName, normPhone } from '../src/lib/users-core';
import { DISTRICTS } from '../src/lib/master';

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
const ask = (q: string) => new Promise<string>((ok) => rl.question(q, ok));
function askHidden(q: string): Promise<string> {
  return new Promise((ok) => {
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    const orig = out._writeToOutput;
    out._writeToOutput = (s: string) => out.output.write(s.startsWith(q) ? q : s.includes('\n') ? '\n' : '*');
    rl.question(q, (a) => { out._writeToOutput = orig; ok(a); });
  });
}

const phone = normPhone(await ask('Admin mobile number: '));
if (!phone) throw new Error('Enter a valid 10-digit Indian mobile number');
const name = normName(await ask('Your name: '));
if (name.length < 2) throw new Error('Enter your name');
const dSlug = (await ask(`District [${DISTRICTS.map((d) => d.slug).join(', ')}] (shajapur): `)).trim() || 'shajapur';
const district = DISTRICTS.find((d) => d.slug === dSlug);
if (!district) throw new Error('Unknown district');
const pin = await askHidden('Admin PIN (6–8 digits): ');
const pin2 = await askHidden('Repeat PIN: ');
rl.close();
if (pin !== pin2) throw new Error('PINs do not match');
if (!ADMIN_PIN_RE.test(pin)) throw new Error('Admin PIN must be 6–8 digits (farmers use 4)');

const { users } = await cols();
await users.updateOne(
  { _id: phone },
  {
    $set: { n: name, pin: await hashPassword(pin), d: district.id, role: 'admin', st: 'approved', apAt: new Date(), by: 'cli' },
    $setOnInsert: { l: 'en', at: new Date() },
    $unset: { fails: '', lockUntil: '' },
  },
  { upsert: true },
);
console.log(`✓ admin ${name} (${phone}) ready. Log in at /login with this mobile number and PIN.`);
await (await client()).close();
