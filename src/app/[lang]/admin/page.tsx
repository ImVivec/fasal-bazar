// Admin: approve/reject/block users, reset passwords, trigger a data refresh.
import { requireAdmin } from '@/lib/auth';
import { listUsers } from '@/lib/users';
import { adminResetPinAction, adminSetStatusAction } from '@/lib/auth-actions';
import { dict, nameIn, type Strings } from '@/lib/strings';
import { DISTRICTS } from '@/lib/master';
import { dateTimeIST } from '@/lib/format';
import type { Lang } from '@/lib/session';
import type { UserDoc } from '@/lib/db';
import { RefreshButton } from './RefreshButton';
import { cols } from '@/lib/db';
import { fill } from '@/lib/strings';

export const dynamic = 'force-dynamic';

const ORDER: UserDoc['st'][] = ['pending', 'approved', 'blocked', 'rejected'];

export default async function AdminPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  await requireAdmin();
  const t = dict(lang);
  const users = await listUsers();
  const meta = await (await cols()).meta.findOne({ _id: 'agmarknet' }, { projection: { marketWatch: 1, cropWatch: 1 } });
  const mw = meta?.marketWatch;
  const cw = Object.entries(meta?.cropWatch ?? {}).sort((a, b) => b[1].days - a[1].days).slice(0, 15);
  const dname = (id: number) => nameIn(DISTRICTS.find((d) => d.id === id) ?? { en: String(id) }, lang);

  return (
    <>
      <h1>{t.admin}</h1>
      {mw && (mw.added.length > 0 || mw.missing.length > 0 || mw.renamed.length > 0) && (
        <section className="acard watch">
          <h2>⚠️ {t.marketWatchTitle}</h2>
          {mw.added.map((m) => <p key={m.id}>{fill(t.marketWatchNew, { name: m.name, d: dname(m.district), date: m.firstSeen })}</p>)}
          {mw.missing.map((id) => <p key={id}>{fill(t.marketWatchMissing, { id })}</p>)}
          {mw.renamed.map((m) => <p key={m.id}>{fill(t.marketWatchRenamed, { id: m.id, from: m.code, to: m.agm })}</p>)}
        </section>
      )}
      {ORDER.map((st) => {
        const list = users.filter((u) => u.st === st);
        if (st !== 'pending' && !list.length) return null;
        return (
          <section key={st}>
            <h2>{t[st]} ({list.length})</h2>
            {list.length === 0 ? <p className="muted">{t.none}</p> : <UserTable users={list} t={t} lang={lang} />}
          </section>
        );
      })}
      <h2>{t.marketWatchTitle}</h2>
      <p className="muted">{mw && !mw.added.length && !mw.missing.length && !mw.renamed.length
        ? fill(t.marketWatchOk, { date: mw.checkedAt.toISOString().slice(0, 10) }) : !mw ? t.never : ''}</p>
      {cw.length > 0 && (
        <>
          <h2>{t.cropWatchTitle}</h2>
          <p className="muted small">{t.cropWatchHint}</p>
          <ul className="cw">{cw.map(([id, c]) => <li key={id}><span>{c.name}</span><b>{c.days}</b></li>)}</ul>
        </>
      )}
      <h2>{t.dataRefresh}</h2>
      <RefreshButton label={t.refreshNow} busyLabel={t.refreshing} />
    </>
  );
}

function UserTable({ users, t, lang }: { users: Omit<UserDoc, 'pw'>[]; t: Strings; lang: Lang }) {
  // One card per user: readable on a phone, actions always visible.
  return (
    <div className="ucards">
      {users.map((u) => (
        <div key={u._id} className="card ucard">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>{u.n || u._id}{u.role === 'admin' ? ' ★' : ''}</b>
            {/^\d{10}$/.test(u._id) && <a href={`tel:+91${u._id}`}>📞 {u._id}</a>}
          </div>
          <div className="muted">
            {nameIn(DISTRICTS.find((d) => d.id === u.d) ?? { en: String(u.d) }, lang)} · {u.l === 'hi' ? 'हिंदी' : 'English'}
            {' · '}{t.joined} {dateTimeIST(u.at.toISOString(), lang)}
          </div>
          <div className="muted">{t.lastSeen}: {u.last ?? '—'} · {t.daysUsed}: {u.days ?? 0}</div>
          <div className="row" style={{ marginTop: 8 }}>
            {u.role !== 'admin' && <Actions u={u} t={t} />}
          </div>
          <details style={{ marginTop: 6 }}>
            <summary className="muted">{t.resetPassword}</summary>
            <form action={adminResetPinAction} className="row" style={{ marginTop: 6 }}>
              <input type="hidden" name="id" value={u._id} />
              <input name="pin" type="text" inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder={t.newPassword} required autoComplete="off" />
              <button type="submit" className="secondary">{t.save}</button>
            </form>
          </details>
        </div>
      ))}
    </div>
  );
}

function Actions({ u, t }: { u: Omit<UserDoc, 'pw'>; t: Strings }) {
  const btn = (st: UserDoc['st'], label: string, cls?: string) => (
    <form action={adminSetStatusAction}>
      <input type="hidden" name="id" value={u._id} />
      <input type="hidden" name="st" value={st} />
      <button type="submit" className={cls}>{label}</button>
    </form>
  );
  if (u.st === 'pending') return <>{btn('approved', t.approve)}{btn('rejected', t.reject, 'secondary')}</>;
  if (u.st === 'approved') return btn('blocked', t.block, 'secondary');
  return btn('approved', u.st === 'blocked' ? t.unblock : t.approve);
}
