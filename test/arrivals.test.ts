import { describe, expect, it } from 'vitest';
import { shapeArrivals, totalByWeek, weekOf } from '@/lib/arrivals-core';
import { fromDay, toDay } from '@/lib/dates';
import type { DailyDoc } from '@/lib/db';

const district = new Map([[2097, 328], [634, 508]]);
const day = (date: string, m: DailyDoc['m']): DailyDoc => ({ _id: `13:${date}`, m });

describe('weekOf', () => {
  it('returns the Monday of the week', () => {
    expect(fromDay(weekOf(toDay('2026-10-04')))).toBe('2026-09-28'); // Sunday
    expect(fromDay(weekOf(toDay('2026-09-28')))).toBe('2026-09-28'); // Monday
    expect(fromDay(weekOf(toDay('2026-10-01')))).toBe('2026-09-28');
  });
});

describe('shapeArrivals', () => {
  const docs = [
    day('2026-09-22', { 2097: [0, 0, 5000, 10], 634: [0, 0, 6000, 30] }),
    day('2026-09-24', { 2097: [0, 0, 5200, 10] }),
    day('2026-09-29', { 2097: [0, 0, 5400, 20] }),
    day('2026-10-03', { 634: [0, 0, 5800, 40] }), // Saturday: the week counts as complete
  ];
  const a = shapeArrivals(docs, (id) => district.get(id), 4);

  it('keeps complete weeks from the first one with data', () => {
    expect(a.weeks.map(fromDay)).toEqual(['2026-09-21', '2026-09-28']);
  });
  it('sums tonnes and weights the price by arrivals per mandi', () => {
    const shaj = a.mandis.find((m) => m.id === 2097)!;
    expect(shaj).toMatchObject({ d: 328, t: [20, 20], p: [5100, 5400] });
    expect(a.mandis.find((m) => m.id === 634)).toMatchObject({ d: 508, t: [30, 40], p: [6000, 5800] });
  });
  it('totals the last 30 days per mandi', () => {
    expect(a.recent).toEqual({ from: '2026-09-04', to: '2026-10-03', t: { 2097: 40, 634: 70 } });
  });
  it('drops an unfinished latest week', () => {
    const b = shapeArrivals([...docs, day('2026-10-06', { 2097: [0, 0, 5500, 99] })], (id) => district.get(id), 4);
    expect(b.weeks.map(fromDay)).toEqual(['2026-09-21', '2026-09-28']);
    expect(b.recent.t[2097]).toBe(139); // but its arrivals still count in the last 30 days
  });
  it('totals a district (or all) per week with an arrival-weighted price', () => {
    expect(totalByWeek(a, () => true)).toEqual({ t: [50, 60], p: [5640, 5667] });
    expect(totalByWeek(a, (m) => m.d === 328)).toEqual({ t: [20, 20], p: [5100, 5400] });
  });
  it('handles no data', () => {
    expect(shapeArrivals([], () => undefined).weeks).toEqual([]);
  });
});
