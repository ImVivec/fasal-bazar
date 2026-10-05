import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { num, parseDayReport, parseMsp } from '@/lib/agmarknet';

const fx = (f: string) => JSON.parse(readFileSync(`test/fixtures/${f}`, 'utf8'));

describe('num', () => {
  it('handles strings, numbers, nulls and junk', () => {
    expect(num('2800.00')).toBe(2800);
    expect(num('1,234.5')).toBe(1234.5);
    for (const v of [null, undefined, '', 'NA', '0', 0, -5]) expect(num(v)).toBeNull();
  });
});

describe('parseDayReport (recorded market-wise report, 3 Oct 2026)', () => {
  const r = parseDayReport(fx('marketwise_2026_10_03.json'));

  it('aggregates varieties: lowest min, highest max, arrival-weighted modal, summed arrivals', () => {
    expect(r.quotes.get(23)!['2097']).toEqual([500, 3851, 2963, 1929.77]); // onion, 3 varieties
    expect(r.quotes.get(13)!['2097']).toEqual([1100, 5790, 5400, 691.61]); // soyabean
    expect(r.quotes.get(1)!['1236']).toEqual([2200, 2741, 2508, 94.14]); // wheat, 2 rows
  });

  it('counts "Coriander(Leaves)" from a grain mandi as coriander seed (92)', () => {
    expect(r.quotes.get(39)?.['1236']).toBeUndefined();
    expect(r.quotes.get(92)!['1236']).toEqual([13250, 13250, 13250, 0.7]);
  });

  it('records non-curated commodities and counts reporting mandis (incl. NIL)', () => {
    expect(r.uncurated['373']).toEqual({ name: 'Asalia', mandis: 1 });
    expect(r.reporting).toBe(3);
    expect(r.unitSkipped).toBe(0);
  });

  it('F&V coriander leaves are kept as leaves per quintal; aliases merge; odd units are skipped', () => {
    const json = { states: [{ markets: [
      { marketId: 179, marketName: 'Indore(F&V) APMC', commodities: [
        { commodityId: 39, data: [{ minimumPrice: 400, maximumPrice: 1000, modalPrice: 600, arrivals: 90, unitOfPrice: 'Rs./Bundle' }] },
        { commodityId: 1, data: [{ modalPrice: 50, arrivals: 1, unitOfPrice: 'Rs./Unit' }] },
      ] },
      { marketId: 182, marketName: 'Neemuch APMC', commodities: [
        { commodityId: 372, data: [{ minimumPrice: 8000, maximumPrice: 9000, modalPrice: 8500, arrivals: 1, unitOfPrice: 'Rs./Quintal' }] },
        { commodityId: 434, data: [{ minimumPrice: 7000, maximumPrice: 9500, modalPrice: 9500, arrivals: 3, unitOfPrice: 'Rs./Quintal' }] },
        { commodityName: 'NIL Transaction' },
      ] },
    ] }] };
    const p = parseDayReport(json);
    expect(p.quotes.get(39)!['179']).toEqual([400, 1000, 600, 90]);
    expect(p.quotes.get(1)).toBeUndefined();
    expect(p.unitSkipped).toBe(1);
    expect(p.quotes.get(372)!['182']).toEqual([7000, 9500, 9250, 4]); // ashwagandha + asgand merged
  });

  it('tolerates garbage', () => {
    expect(parseDayReport(null).quotes.size).toBe(0);
    expect(parseDayReport({ states: [{ markets: [{ marketId: 'x' }, { marketId: 1, commodities: [{ commodityId: 13, data: [{ modalPrice: null }] }] }] }] }).quotes.size).toBe(0);
  });
});

describe('parseMsp', () => {
  it('reads MSP by Agmarknet name and skips nulls', () => {
    expect(parseMsp(fx('shajapur_2097_nonfaq.json'))).toEqual({});
    expect(parseMsp({ data: { records: [{ cmdt_name: 'Wheat', msp_price: '2585.00' }, { cmdt_name: 'Bengal Gram(Gram)(Whole)', msp_price: '5875' }, { cmdt_name: 'Garlic', msp_price: null }] } }))
      .toEqual({ 1: 2585, 6: 5875 });
  });
});
