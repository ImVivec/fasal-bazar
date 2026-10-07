// Crop list for the Analysis section: same picker as home, but tiles open each crop's analysis
// (so "All crops" on an analysis page keeps the farmer in Analysis).
import { getActive } from '@/lib/prices';
import { dict } from '@/lib/strings';
import type { Lang } from '@/lib/session';
import { CropPicker } from '@/components/CropPicker';

export const revalidate = 3600; // rebuild at most hourly, on the next visit after new data

export default async function AnalysisHome({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = dict(lang);
  const { active } = await getActive();
  return (
    <>
      <h1 className="home-q">{t.whichCropAnalysis}</h1>
      <CropPicker mode="browse" suffix="/analysis" lang={lang} active={active}
        t={{ searchCrop: t.searchCrop, myCrops: t.myCrops, noCropFound: t.noCropFound, noRecent: t.noRecent, mandisN: t.mandisN, groupNames: t.groupNames, upTo: t.upTo }} />
    </>
  );
}
