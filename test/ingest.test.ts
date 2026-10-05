import { describe, expect, it } from 'vitest';
import { activeSummary, addDays, addMonths, buildDailyOps, buildMonthlyOps, cropRange, dailyId, dailyPlan, marketWatchDiff, mergeCropWatch } from '@/lib/ingest-core';
import type { DayQuote } from '@/lib/agmarknet';

describe('buildDailyOps', () => {
  it('one idempotent upsert per crop, one $set path per mandi', () => {
    const q = new Map<number, Record<string, DayQuote>>([[13, { 2097: [1, 2, 3, 4], 634: [5, 6, 7, 8] }]]);
    expect(buildDailyOps('2026-10-03', q)).toEqual([
      { updateOne: { filter: { _id: '13:2026-10-03' }, update: { $set: { 'm.634': [5, 6, 7, 8], 'm.2097': [1, 2, 3, 4] } }, upsert: true } },
    ]);
  });
});

describe('buildMonthlyOps', () => {
  it('averages modal per mandi over the month, ignoring other months and bad values', () => {
    const docs = [
      { _id: '13:2026-09-01', m: { 2097: [0, 0, 5000, 1], 634: [0, 0, 6000, 1] } },
      { _id: '13:2026-09-02', m: { 2097: [0, 0, 5200, 1], 634: [0, 0, 0, 0] } },
      { _id: '13:2026-08-31', m: { 2097: [0, 0, 9999, 1] } },
      { _id: '1:2026-09-05', m: { 2097: [0, 0, 2500, 1] } },
    ];
    expect(buildMonthlyOps('2026-09', docs)).toEqual([
      { updateOne: { filter: { _id: '13:2026-09' }, update: { $set: { 'm.2097': [5100, 2], 'm.634': [6000, 1] } }, upsert: true } },
      { updateOne: { filter: { _id: '1:2026-09' }, update: { $set: { 'm.2097': [2500, 1] } }, upsert: true } },
    ]);
  });
});

describe('ranges and dates', () => {
  it('cropRange covers exactly one crop', () => {
    const { $gte, $lte } = cropRange(13, '2025-10-03', '2026-10-03')._id;
    const inR = (id: string) => id >= $gte && id <= $lte;
    expect(inR(dailyId(13, '2026-01-01'))).toBe(true);
    expect(inR(dailyId(13, '2025-10-02'))).toBe(false);
    expect(inR(dailyId(1, '2026-01-01'))).toBe(false);
    expect(inR(dailyId(130, '2026-01-01'))).toBe(false);
    expect(inR('13:2026-09')).toBe(true); // month keys sort inside the same crop range too
  });
  it('adds days and months across boundaries', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
});

describe('dailyPlan', () => {
  it('today plus two days of late reports; summary of last month once', () => {
    expect(dailyPlan('2026-10-15', '2026-09')).toEqual({ dates: ['2026-10-13', '2026-10-14', '2026-10-15'], summarize: [] });
    expect(dailyPlan('2026-11-01', '2026-09')).toEqual({ dates: ['2026-10-30', '2026-10-31', '2026-11-01'], summarize: ['2026-10'] });
    expect(dailyPlan('2027-06-10', '2026-11').summarize).toEqual(['2026-12', '2027-01', '2027-02']);
  });
});

describe('activeSummary', () => {
  it('latest date, distinct mandis in window, modal range on the latest day', () => {
    expect(activeSummary([
      { _id: '13:2026-10-01', m: { 2097: [0, 0, 5000, 1], 634: [0, 0, 5600, 1] } },
      { _id: '13:2026-10-03', m: { 2097: [0, 0, 5400, 1], 1236: [0, 0, 5700, 1] } },
    ])).toEqual({ 13: { date: '2026-10-03', mandis: 3, lo: 5400, hi: 5700 } });
  });
});

describe('marketWatchDiff', () => {
  const code = [{ id: 1, en: 'Agar' }, { id: 2, en: 'Kota (F&V)' }, { id: 3, en: 'Gone' }];
  const agm = [
    { id: 1, name: 'Agar APMC', district: 287, state: 19 },
    { id: 2, name: 'Kota (F&V)  APMC', district: 508, state: 29 },
    { id: 9, name: 'Newpur APMC', district: 328, state: 19 },
  ];
  it('finds new, missing and renamed mandis; keeps first-seen dates', () => {
    expect(marketWatchDiff(code, agm, [], '2026-10-04')).toEqual({
      added: [{ id: 9, name: 'Newpur APMC', district: 328, firstSeen: '2026-10-04' }], missing: [3], renamed: [],
    });
    expect(marketWatchDiff(code, agm, [{ id: 9, name: 'Newpur APMC', district: 328, firstSeen: '2026-09-01' }], '2026-10-04').added[0].firstSeen).toBe('2026-09-01');
    expect(marketWatchDiff([{ id: 1, en: 'Agar' }], [{ id: 1, name: 'Agar Malwa APMC', district: 287, state: 19 }], [], 'x').renamed)
      .toEqual([{ id: 1, code: 'Agar', agm: 'Agar Malwa APMC' }]);
  });
});

describe('mergeCropWatch', () => {
  it('counts distinct days going forward and widens first-seen going back', () => {
    let w = mergeCropWatch({}, { 373: { name: 'Asalia' } }, '2026-10-02');
    w = mergeCropWatch(w, { 373: { name: 'Asalia' } }, '2026-10-02');
    w = mergeCropWatch(w, { 373: { name: 'Asalia' } }, '2026-10-03');
    w = mergeCropWatch(w, { 373: { name: 'Asalia' } }, '2026-09-30');
    expect(w).toEqual({ 373: { name: 'Asalia', firstSeen: '2026-09-30', lastSeen: '2026-10-03', days: 2 } });
  });
});
