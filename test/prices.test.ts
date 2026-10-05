import { describe, expect, it } from 'vitest';
import { shapeCropView, weekChangeOf } from '@/lib/prices-core';
import { toDay } from '@/lib/dates';

const info = new Map([[2097, { name: 'Shajapur', d: 328 }], [634, { name: 'Ramganjmandi', d: 508 }], [1236, { name: 'Agar', d: 287 }], [4544, { name: 'Old', d: 328 }]]);
const market = (id: number) => info.get(id);
const day = (date: string, m: Record<string, unknown>) => ({ _id: `13:${date}`, m });

describe('shapeCropView (crop-keyed docs, all districts)', () => {
  const docs = [
    day('2026-09-21', { 2097: [0, 0, 2500, 1] }),
    day('2026-09-23', { 2097: [0, 0, 2600, 1], 634: [0, 0, 3000, 1] }),
    day('2026-09-28', { 2097: [2700, 2800, 2770, 10] }),
    day('2026-09-29', { 634: ['2900', '3000', '2950', '5'] }),
    day('2026-09-30', { 2097: [2750, 2850, 2800, 12], 634: [2850, 2950, 2900, 7], 9999: [1, 1, 9999, 1], x: 'junk' }),
    day('2026-09-01', { 1236: [3000, 3200, 3100, 4] }), // stale
    { _id: '13:bad', m: { 2097: [1, 1, 1, 1] } },
  ];
  const monthly = [{ _id: '13:2019-01', m: { 4544: [1500, 3] } }, { _id: '13:2025-12', m: { 634: [2400, 20] } }];
  const v = shapeCropView(docs, monthly, market);

  it('rows across districts, high -> low, stale last, unknown mandis dropped', () => {
    expect(v.rows.map((r) => [r.name, r.d, r.price, r.stale])).toEqual([
      ['Ramganjmandi', 508, 2900, false], ['Shajapur', 328, 2800, false], ['Agar', 287, 3100, true],
    ]);
    expect(v.rows[1]).toMatchObject({ min: 2750, max: 2850, arrivals: 12, prevDate: '2026-09-28', change: 30 });
    expect(v.rows[0]).toMatchObject({ prevDate: '2026-09-29', change: -50 }); // string numbers accepted
  });

  it('week change per mandi (closest report 5–10 days back) and averaged per selection', () => {
    expect(v.rows[1].weekDelta).toBe(2800 - 2600); // 23 Sep is closest to 7 days before 30 Sep
    expect(v.rows[0].weekDelta).toBe(2900 - 3000);
    expect(weekChangeOf(v.rows)).toBe(50);
    expect(weekChangeOf(v.rows.filter((r) => r.d === 508))).toBe(-100);
  });

  it('series carry districts; monthly = stored summaries + months computed from daily', () => {
    expect(v.series.find((s) => s.id === 634)!.d).toBe(508);
    expect(v.monthly.find((s) => s.id === 634)!.points).toEqual([[toDay('2025-12-01'), 2400], [toDay('2026-09-01'), 2950]]);
    expect(v.monthly.some((s) => s.id === 4544)).toBe(true);
    expect(v.rows.some((r) => r.id === 4544)).toBe(false);
  });

  it('handles no data', () => {
    expect(shapeCropView([], [], market)).toEqual({ rows: [], latestDate: null, series: [], monthly: [] });
    expect(weekChangeOf([])).toBeNull();
  });
});
