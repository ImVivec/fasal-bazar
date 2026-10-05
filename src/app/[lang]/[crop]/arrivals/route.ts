// Arrivals tab data for one crop (weekly tonnes + price per mandi), loaded only when the tab is
// opened. Language-neutral (names are filled in on the phone); static per (lang, crop) like /history.
import { CROPS } from '@/lib/master';
import { getCropArrivals } from '@/lib/prices';
import { LANGS } from '@/lib/session';

export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  return LANGS.flatMap((lang) => CROPS.map((c) => ({ lang, crop: c.slug })));
}

export async function GET(_req: Request, { params }: { params: Promise<{ lang: string; crop: string }> }) {
  const { crop } = await params;
  const c = CROPS.find((x) => x.slug === crop);
  if (!c) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json(await getCropArrivals(c.id));
}
