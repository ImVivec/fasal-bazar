// District <select>, grouped by state (MP, Rajasthan).
import { DISTRICTS, STATES } from '@/lib/master';
import { nameIn } from '@/lib/strings';
import type { Lang } from '@/lib/session';

export function DistrictOptions({ lang }: { lang: Lang }) {
  return (
    <>
      {STATES.map((s) => (
        <optgroup key={s.id} label={nameIn(s, lang)}>
          {DISTRICTS.filter((d) => d.state === s.id).map((d) => <option key={d.slug} value={d.slug}>{nameIn(d, lang)}</option>)}
        </optgroup>
      ))}
    </>
  );
}
