'use client';
// Analysis cards for one crop. District chips switch between variants computed on the server.
import { useEffect, useState } from 'react';
import { DISTRICTS } from '@/lib/master';
import { fill, MONTH_NAMES, MONTH_SHORT, nameIn, type Strings } from '@/lib/strings';
import { inr, rupees } from '@/lib/format';
import type { Analysis } from '@/lib/analysis-core';
import type { Lang } from '@/lib/session';
import { DayLabel } from './DayLabel';
import { readUiCookie } from './Header';
import { useSessionState } from '@/lib/session-state';
import { ArrivalsView } from './ArrivalsView';

const DIST = new Map(DISTRICTS.map((d) => [d.id, d]));

export function AnalysisView({ crop, variants, lang, t }: { crop: string; variants: Record<string, Analysis>; lang: Lang; t: Strings }) {
  const [tab, setTab] = useSessionState<'price' | 'arrivals'>('analysisTab', 'price');
  const [home, setHome] = useState<number | null>(null);
  const [district, setKey] = useSessionState<string>('district', 'all'); // shared with the crop page
  const key = variants[district] ? district : 'all'; // not traded in that district: show all, keep the choice
  useEffect(() => { setHome(DISTRICTS.find((d) => d.slug === readUiCookie().d)?.id ?? null); }, []);
  const districts = Object.keys(variants).filter((k) => k !== 'all').map(Number)
    .sort((a, b) => Number(b === home) - Number(a === home) || (variants[b].mandis.length - variants[a].mandis.length));
  const a = variants[key] ?? variants.all;
  const dayT = { today: t.today, yesterday: t.yesterday, daysAgo: t.daysAgo };

  const arrivalsNow = a?.arrivals && (
    <section className="acard">
      <h2>{t.arrivalsTitle}</h2>
      <p>{fill(a.arrivals.pct >= 100 ? t.arrivalsMany : a.arrivals.pct > 20 ? t.arrivalsMore : a.arrivals.pct < -20 ? t.arrivalsLess : t.arrivalsNormal, {
        p: Math.round(Math.abs(a.arrivals.pct)), today: inr(a.arrivals.today), normal: inr(a.arrivals.normal),
        x: Math.round((a.arrivals.today / a.arrivals.normal) * 10) / 10,
      })}</p>
    </section>
  );

  return (
    <>
      <div className="atabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'price'} onClick={() => setTab('price')}>{t.tabPrice}</button>
        <button type="button" role="tab" aria-selected={tab === 'arrivals'} onClick={() => setTab('arrivals')}>{t.tabArrivals}</button>
      </div>
      {districts.length > 1 && (
        <div className="chips dist-chips" role="group" aria-label={t.district}>
          <button type="button" className="chip" aria-pressed={key === 'all'} onClick={() => setKey('all')}>{t.allDistricts}</button>
          {districts.map((d) => (
            <button key={d} type="button" className="chip" aria-pressed={key === String(d)} onClick={() => setKey(String(d))}>
              {d === home ? t.myDistrict : nameIn(DIST.get(d)!, lang)}
            </button>
          ))}
        </div>
      )}

      {tab === 'arrivals' ? (
        <>
          {arrivalsNow}
          <ArrivalsView crop={crop} district={key} lang={lang} t={t} />
        </>
      ) : !a?.date || a.avg === null ? <p className="card">{t.noData}</p> : (
        <>
          <section className="acard">
            <h2>{t.isGoodQ}</h2>
            {a.verdict ? (
              <p className={`verdict ${a.verdict}`}>
                {a.verdict === 'good' ? '👍 ' + t.verdictGood : a.verdict === 'weak' ? '👎 ' + t.verdictWeak : '👌 ' + t.verdictNormal}
              </p>
            ) : <p className="muted">{t.notEnough}</p>}
            <dl className="cmp">
              <div><dt>{key === 'all' ? t.avgAll : fill(t.avgIn, { d: nameIn(DIST.get(Number(key))!, lang) })} · <DayLabel date={a.date} lang={lang} t={dayT} /></dt><dd><b>{rupees(a.avg)}</b></dd></div>
              {a.vs30 && <Cmp label={t.last30} value={a.vs30.avg} pct={a.vs30.pct} t={t} />}
              {a.vsLastYear && <Cmp label={t.lastYear} value={a.vsLastYear.avg} pct={a.vsLastYear.pct} t={t} />}
              {a.vsMsp && (
                <div><dt>{t.msp}</dt><dd>{rupees(a.vsMsp.msp)}
                  <span className={`delta ${a.vsMsp.diff >= 0 ? 'up' : 'down'}`}>
                    {a.vsMsp.diff >= 0 ? '▲' : '▼'} ₹{inr(Math.abs(a.vsMsp.diff))} {a.vsMsp.diff >= 0 ? t.up : t.down}
                  </span></dd></div>
              )}
            </dl>
            {a.verdict && <p className="muted small">{t.verdictHint}</p>}
          </section>

          {a.best && a.mandis.length > 1 && (
            <section className="acard">
              <h2>{t.bestMandi}</h2>
              <p className="best"><b>{a.best.name}</b> <span className="best-price">{rupees(a.best.price)}</span></p>
              <p className="muted">{nameIn(DIST.get(a.best.d) ?? { en: '' }, lang)}{a.best.aboveAvg > 0 ? ` · ${fill(t.aboveAvg, { n: inr(a.best.aboveAvg) })}` : ''}</p>
            </section>
          )}

          <section className="acard">
            <h2>{t.compareMandis}</h2>
            <Bars a={a} t={t} lang={lang} />
          </section>

          <section className="acard">
            <h2>{t.seasonTitle}</h2>
            {a.seasonal ? <Season a={a} t={t} lang={lang} /> : <p className="muted">{t.notEnough}</p>}
          </section>
        </>
      )}
    </>
  );
}

function Cmp({ label, value, pct, t }: { label: string; value: number; pct: number; t: Strings }) {
  const p = Math.round(pct);
  return (
    <div><dt>{label}</dt><dd>{rupees(value)}
      {p === 0 ? <span className="delta">● {t.aboutSame}</span> : (
        <span className={`delta ${p > 0 ? 'up' : 'down'}`}>{p > 0 ? '▲' : '▼'} {Math.abs(p)}% {p > 0 ? t.up : t.down}</span>
      )}</dd></div>
  );
}

function Bars({ a, t, lang }: { a: Analysis; t: Strings; lang: Lang }) {
  const [all, setAll] = useSessionState<boolean>('showAll', false);
  const list = all ? a.mandis : a.mandis.slice(0, 10);
  const top = Math.max(...a.mandis.map((m) => m.price));
  const low = Math.min(...a.mandis.map((m) => m.price));
  const floor = Math.max(0, low - (top - low) * 0.5 - top * 0.05); // start bars below the lowest so differences show
  return (
    <>
      <ul className="bars">
        {list.map((m) => (
          <li key={m.id}>
            <div className="bar-label"><span>{m.name} <span className="muted small">{nameIn(DIST.get(m.d) ?? { en: '' }, lang)}</span></span><b>{rupees(m.price)}</b></div>
            <div className="bar-track"><div className="bar" style={{ width: `${Math.max(4, ((m.price - floor) / (top - floor || 1)) * 100)}%` }} /></div>
            {m.max > m.min && <div className="muted small">{t.dayRange}: {rupees(m.min)} – {rupees(m.max)}</div>}
          </li>
        ))}
      </ul>
      {a.mandis.length > 10 && (
        <button type="button" className="big secondary showall" onClick={() => setAll((x) => !x)}>
          {all ? t.showLess : fill(t.showAllN, { n: a.mandis.length })}
        </button>
      )}
    </>
  );
}

function Season({ a, t, lang }: { a: Analysis; t: Strings; lang: Lang }) {
  const s = a.seasonal!;
  const maxAbs = Math.max(5, ...s.map((x) => Math.abs(x.pct)));
  const names = MONTH_NAMES[lang];
  return (
    <>
      {a.bestMonths.length > 0 && <p className="best">{fill(t.seasonBest, { months: a.bestMonths.map((m) => names[m - 1]).join(', ') })}</p>}
      <div className="season" role="img" aria-label={s.map((x) => `${names[x.month - 1]} ${x.pct}%`).join(', ')}>
        {s.map((x) => (
          <div key={x.month} className="scol">
            <div className="sbar-wrap"><div className={`sbar ${x.pct >= 0 ? 'pos' : 'neg'}`} style={{ height: `${(Math.abs(x.pct) / maxAbs) * 50}%` }} /></div>
            <div className="smonth">{MONTH_SHORT[lang][x.month - 1]}</div>
          </div>
        ))}
      </div>
      <p className="muted small">{fill(t.seasonHint, { n: a.years })}</p>
    </>
  );
}
