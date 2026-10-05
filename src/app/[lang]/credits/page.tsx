// Photo credits (required by the Creative Commons licences of the crop photos).
import { CROPS } from '@/lib/master';
import { PHOTOS } from '@/lib/crop-photos';
import { dict, nameIn } from '@/lib/strings';
import type { Lang } from '@/lib/session';
import { CropIcon } from '@/components/CropIcon';

export default async function CreditsPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = dict(lang);
  const list = CROPS.filter((c) => PHOTOS[c.slug]);
  return (
    <>
      <h1>{t.photoCredits}</h1>
      <p className="muted">{t.creditsIntro}</p>
      <ul className="credits" style={{ listStyle: 'none', padding: 0 }}>
        {list.map((c) => {
          const p = PHOTOS[c.slug];
          return (
            <li key={c.slug}>
              <CropIcon slug={c.slug} icon={c.icon} size={40} />
              <span><b>{nameIn(c, lang)}</b>: <a href={p.url} target="_blank" rel="noreferrer">{p.file}</a>
                {p.author ? ` · ${p.author}` : ''} · {p.license}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
