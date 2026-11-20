import Decimal from 'decimal.js';
import { profitInTill, segmentIndex } from './profit-in-till';

const d = (v: string | number): Decimal => new Decimal(v);
const seg = (cash: string | number, profit: string | number) => ({ cash: d(cash), profit: d(profit) });

describe('profitInTill', () => {
  it('sums segments when nothing was taken out', () => {
    const r = profitInTill([seg(100, 20)], []);
    expect(r.cash.toFixed(4)).toBe('100.0000');
    expect(r.profit.toFixed(4)).toBe('20.0000');
  });

  it('emptying the till empties the profit, and later sales refill it', () => {
    // The real case: a $6,060.37 handover (≈ $598 profit) withdrawn at once,
    // then $282.96 of own sales carrying $82.90 margin.
    const r = profitInTill([seg('6060.3666', '598.1'), seg('282.9576', '82.9')], [d('6060.3663')]);
    expect(r.cash.toFixed(4)).toBe('282.9579');
    expect(r.profit.toDecimalPlaces(2).toFixed(2)).toBe('82.90');
  });

  it('a partial take-out removes the same share of profit as of cash', () => {
    const r = profitInTill([seg(1000, 200), seg(0, 0)], [d(250)]);
    expect(r.cash.toFixed(4)).toBe('750.0000');
    expect(r.profit.toFixed(4)).toBe('150.0000');
  });

  it('taking out more than the till holds leaves no profit', () => {
    const r = profitInTill([seg(100, 30), seg(0, 0)], [d(120)]);
    expect(r.profit.toFixed(4)).toBe('0.0000');
  });

  it('expenses come fully out of profit and are not scaled by later take-outs', () => {
    // 1000 in (200 profit), 50 expense → 950 / 150, take half the till → 475 / 75.
    const r = profitInTill([seg(950, 150), seg(0, 0)], [d(475)]);
    expect(r.profit.toFixed(4)).toBe('75.0000');
  });

  it('leaves an over-spend untouched by a take-out', () => {
    const r = profitInTill([seg(100, -10), seg(0, 0)], [d(50)]);
    expect(r.profit.toFixed(4)).toBe('-10.0000');
  });

  it('rejects mismatched inputs', () => {
    expect(() => profitInTill([seg(1, 1)], [d(1)])).toThrow();
  });
});

describe('segmentIndex', () => {
  const t = (iso: string) => new Date(iso);
  const cuts = [t('2026-11-18T08:24:00Z'), t('2026-11-19T10:00:00Z')];

  it('places events before, between and after take-outs', () => {
    expect(segmentIndex(t('2026-11-18T08:19:00Z'), cuts)).toBe(0);
    expect(segmentIndex(t('2026-11-18T12:00:00Z'), cuts)).toBe(1);
    expect(segmentIndex(t('2026-11-20T00:00:00Z'), cuts)).toBe(2);
  });

  it('counts an event at the exact take-out instant as after it', () => {
    expect(segmentIndex(t('2026-11-18T08:24:00Z'), cuts)).toBe(1);
  });
});
