// Called by the daily job (GitHub Actions) after new data is written: marks every price page
// stale so it rebuilds with fresh data on the next visit.
import { revalidatePath } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const a = Buffer.from(req.headers.get('authorization') ?? '');
  const b = Buffer.from(`Bearer ${secret}`);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  revalidatePath('/', 'layout');
  return Response.json({ revalidated: true });
}
