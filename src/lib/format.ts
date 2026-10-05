const inrFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
/** 12345.6 -> "12,346" (Indian grouping). */
export const inr = (n: number) => inrFmt.format(n);
export const rupees = (n: number) => `₹${inr(n)}`;
export const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${inr(Math.abs(n))}`;
export const dateTimeIST = (iso: string, lang: 'en' | 'hi' = 'en') =>
  new Date(iso).toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
