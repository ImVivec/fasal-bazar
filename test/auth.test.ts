import { beforeAll, describe, expect, it } from 'vitest';
import { signSession, verifySession } from '@/lib/session';
import { hashPassword, verifyPassword } from '@/lib/password';
import { normPhone, validateSignup } from '@/lib/users-core';

beforeAll(() => { process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret-123'; });

describe('session cookie', () => {
  it('round-trips and rejects tampering', () => {
    const { value } = signSession({ u: 'ramesh', r: 'user', l: 'hi', d: 328 });
    expect(verifySession(value)).toMatchObject({ u: 'ramesh', r: 'user', l: 'hi', d: 328 });
    const [data, mac] = value.split('.');
    const forged = Buffer.from(JSON.stringify({ u: 'ramesh', r: 'admin', l: 'hi', d: 328, exp: 9e9 })).toString('base64url');
    expect(verifySession(`${forged}.${mac}`)).toBeNull();
    expect(verifySession(`${data}.${mac}x`)).toBeNull();
    expect(verifySession('garbage')).toBeNull();
    expect(verifySession(undefined)).toBeNull();
  });
  it('expires', () => {
    const { value } = signSession({ u: 'a', r: 'user', l: 'en', d: 1 }, -1);
    expect(verifySession(value)).toBeNull();
  });
  it('rejects a cookie signed with another secret', () => {
    const { value } = signSession({ u: 'a', r: 'admin', l: 'en', d: 1 });
    process.env.AUTH_SECRET = 'another-secret-another-secret-another-1';
    expect(verifySession(value)).toBeNull();
    process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret-123';
  });
});

describe('password', () => {
  it('hashes with a random salt and verifies', async () => {
    const h1 = await hashPassword('kheti123');
    const h2 = await hashPassword('kheti123');
    expect(h1).not.toBe(h2);
    expect(h1.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('kheti123', h1)).toBe(true);
    expect(await verifyPassword('kheti124', h1)).toBe(false);
    expect(await verifyPassword('kheti123', undefined)).toBe(false);
    expect(await verifyPassword('kheti123', 'junk')).toBe(false);
  });
});

describe('signup validation', () => {
  it('normalises Indian mobile numbers', () => {
    expect(normPhone('98765 43210')).toBe('9876543210');
    expect(normPhone('+91-98765-43210')).toBe('9876543210');
    expect(normPhone('09876543210')).toBe('9876543210');
    expect(normPhone('5876543210')).toBeNull();
    expect(normPhone('98765')).toBeNull();
  });
  it('accepts a good form (Hindi name, formatted number)', () => {
    const r = validateSignup({ name: '  रमेश   पटेल ', phone: '+91 98765-43210', pin: '1234', pin2: '1234', district: 'ujjain', lang: 'hi' });
    expect(r).toEqual({ ok: true, value: { name: 'रमेश पटेल', phone: '9876543210', pin: '1234', districtId: 335, lang: 'hi' } });
  });
  it('reports every bad field', () => {
    const r = validateSignup({ name: 'x', phone: '12', pin: '12a4', pin2: '', district: 'mumbai', lang: 'fr' });
    expect(r).toEqual({ ok: false, errors: ['name', 'phone', 'pin', 'district', 'lang'] });
  });
  it('requires both PINs to match and exactly 4 digits', () => {
    const base = { name: 'Ramesh', phone: '9876543210', district: 'kota', lang: 'en' };
    expect(validateSignup({ ...base, pin: '1234', pin2: '4321' })).toEqual({ ok: false, errors: ['pin2'] });
    expect(validateSignup({ ...base, pin: '12345', pin2: '12345' })).toEqual({ ok: false, errors: ['pin'] });
  });
});
