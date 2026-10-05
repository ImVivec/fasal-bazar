// `users` collection access. Server-only. _id = mobile number.
import 'server-only';
import { cols, type UserDoc } from './db';
import { hashPassword, verifyPassword } from './password';
import { LOCK_MINUTES, MAX_FAILS, normPhone, type UserStatus } from './users-core';
import { todayIST } from './dates';

export type LoginResult =
  | { ok: true; user: UserDoc }
  | { ok: false; reason: 'invalid' | 'pending' | 'rejected' | 'blocked' | 'locked' };

export async function createUser(v: { name: string; phone: string; pin: string; districtId: number; lang: 'en' | 'hi' }) {
  const { users } = await cols();
  try {
    await users.insertOne({
      _id: v.phone, n: v.name, pin: await hashPassword(v.pin), d: v.districtId, l: v.lang,
      role: 'user', st: 'pending', at: new Date(),
    });
    return { ok: true as const };
  } catch (e: any) {
    if (e?.code === 11000) return { ok: false as const, reason: 'taken' as const };
    throw e;
  }
}

export async function login(phoneRaw: string, pin: string): Promise<LoginResult> {
  const { users } = await cols();
  const phone = normPhone(phoneRaw);
  const u = phone ? await users.findOne({ _id: phone }) : null;
  if (u?.lockUntil && u.lockUntil > new Date()) return { ok: false, reason: 'locked' };
  const good = await verifyPassword(pin, u?.pin); // always hashes, even for unknown numbers
  if (!u || !good) {
    if (u) {
      const fails = (u.fails ?? 0) + 1;
      await users.updateOne({ _id: u._id }, {
        $set: fails >= MAX_FAILS ? { fails: 0, lockUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { fails },
      });
    }
    return { ok: false, reason: 'invalid' };
  }
  if (u.fails || u.lockUntil) await users.updateOne({ _id: u._id }, { $unset: { fails: '', lockUntil: '' } });
  if (u.st !== 'approved') return { ok: false, reason: u.st };
  return { ok: true, user: u };
}

/** Daily activity ping: bumps last-seen/day count once per IST day. Returns current status. */
export async function touch(id: string) {
  const { users } = await cols();
  const today = todayIST();
  const u = await users.findOneAndUpdate(
    { _id: id, last: { $ne: today } },
    { $set: { last: today }, $inc: { days: 1 } },
    { returnDocument: 'after', projection: { st: 1, role: 1, l: 1, d: 1 } },
  );
  return u ?? (await users.findOne({ _id: id }, { projection: { st: 1, role: 1, l: 1, d: 1 } }));
}

export async function getUser(id: string) {
  const { users } = await cols();
  return users.findOne({ _id: id }, { projection: { pin: 0 } });
}

export async function listUsers() {
  const { users } = await cols();
  return users.find({}, { projection: { pin: 0 } }).sort({ at: -1 }).limit(1000).toArray();
}

export async function setStatus(id: string, st: UserStatus, by: string) {
  const { users } = await cols();
  await users.updateOne({ _id: id, role: { $ne: 'admin' } }, {
    $set: { st, by, ...(st === 'approved' ? { apAt: new Date() } : {}) },
  });
}

export async function setPrefs(id: string, p: { d?: number; l?: 'en' | 'hi' }) {
  const { users } = await cols();
  await users.updateOne({ _id: id }, { $set: p });
}

export async function resetPin(id: string, pin: string) {
  const { users } = await cols();
  await users.updateOne({ _id: id }, { $set: { pin: await hashPassword(pin) }, $unset: { fails: '', lockUntil: '' } });
}
