// Analysis page: plain-language answers for one crop, across all mandis or one district.
// Static per (lang, crop); all district variants are computed here and switched in the browser.
import { CropTabs } from '@/components/CropTabs';
import { CropIcon } from '@/components/CropIcon';
import { notFound } from 'next/navigation';
import { CROPS } from '@/lib/master';
import { getCropAnalysis } from '@/lib/prices';
import { dict, nameIn } from '@/lib/strings';
import { LANGS, type Lang } from '@/lib/session';
import { AnalysisView } from '@/components/AnalysisView';

export const revalidate = 3600; // rebuild at most hourly, on the next visit after new data
export const dynamicParams = false;

export function generateStaticParams() {
  return LANGS.flatMap((lang) => CROPS.map((c) => ({ lang, crop: c.slug })));
}

type Props = { params: Promise<{ lang: Lang; crop: string }> };

export async function generateMetadata({ params }: Props) {
  const { lang, crop } = await params;
  const c = CROPS.find((x) => x.slug === crop);
  return { title: c ? `${dict(lang).analysis} · ${nameIn(c, lang)} · Fasal Bazar` : 'Fasal Bazar' };
}

export default async function AnalysisPage({ params }: Props) {
  const { lang, crop } = await params;
  const c = CROPS.find((x) => x.slug === crop);
  if (!c) notFound();
  const t = dict(lang);
  const { variants } = await getCropAnalysis(c.id, lang);
  return (
    <>
      <CropTabs current={c.slug} suffix="/analysis" lang={lang} allLabel={t.allCrops} />
      <div className="crop-head">
        <h1 className="crop-title"><CropIcon slug={c.slug} icon={c.icon} size={52} className="title-photo" /> {nameIn(c, lang)} · {t.analysis}</h1>
        <p className="muted">{t.perQuintal}</p>
      </div>
      <AnalysisView crop={c.slug} variants={variants} lang={lang} t={t} />
      <p className="muted small" style={{ marginTop: 20 }}>{t.disclaimer}</p>
    </>
  );
}
