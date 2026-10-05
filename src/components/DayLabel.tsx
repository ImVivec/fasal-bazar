'use client';
// "आज · 3 अक्टू" / "कल · 2 अक्टू" / "3 दिन पहले · 30 सित".
// Computed in the browser: pages are pre-built, so "today" must be the reader's today, not the build day.
import { useEffect, useState } from 'react';
import { shortDate, toDay } from '@/lib/dates';
import { fill } from '@/lib/strings';
import type { Lang } from '@/lib/session';

type T = { today: string; yesterday: string; daysAgo: string };

export function relativeDay(date: string, todayIso: string, t: T): string | null {
  const n = toDay(todayIso) - toDay(date);
  if (n === 0) return t.today;
  if (n === 1) return t.yesterday;
  if (n > 1 && n < 7) return fill(t.daysAgo, { n });
  return null;
}

export function DayLabel({ date, lang, t }: { date: string; lang: Lang; t: T }) {
  const [rel, setRel] = useState<string | null>(null);
  useEffect(() => {
    const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10); // IST
    setRel(relativeDay(date, today, t));
  }, [date, t]);
  const abs = shortDate(date, lang);
  return <>{rel ? <><b>{rel}</b> · {abs}</> : <b>{abs}</b>}</>;
}
