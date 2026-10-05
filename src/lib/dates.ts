// All dates are IST calendar dates as "YYYY-MM-DD" strings; arithmetic is done in UTC to avoid TZ drift.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "30 Sep, 2026" -> "2026-09-30" (null if unparseable). */
export function parseTitleDate(title: string): string | null {
  const m = /^(\d{1,2}) (\w{3}),? (\d{4})$/.exec(title.trim());
  const mi = m ? MONTHS.indexOf(m[2]) : -1;
  if (!m || mi < 0) return null;
  return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** "2026-09-30" -> days since epoch. */
export const toDay = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

/** days since epoch -> "2026-09-30" */
export const fromDay = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);

/** Today's date in India. */
export const todayIST = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

const MONTHS_HI = ['जन', 'फ़र', 'मार्च', 'अप्रै', 'मई', 'जून', 'जुला', 'अग', 'सित', 'अक्टू', 'नव', 'दिस'];

/** "2026-09-30" -> "30 Sep" / "30 सित" */
export const shortDate = (iso: string, lang: 'en' | 'hi' = 'en') =>
  `${+iso.slice(8, 10)} ${(lang === 'hi' ? MONTHS_HI : MONTHS)[+iso.slice(5, 7) - 1]}`;

/** "2026-09" -> "Sep 26" / "सित 26" */
export const shortMonth = (iso: string, lang: 'en' | 'hi' = 'en') =>
  `${(lang === 'hi' ? MONTHS_HI : MONTHS)[+iso.slice(5, 7) - 1]} ${iso.slice(2, 4)}`;
