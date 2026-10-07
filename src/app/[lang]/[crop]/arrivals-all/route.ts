// "All years" range of the Arrivals tab: month-by-month arrivals and average price per mandi, from the
// monthly summaries. Separate from /arrivals because it's ~5× bigger and only needed when that range is picked.
import { CROPS } from '@/lib/master';
import { getCropMonthlyArrivals } from '@/lib/prices';
import { LANGS } from '@/lib/session';

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return LANGS.flatMap((lang) => CROPS.map((c) => ({ lang, crop: c.slug })));
}

export async function GET(_req: Request, { params }: { params: Promise<{ lang: string; crop: string }> }) {
  const { crop } = await params;
  const c = CROPS.find((x) => x.slug === crop);
  if (!c) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json(await getCropMonthlyArrivals(c.id));
}
