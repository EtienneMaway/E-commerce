/**
 * Branch-transfer product picking — the quantity rules shared by the dashboard
 * (`apps/dashboard/lib/transfer-pick.ts`, an identical copy: the two apps share
 * no code) and the mobile send form. Pure TypeScript, unit-tested in
 * `__tests__/transfer-pick.test.ts`.
 *
 * Everything resolves to PIECES per product / per size, which is all the API's
 * `POST /branch-transfers` takes — escrow and debt logic is untouched.
 *
 *  - Simple product: cartons × pieces-per-carton + pieces.
 *  - Sized product, "all sizes" (whole): the same amount goes to EVERY size —
 *    N pieces = N of each size (so the most you can type is the smallest size's
 *    stock), N cartons = each size's own per-carton count × N.
 *  - Sized product, "split": tick sizes, pieces only per size (a carton holds
 *    every size, so there is no carton of one size).
 */

export interface PickSize {
  readonly variantId: string;
  readonly label: string;
  readonly available: number;
  /** Pieces of THIS size in one carton; 0 when unknown (the size takes no part in cartons). */
  readonly piecesPerCarton: number;
}

export interface PickProduct {
  /** productName — unique in a product list. */
  readonly key: string;
  readonly productName: string;
  readonly kind: 'simple' | 'group';
  /** Simple: pieces available. Group: sum over sizes (display only). */
  readonly available: number;
  /** Simple only; 0 when the product has no carton size. */
  readonly piecesPerCarton: number;
  /** Group only, sizes with stock. */
  readonly sizes: readonly PickSize[];
}

export type PickMode = 'whole' | 'split';

export interface PickState {
  readonly mode: PickMode;
  readonly cartons: string;
  readonly pieces: string;
  /** Split mode: ticked sizes and their piece counts, by variantId. */
  readonly sizeOn: Readonly<Record<string, boolean>>;
  readonly sizePieces: Readonly<Record<string, string>>;
}

export const emptyPick = (): PickState => ({ mode: 'whole', cartons: '', pieces: '', sizeOn: {}, sizePieces: {} });

export type PickIssue =
  | { readonly kind: 'empty'; readonly size?: string }
  | { readonly kind: 'noSizes' }
  | { readonly kind: 'tooManyPieces'; readonly size?: string; readonly max: number }
  | { readonly kind: 'tooManyCartons'; readonly max: number }
  /** Cartons + extra pieces together exceed one size's stock. */
  | { readonly kind: 'tooManyCombined'; readonly size: string; readonly max: number };

export interface TransferItem {
  readonly productName: string;
  readonly variantId?: string;
  readonly quantity: number;
}

export interface ResolvedPick {
  readonly items: TransferItem[];
  /** Pieces in total across the items. */
  readonly units: number;
  readonly issue: PickIssue | null;
}

const int = (s: string | undefined): number => {
  const n = parseInt(s ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Sizes that count toward a carton. */
const cartonSizes = (p: PickProduct): PickSize[] => p.sizes.filter((s) => s.piecesPerCarton > 0);

/** Whether a carton field makes sense for this product at all. */
export function hasCartons(p: PickProduct): boolean {
  return p.kind === 'simple' ? p.piecesPerCarton > 0 : cartonSizes(p).length > 0;
}

/** "All sizes" in pieces: the smallest size's stock. Simple: its stock. */
export function maxWholePieces(p: PickProduct): number {
  if (p.kind === 'simple') return p.available;
  return p.sizes.length ? Math.min(...p.sizes.map((s) => s.available)) : 0;
}

/** Full cartons the stock can make up. */
export function maxCartons(p: PickProduct): number {
  if (p.kind === 'simple') return p.piecesPerCarton > 0 ? Math.floor(p.available / p.piecesPerCarton) : 0;
  const gating = cartonSizes(p);
  return gating.length ? Math.min(...gating.map((s) => Math.floor(s.available / s.piecesPerCarton))) : 0;
}

export function resolvePick(p: PickProduct, s: PickState): ResolvedPick {
  const items: TransferItem[] = [];
  const done = (issue: PickIssue | null): ResolvedPick => ({
    items: issue ? [] : items,
    units: items.reduce((n, i) => n + i.quantity, 0),
    issue,
  });

  if (p.kind === 'simple') {
    const c = hasCartons(p) ? int(s.cartons) : 0;
    const q = c * p.piecesPerCarton + int(s.pieces);
    if (q <= 0) return done({ kind: 'empty' });
    items.push({ productName: p.productName, quantity: q });
    if (q > p.available) {
      return c > 0 && int(s.pieces) === 0
        ? done({ kind: 'tooManyCartons', max: maxCartons(p) })
        : done({ kind: 'tooManyPieces', max: p.available });
    }
    return done(null);
  }

  if (s.mode === 'split') {
    const on = p.sizes.filter((z) => s.sizeOn[z.variantId]);
    if (on.length === 0) return done({ kind: 'noSizes' });
    for (const z of on) {
      const q = int(s.sizePieces[z.variantId]);
      if (q <= 0) return done({ kind: 'empty', size: z.label });
      if (q > z.available) return done({ kind: 'tooManyPieces', size: z.label, max: z.available });
      items.push({ productName: p.productName, variantId: z.variantId, quantity: q });
    }
    return done(null);
  }

  // Whole product: the same cartons/pieces apply to every size.
  const c = hasCartons(p) ? int(s.cartons) : 0;
  const n = int(s.pieces);
  if (c === 0 && n === 0) return done({ kind: 'empty' });
  for (const z of p.sizes) {
    const q = c * z.piecesPerCarton + n;
    if (q > z.available) {
      if (c === 0) return done({ kind: 'tooManyPieces', size: z.label, max: maxWholePieces(p) });
      if (n === 0) return done({ kind: 'tooManyCartons', max: maxCartons(p) });
      return done({ kind: 'tooManyCombined', size: z.label, max: z.available });
    }
    if (q > 0) items.push({ productName: p.productName, variantId: z.variantId, quantity: q });
  }
  return done(null);
}

/** Pieces as "2 ctn + 3 pcs" given a carton size; null when cartons don't apply. */
export function splitCartons(pieces: number, perCarton: number): { cartons: number; rest: number } | null {
  if (perCarton <= 0) return null;
  return { cartons: Math.floor(pieces / perCarton), rest: pieces % perCarton };
}

interface RawVariant {
  readonly variantId: string;
  readonly label: string;
  readonly available: number;
  readonly piecesPerCarton?: number | null;
}
interface RawProduct {
  readonly productName: string;
  readonly totalAvailable: number;
  readonly piecesPerCarton?: number | null;
  readonly kind?: 'simple' | 'group';
  readonly variants?: readonly RawVariant[];
}
interface RawVolumeLine {
  readonly productName: string;
  readonly variantId: string | null;
  readonly variantLabel: string | null;
  readonly quantityRemaining: number;
  readonly piecesPerCarton: number | null;
}

/** Owner: `/inventory/products` → pickable products (stock only). */
export function fromProductList(list: readonly RawProduct[]): PickProduct[] {
  const out: PickProduct[] = [];
  for (const p of list) {
    if (p.kind === 'group' && p.variants?.length) {
      const sizes = p.variants
        .filter((v) => v.available > 0)
        .map((v) => ({ variantId: v.variantId, label: v.label, available: v.available, piecesPerCarton: v.piecesPerCarton ?? 0 }));
      if (sizes.length) {
        out.push({ key: p.productName, productName: p.productName, kind: 'group', available: sizes.reduce((n, z) => n + z.available, 0), piecesPerCarton: 0, sizes });
      }
    } else if (p.totalAvailable > 0) {
      out.push({ key: p.productName, productName: p.productName, kind: 'simple', available: p.totalAvailable, piecesPerCarton: p.piecesPerCarton ?? 0, sizes: [] });
    }
  }
  return out.sort((a, b) => a.productName.localeCompare(b.productName));
}

/** Custodian: their volume (`/custody/mine` lines) → pickable products. */
export function fromVolumeLines(lines: readonly RawVolumeLine[]): PickProduct[] {
  const byName = new Map<string, { simple: number; ppc: number; sizes: PickSize[] }>();
  for (const l of lines) {
    if (l.quantityRemaining <= 0) continue;
    const g = byName.get(l.productName) ?? { simple: 0, ppc: 0, sizes: [] };
    if (l.variantId) {
      g.sizes.push({ variantId: l.variantId, label: l.variantLabel ?? '', available: l.quantityRemaining, piecesPerCarton: l.piecesPerCarton ?? 0 });
    } else {
      g.simple += l.quantityRemaining;
      g.ppc = g.ppc || (l.piecesPerCarton ?? 0);
    }
    byName.set(l.productName, g);
  }
  const out: PickProduct[] = [];
  for (const [name, g] of byName) {
    if (g.sizes.length) {
      out.push({ key: name, productName: name, kind: 'group', available: g.sizes.reduce((n, z) => n + z.available, 0), piecesPerCarton: 0, sizes: g.sizes });
    } else {
      out.push({ key: name, productName: name, kind: 'simple', available: g.simple, piecesPerCarton: g.ppc, sizes: [] });
    }
  }
  return out.sort((a, b) => a.productName.localeCompare(b.productName));
}
