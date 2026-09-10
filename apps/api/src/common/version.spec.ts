import { compareVersions } from './version';

describe('compareVersions', () => {
  it('orders by numeric segment, not lexically', () => {
    expect(compareVersions('1.2.10', '1.2.9')).toBe(1);
    expect(compareVersions('1.2.9', '1.2.10')).toBe(-1);
  });

  it('treats missing segments as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.1', '1.2')).toBe(1);
  });

  it('compares major before minor', () => {
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
  });

  it('never throws on junk a client might send', () => {
    expect(compareVersions('', '1.0.0')).toBe(-1);
    expect(compareVersions('abc', '0.0.0')).toBe(0);
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(0);
  });
});
