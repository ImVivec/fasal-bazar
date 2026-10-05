// Daily activity ping + status re-check (see ActivityPing). One tiny DB write per user per day.
import { getSession, endSession } from '@/lib/auth';
import { touch } from '@/lib/users';

export const dynamic = 'force-dynamic';

export async function POST() {
  const s = await getSession();
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const u = await touch(s.u);
  if (!u || u.st !== 'approved') {
    await endSession();
    return Response.json({ error: 'not approved' }, { status: 403 });
  }
  return Response.json({ ok: true });
}
