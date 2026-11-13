import {
  emptyPick,
  fromVolumeLines,
  maxCartons,
  maxWholePieces,
  resolvePick,
  type PickProduct,
} from '../lib/transfer-pick';

const sized: PickProduct = {
  key: 'shoe',
  productName: 'shoe',
  kind: 'group',
  available: 10,
  piecesPerCarton: 0,
  sizes: [
    { variantId: 'L', label: 'Large', available: 5, piecesPerCarton: 2 },
    { variantId: 'S', label: 'Small', available: 3, piecesPerCarton: 1 },
    { variantId: 'M', label: 'Medium', available: 2, piecesPerCarton: 1 },
  ],
};
const rice: PickProduct = { key: 'rice', productName: 'rice', kind: 'simple', available: 13, piecesPerCarton: 5, sizes: [] };

describe('transfer pick — sized, all sizes', () => {
  it('caps pieces at the smallest size (5/3/2 → 2)', () => {
    expect(maxWholePieces(sized)).toBe(2);
    const ok = resolvePick(sized, { ...emptyPick(), pieces: '2' });
    expect(ok.issue).toBeNull();
    expect(ok.items.map((i) => [i.variantId, i.quantity])).toEqual([['L', 2], ['S', 2], ['M', 2]]);
    expect(resolvePick(sized, { ...emptyPick(), pieces: '3' }).issue).toEqual({ kind: 'tooManyPieces', size: 'Medium', max: 2 });
  });

  it('a carton sends each size its own per-carton count', () => {
    expect(maxCartons(sized)).toBe(2);
    const r = resolvePick(sized, { ...emptyPick(), cartons: '2' });
    expect(r.items.map((i) => i.quantity)).toEqual([4, 2, 2]);
    expect(resolvePick(sized, { ...emptyPick(), cartons: '3' }).issue).toEqual({ kind: 'tooManyCartons', max: 2 });
  });

  it('cartons + pieces together are checked per size', () => {
    expect(resolvePick(sized, { ...emptyPick(), cartons: '1', pieces: '1' }).issue).toBeNull();
    expect(resolvePick(sized, { ...emptyPick(), cartons: '2', pieces: '1' }).issue).toMatchObject({ kind: 'tooManyCombined' });
  });

  it('requires a quantity', () => {
    expect(resolvePick(sized, emptyPick()).issue).toEqual({ kind: 'empty' });
  });
});

describe('transfer pick — sized, split', () => {
  it('needs a ticked size and pieces for each', () => {
    const base = { ...emptyPick(), mode: 'split' as const };
    expect(resolvePick(sized, base).issue).toEqual({ kind: 'noSizes' });
    expect(resolvePick(sized, { ...base, sizeOn: { L: true } }).issue).toEqual({ kind: 'empty', size: 'Large' });
    const r = resolvePick(sized, { ...base, sizeOn: { L: true, M: true }, sizePieces: { L: '5', M: '1', S: '3' } });
    expect(r.items.map((i) => [i.variantId, i.quantity])).toEqual([['L', 5], ['M', 1]]);
    expect(resolvePick(sized, { ...base, sizeOn: { S: true }, sizePieces: { S: '4' } }).issue).toEqual({ kind: 'tooManyPieces', size: 'Small', max: 3 });
  });
});

describe('transfer pick — simple', () => {
  it('adds cartons and pieces', () => {
    expect(resolvePick(rice, { ...emptyPick(), cartons: '2', pieces: '3' }).items).toEqual([{ productName: 'rice', quantity: 13 }]);
    expect(resolvePick(rice, { ...emptyPick(), cartons: '3' }).issue).toEqual({ kind: 'tooManyCartons', max: 2 });
    expect(resolvePick(rice, { ...emptyPick(), pieces: '14' }).issue).toEqual({ kind: 'tooManyPieces', max: 13 });
  });

  it('ignores cartons when the product has no carton size', () => {
    const loose = { ...rice, piecesPerCarton: 0 };
    expect(resolvePick(loose, { ...emptyPick(), cartons: '2' }).issue).toEqual({ kind: 'empty' });
  });
});

it('groups a custodian volume into sized and simple products', () => {
  const list = fromVolumeLines([
    { productName: 'shoe', variantId: 'L', variantLabel: 'Large', quantityRemaining: 5, piecesPerCarton: 2 },
    { productName: 'shoe', variantId: 'S', variantLabel: 'Small', quantityRemaining: 3, piecesPerCarton: 1 },
    { productName: 'rice', variantId: null, variantLabel: null, quantityRemaining: 13, piecesPerCarton: 5 },
  ]);
  expect(list.map((p) => [p.productName, p.kind, p.sizes.length])).toEqual([['rice', 'simple', 0], ['shoe', 'group', 2]]);
});
