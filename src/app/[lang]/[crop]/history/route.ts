// Chart data for one crop (daily points for a year + monthly averages for all years), loaded by the
// chart only when it's shown, so the crop page itself stays small. Static per (lang, crop), behind
// the login proxy like every page, and revalidated with the pages after each data update.
import { CROPS } from '@/lib/master';
import { getCropView } from '@/lib/prices';
import { LANGS, type Lang } from '@/lib/session';

export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  return LANGS.flatMap((lang) => CROPS.map((c) => ({ lang, crop: c.slug })));
}

export async function GET(_req: Request, { params }: { params: Promise<{ lang: string; crop: string }> }) {
  const { crop } = await params;
  const lang: Lang = (await params).lang === 'hi' ? 'hi' : 'en';
  const c = CROPS.find((x) => x.slug === crop);
  if (!c) return Response.json({ error: 'not found' }, { status: 404 });
  // Language-neutral: names are filled in on the phone (same URL serves both languages, so the
  // browser cache must not hold one language's names).
  const v = await getCropView(c.id, lang);
  const strip = (xs: typeof v.series) => xs.map(({ id, d, points }) => ({ id, d, points }));
  return Response.json({ series: strip(v.series), monthly: strip(v.monthly) });
}
