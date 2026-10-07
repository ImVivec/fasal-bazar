// The only place that talks to MongoDB. Server-only: never import from client components.
import 'server-only';
import { MongoClient, type Collection } from 'mongodb';

/**
 * daily: one doc per (crop, date). _id "cropId:YYYY-MM-DD".
 *   m { marketId: [min, max, modal, arrivals] }  (₹ per crop unit as ints; arrivals tonnes or bundles)
 * "Crop X, dates A..B" is an _id range scan (see cropRange); no secondary index needed.
 */
export type DailyDoc = { _id: string; m: Record<string, [number, number, number, number]> };

/**
 * monthly: one doc per (crop, completed month). _id "cropId:YYYY-MM".
 *   m { marketId: [avg modal, days reported, arrivals tonnes] }. Written once, after the month is over.
 *   (The arrivals total was added 2026-10-07; every summary was recomputed from `daily`.)
 */
export type MonthlyDoc = { _id: string; m: Record<string, [number, number, number?]> };

/** Legacy (district-keyed) shapes, read only by scripts/convert-days.ts until they are dropped. */
export type LegacyDayDoc = { _id: string; c: Record<string, Record<string, [number, number, number, number]>> };
export type LegacyMonthDoc = { _id: string; c: Record<string, Record<string, [number, number]>> };

export type WatchedMarket = { id: number; name: string; district: number; firstSeen: string };

/** meta: single doc with ingestion state and MSPs. */
export type MetaDoc = {
  _id: 'agmarknet';
  lastRunAt?: Date;
  lastOkAt?: Date;
  latestDate?: string;
  lastError?: string | null;
  failed?: string[];
  /** Old per-crop backfill cursor (finished; kept for the record). */
  daysBackfill?: { next: string | null; emptyRun: number; startedAt: Date; doneAt?: Date; earliest?: string };
  /** Day-by-day backfill cursor (newest -> oldest): next date to fetch, down to `until`. */
  fill?: { next: string | null; until: string; startedAt: Date; doneAt?: Date };
  /** Per crop: latest report date, mandis reporting in the last 60 days, modal range on the latest date. */
  active?: Record<string, { date: string; mandis: number; lo: number; hi: number }>;
  /** Mandi changes in our districts vs. the code list (from Agmarknet's master list). */
  marketWatch?: { checkedAt: Date; added: WatchedMarket[]; missing: number[]; renamed: { id: number; code: string; agm: string }[] };
  /** Non-curated commodities trading in our mandis: id -> { name, firstSeen, lastSeen, days }. */
  cropWatch?: Record<string, { name: string; firstSeen: string; lastSeen: string; days: number }>;
  msp?: Record<string, number>; // cropId -> ₹/quintal
  latest?: Record<string, string>; // cropId -> latest reported date
  monthSummaryUpTo?: string; // YYYY-MM: `monthly` summaries exist up to and including this month
  /** YYYY-MM-DD: every day up to here was fetched OK by the daily job (outage catch-up starts after it). */
  fetchedThrough?: string | null;
};

/**
 * users: one doc per account. _id = mobile number (10 digits, unique by construction).
 *   n name, pin scrypt hash of the PIN, d district id, l language, role, st status,
 *   at created, apAt approved at, by last admin action by, last/days activity, fails/lockUntil.
 */
export type UserDoc = {
  _id: string;
  n: string;
  pin: string;
  d: number;
  l: 'en' | 'hi';
  role: 'admin' | 'user';
  st: 'pending' | 'approved' | 'rejected' | 'blocked';
  at: Date;
  apAt?: Date;
  by?: string;
  last?: string; // YYYY-MM-DD (IST) of last visit
  days?: number; // distinct days used
  fails?: number;
  lockUntil?: Date;
};

const g = globalThis as unknown as { _mongo?: Promise<MongoClient> };

export function client(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  // One cached client per process (survives HMR and warm serverless invocations).
  g._mongo ??= new MongoClient(uri, { maxPoolSize: 5 }).connect().catch((e) => {
    g._mongo = undefined;
    throw e;
  });
  return g._mongo;
}

export async function db() {
  return (await client()).db(process.env.MONGODB_DB || 'fasal_bazar');
}

export async function cols() {
  const d = await db();
  return {
    meta: d.collection<MetaDoc>('meta') as Collection<MetaDoc>,
    daily: d.collection<DailyDoc>('daily') as Collection<DailyDoc>,
    monthly: d.collection<MonthlyDoc>('monthly') as Collection<MonthlyDoc>,
    legacyDays: d.collection<LegacyDayDoc>('days') as Collection<LegacyDayDoc>,
    legacyMonths: d.collection<LegacyMonthDoc>('months') as Collection<LegacyMonthDoc>,
    users: d.collection<UserDoc>('users') as Collection<UserDoc>,
  };
}
