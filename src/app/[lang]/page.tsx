// Home: crop-first. "Which crop's price do you want to see?" (static per language).
import { getActive } from '@/lib/prices';
import { dict } from '@/lib/strings';
import type { Lang } from '@/lib/session';
import { CropPicker } from '@/components/CropPicker';

export const revalidate = 86400;

export default async function Home({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = dict(lang);
  const { active } = await getActive();
  return (
    <>
      <h1 className="home-q">{t.whichCrop}</h1>
      <CropPicker mode="browse" lang={lang} active={active}
        t={{ searchCrop: t.searchCrop, myCrops: t.myCrops, noCropFound: t.noCropFound, noRecent: t.noRecent, mandisN: t.mandisN, groupNames: t.groupNames, upTo: t.upTo }} />
    </>
  );
}
