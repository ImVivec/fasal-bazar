'use client';
// District + language are saved to the account; favourite crops stay on this device.
import { useEffect, useState } from 'react';
import { savePrefsAction } from '@/lib/auth-actions';
import { favouriteCrops, loadSettings, saveSettings } from '@/lib/settings';
import type { Strings } from '@/lib/strings';
import type { Lang } from '@/lib/session';
import { CropPicker } from '@/components/CropPicker';
import { DistrictOptions } from '@/components/DistrictSelect';

type Active = Record<string, { date: string; mandis: number; lo: number; hi: number }>;

export function SettingsForm({ t, lang, district, active }: { t: Strings; lang: Lang; district: string; active: Active }) {
  const [crops, setCrops] = useState<string[]>([]);
  useEffect(() => setCrops(favouriteCrops()), []);
  const toggle = (slug: string) => setCrops((x) => (x.includes(slug) ? x.filter((y) => y !== slug) : [...x, slug]));

  return (
    <form action={savePrefsAction} onSubmit={() => saveSettings({ ...loadSettings(), crops })}>
      <label className="field">{t.homeDistrict}
        <select name="district" defaultValue={district}><DistrictOptions lang={lang} /></select>
      </label>
      <div className="field" role="radiogroup" aria-label={t.language}>{t.language}
        <div className="seg">
          <label><input type="radio" name="lang" value="hi" defaultChecked={lang === 'hi'} />हिंदी</label>
          <label><input type="radio" name="lang" value="en" defaultChecked={lang === 'en'} />English</label>
        </div>
      </div>
      <fieldset>
        <legend>{t.favouriteCrops}</legend>
        <div className="muted">{t.pickFavHint}</div>
        <CropPicker mode="select" lang={lang} active={active} selected={crops} onToggle={toggle}
          t={{ searchCrop: t.searchCrop, myCrops: t.myCrops, noCropFound: t.noCropFound, noRecent: t.noRecent, mandisN: t.mandisN, groupNames: t.groupNames, upTo: t.upTo }} />
      </fieldset>
      <button type="submit" className="big">{t.save}</button>
    </form>
  );
}
