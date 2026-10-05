// Crop page ("where to sell"): every mandi for this crop, all districts. Static per (lang, crop),
// revalidated after each data update; district filtering happens in the browser.
import { CropTabs } from '@/components/CropTabs';
import { CropIcon } from '@/components/CropIcon';
import { notFound } from 'next/navigation';
import { CROPS } from '@/lib/master';
import { getCropView } from '@/lib/prices';
import { dict, nameIn } from '@/lib/strings';
import { LANGS, type Lang } from '@/lib/session';
import { shortDate } from '@/lib/dates';
import { dateTimeIST, rupees } from '@/lib/format';
import { CropMarkets } from '@/components/CropMarkets';

export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  return LANGS.flatMap((lang) => CROPS.map((c) => ({ lang, crop: c.slug })));
}

type Props = { params: Promise<{ lang: Lang; crop: string }> };

export async function generateMetadata({ params }: Props) {
  const { lang, crop } = await params;
  const c = CROPS.find((x) => x.slug === crop);
  return { title: c ? `${nameIn(c, lang)} · Fasal Bazar` : 'Fasal Bazar' };
}

export default async function CropPage({ params }: Props) {
  const { lang, crop } = await params;
  const c = CROPS.find((x) => x.slug === crop);
  if (!c) notFound();
  const t = dict(lang);
  const v = await getCropView(c.id, lang);

  return (
    <>
      <CropTabs current={c.slug} lang={lang} allLabel={t.allCrops} />
      <div className="crop-head">
        <h1 className="crop-title"><CropIcon slug={c.slug} icon={c.icon} size={52} className="title-photo" /> {nameIn(c, lang)}{lang === 'hi' ? <small>{c.en}</small> : <small lang="hi">{c.hi}</small>}</h1>
        <p className="muted">{t.perQuintal}</p>
        {v.msp ? <p className="msp">{t.msp}: <b>{rupees(v.msp)}</b></p> : null}
      </div>
      <CropMarkets crop={c.slug} rows={v.rows} msp={v.msp} lang={lang} t={t} />
      <footer className="foot muted">
        <div>{t.latestReport}: {v.latestDate ? `${shortDate(v.latestDate, lang)} ${v.latestDate.slice(0, 4)}` : t.never}</div>
        <div>{t.lastUpdated}: {v.lastOkAt ? dateTimeIST(v.lastOkAt, lang) : t.never}
          {v.lastError ? ` · ${t.lastFailed} (${v.lastRunAt ? dateTimeIST(v.lastRunAt, lang) : ''})` : ''}</div>
        <div>{t.source}</div>
        <div className="made-by">{t.madeBy}</div>
      </footer>
    </>
  );
}
