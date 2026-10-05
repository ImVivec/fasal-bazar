import { describe, expect, it } from 'vitest';
import { analyzeCrop } from '@/lib/analysis-core';
import { addMonths } from '@/lib/ingest-core';
import { fromDay, toDay } from '@/lib/dates';

const names = new Map([[1, { name: 'A', d: 328 }], [2, { name: 'B', d: 335 }], [3, { name: 'C', d: 328 }]]);
const name = (id: number) => names.get(id);
const day = (date: string, m: Record<string, unknown>) => ({ _id: `13:${date}`, m });

describe('analyzeCrop', () => {
  // 10 days at ~5000 before, then today at higher prices.
  const base = toDay('2026-10-03');
  const days = [
    ...Array.from({ length: 10 }, (_, i) => day(fromDay(base - 20 + i), { 1: [0, 0, 5000, 100], 2: [0, 0, 5000, 50] })),
    // a year ago: ~4000
    ...Array.from({ length: 5 }, (_, i) => day(fromDay(base - 367 + i), { 1: [0, 0, 4000, 10] })),
    day('2026-10-03', { 1: [5100, 5800, 5600, 300], 2: [5000, 5500, 5200, 100], 9: [0, 0, 9999, 1] }),
  ];
  const a = analyzeCrop(days, [], name, 5708);

  it('verdict vs the last 30 days, last year and MSP', () => {
    expect(a.date).toBe('2026-10-03');
    expect(a.avg).toBe(5400);
    expect(a.vs30).toEqual({ avg: 5000, pct: 8 });
    expect(a.verdict).toBe('good');
    expect(a.vsLastYear).toEqual({ avg: 4000, pct: 35 });
    expect(a.vsMsp).toEqual({ msp: 5708, diff: -308 });
  });

  it('best mandi, comparison and arrivals (unknown markets ignored)', () => {
    expect(a.best).toEqual({ id: 1, name: 'A', d: 328, price: 5600, aboveAvg: 200 });
    expect(a.mandis.map((m) => [m.name, m.price, m.min, m.max])).toEqual([['A', 5600, 5100, 5800], ['B', 5200, 5000, 5500]]);
    expect(a.arrivals).toEqual({ today: 400, normal: 150, pct: 166.7 });
  });

  it('normal / weak verdicts and too-little-history', () => {
    const flat = analyzeCrop([...days.slice(0, 10), day('2026-10-03', { 1: [0, 0, 5050, 1] })], [], name, null);
    expect(flat.verdict).toBe('normal');
    const low = analyzeCrop([...days.slice(0, 10), day('2026-10-03', { 1: [0, 0, 4500, 1] })], [], name, null);
    expect(low.verdict).toBe('weak');
    const fresh = analyzeCrop([day('2026-10-03', { 1: [0, 0, 4500, 1] })], [], name, null);
    expect([fresh.vs30, fresh.verdict, fresh.arrivals, fresh.vsMsp]).toEqual([null, null, null, null]);
  });

  it('seasonal pattern removes the yearly trend and picks the best months', () => {
    // 2021–2025: prices rise 10%/year; March is always +20%, September always -10%.
    const months = [];
    for (let y = 2021; y <= 2025; y++) {
      for (let m = 1; m <= 12; m++) {
        const lvl = 1000 * 1.1 ** (y - 2021) * (m === 3 ? 1.2 : m === 9 ? 0.9 : m === 2 ? 1.05 : 1);
        months.push({ _id: `13:${y}-${String(m).padStart(2, '0')}`, m: { 1: [Math.round(lvl), 20] } as Record<string, unknown> });
      }
    }
    const s = analyzeCrop(days, months, name, null);
    expect(s.years).toBe(5);
    expect(s.bestMonths).toEqual([3, 2]);
    expect(s.seasonal!.find((x) => x.month === 3)!.pct).toBeGreaterThan(15);
    expect(s.seasonal!.find((x) => x.month === 9)!.pct).toBeLessThan(-10);
    expect(addMonths('2025-12', 1)).toBe('2026-01');
  });

  it('district filter keeps only that district\'s mandis', () => {
    const only335 = analyzeCrop(days, [], name, null, (m) => m.d === 335);
    expect(only335.mandis.map((m) => m.name)).toEqual(['B']);
    expect(only335.avg).toBe(5200);
  });

  it('skips a half-reported latest day (e.g. today before evening)', () => {
    const four = new Map([1, 2, 3, 4].map((id) => [id, { name: `M${id}`, d: 328 }]));
    const full = (date: string) => day(date, { 1: [0, 0, 5000, 1], 2: [0, 0, 5100, 1], 3: [0, 0, 5200, 1], 4: [0, 0, 5300, 1] });
    const docs = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'].map(full);
    const partial = analyzeCrop([...docs, day('2026-10-04', { 1: [0, 0, 4000, 1] })], [], (id) => four.get(id), null);
    expect(partial.date).toBe('2026-10-03'); // 1 mandi on 4 Oct vs usually 4
    expect(partial.avg).toBe(5150);
  });

  it('handles no data', () => {
    expect(analyzeCrop([], [], name, null)).toMatchObject({ date: null, avg: null, best: null, mandis: [], seasonal: null });
  });
});
