import {
  quantityTierLabel,
  resolveQuantityDiscountPercent,
} from './quantity-discount.util';

const cfg = {
  halfDozenPercent: '3',
  dozenPercent: '5',
  cartonPercent: '8',
};

describe('resolveQuantityDiscountPercent', () => {
  it('returns 0 below the half-dozen threshold', () => {
    expect(resolveQuantityDiscountPercent(1, 24, cfg)).toBe(0);
    expect(resolveQuantityDiscountPercent(5, 24, cfg)).toBe(0);
  });

  it('applies the half-dozen tier from 6 up to 11', () => {
    expect(resolveQuantityDiscountPercent(6, 24, cfg)).toBe(3);
    expect(resolveQuantityDiscountPercent(11, 24, cfg)).toBe(3);
  });

  it('applies the dozen tier from 12 (highest met tier wins)', () => {
    expect(resolveQuantityDiscountPercent(12, 24, cfg)).toBe(5);
    expect(resolveQuantityDiscountPercent(23, 24, cfg)).toBe(5);
  });

  it('applies the carton tier at pieces-per-carton', () => {
    expect(resolveQuantityDiscountPercent(24, 24, cfg)).toBe(8);
    expect(resolveQuantityDiscountPercent(48, 24, cfg)).toBe(8);
  });

  it('ignores the carton tier for products with no carton size', () => {
    expect(resolveQuantityDiscountPercent(100, null, cfg)).toBe(5);
    expect(resolveQuantityDiscountPercent(100, 0, cfg)).toBe(5);
  });

  it('handles an odd carton size below the dozen threshold', () => {
    // ppc = 6: at 6 pieces both half-dozen (3) and carton (8) are met → 8.
    expect(resolveQuantityDiscountPercent(6, 6, cfg)).toBe(8);
  });

  it('takes the max when a bigger tier is configured smaller (robust to ordering)', () => {
    const weird = {
      halfDozenPercent: '10',
      dozenPercent: '5',
      cartonPercent: '2',
    };
    // qty 24 meets all three; the max (10) wins even though it is the smallest tier.
    expect(resolveQuantityDiscountPercent(24, 24, weird)).toBe(10);
  });

  it('treats missing/blank percentages as 0', () => {
    const blank = {
      halfDozenPercent: '',
      dozenPercent: '0',
      cartonPercent: '0',
    };
    expect(resolveQuantityDiscountPercent(12, 24, blank)).toBe(0);
  });
});

describe('quantityTierLabel', () => {
  it('is null when no discount applies', () => {
    expect(quantityTierLabel(5, 24, cfg)).toBeNull();
  });

  it('labels each tier at its boundary', () => {
    expect(quantityTierLabel(6, 24, cfg)).toBe('half_dozen');
    expect(quantityTierLabel(12, 24, cfg)).toBe('dozen');
    expect(quantityTierLabel(24, 24, cfg)).toBe('carton');
  });

  it('prefers the largest threshold met when percentages tie', () => {
    const flat = {
      halfDozenPercent: '5',
      dozenPercent: '5',
      cartonPercent: '5',
    };
    expect(quantityTierLabel(24, 24, flat)).toBe('carton');
    expect(quantityTierLabel(12, 24, flat)).toBe('dozen');
  });
});
