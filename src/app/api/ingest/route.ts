// Admin "Refresh prices now" button (admin session cookie) or a manual curl with the cron secret.
// Runs the same daily job GitHub Actions runs, without long retries (serverless time limit).
import { revalidatePath } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';
import { runDaily } from '@/lib/ingest';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function authorized(req: Request) {
  if ((await getSession())?.r === 'admin') return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get('authorization') ?? '');
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const result = await runDaily({ retries: 1, retryWaitMs: 20_000 });
  if (result.dates.some((d) => d.written > 0)) revalidatePath('/', 'layout');
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
