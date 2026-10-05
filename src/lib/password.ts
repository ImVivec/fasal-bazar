// Password hashing with Node's built-in scrypt (no dependency). Format: scrypt$<salt>$<hash>.
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const LEN = 32;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, LEN);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(pw: string, stored: string | undefined): Promise<boolean> {
  const [alg, salt, hash] = (stored ?? '').split('$');
  // Hash anyway when the user doesn't exist, so timing doesn't reveal valid usernames.
  const s = alg === 'scrypt' && salt ? Buffer.from(salt, 'base64url') : randomBytes(16);
  const got = await scrypt(pw, s, LEN);
  const want = alg === 'scrypt' && hash ? Buffer.from(hash, 'base64url') : randomBytes(LEN);
  return want.length === LEN && timingSafeEqual(got, want) && alg === 'scrypt';
}
