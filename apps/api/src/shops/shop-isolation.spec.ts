import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { readScope, writeScope, requireShop } from '../common/shop-scope';
import { testCtx, allShopsCtx } from '../common/testing/actor-context.fixture';

const SRC = join(__dirname, '..');

/**
 * Modules whose queries have been converted to `(org_id, shop_id)`.
 *
 * **Add a module here the moment you convert it.** The test below then fails if
 * any owner-scoped filter survives in it — which is the failure this whole
 * feature is most exposed to: a forgotten filter does not error, it silently
 * pools two branches' figures into one plausible-looking number.
 *
 * Phase 4 converts the rest; migration 033 then drops `owner_id` entirely and
 * this list becomes the whole of `src`.
 */
const CONVERTED_MODULES = [
  'pricing',
  'product-groups',
  'quantity-discounts',
  'stock-movements',
  'inventory',
  'sales',
  'dashboard',
  'expenses',
  'withdrawals',
  'payments',
  'consignments',
  'external-contacts',
  'mini-settlements',
  'activity-logs',
  'employee-roles',
  'branch-transfers',
];

/**
 * Marker that makes an owner-keyed query deliberate.
 *
 * Some columns name a **person**, not a set of books — a mini's own consigned
 * lots, a handover addressed to them. §3.2 calls this the tenancy-key vs
 * person-key distinction, and it is the thing most likely to be "helpfully"
 * converted by someone doing a sweep. Put the marker on the line above with a
 * reason, and this guard leaves it alone.
 */
const EXEMPT_MARKER = 'tenancy-exempt:';

/** Reading a row by owner rather than by branch. */
const OWNER_SCOPED_READ = [
  /where:\s*\{[^}]*\bownerId\b/, // where: { ownerId, ... }
  /['"`]\w*\.?owner_?[iI]d\s*=\s*:/, // qb.where('owner_id = :ownerId')
  /andWhere\([^)]*ownerId/,
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

describe('shop isolation — converted modules filter by branch, not by owner', () => {
  it.each(CONVERTED_MODULES)('%s has no owner-scoped queries left', (mod) => {
    const offenders: string[] = [];

    for (const file of sourceFiles(join(SRC, mod))) {
      const src = readFileSync(file, 'utf8');
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;
        // A marker in the three lines above says "this names a person".
        const exempt = lines.slice(Math.max(0, i - 3), i).some((l) => l.includes(EXEMPT_MARKER));
        if (!exempt && OWNER_SCOPED_READ.some((re) => re.test(line))) {
          offenders.push(`${file.slice(SRC.length + 1)}:${i + 1}  ${line.trim()}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it('no longer writes ownerId where migration 034 dropped the column', () => {
    // `owner_id` survives on five tables only, as a HOLDER key — a mini's
    // consigned lot sits at the employer's branch but belongs to that mini.
    // Everywhere else the tenancy pair replaced it outright.
    const writes = sourceFiles(join(SRC, 'pricing'))
      .concat(sourceFiles(join(SRC, 'expenses')))
      .concat(sourceFiles(join(SRC, 'withdrawals')))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    expect(writes).not.toContain('ownerId: ctx.effectiveOwnerId');
  });
});

describe('shop-scope helpers — the two filter shapes, and nothing else', () => {
  it('scopes a read to one branch', () => {
    expect(readScope(testCtx())).toEqual({ orgId: 'org-1', shopId: 'shop-1' });
  });

  it('drops the branch under "all shops", keeping the business', () => {
    // Filtering on org_id alone is exact by construction. An assembled
    // shop-id array under-reports the moment a branch is created mid-session,
    // and an under-reported rollup looks like a plausible number (§3.10).
    expect(allShopsCtx().shopId).toBeNull();
    expect(readScope(allShopsCtx())).toEqual({ orgId: 'org-1' });
    expect(readScope(allShopsCtx())).not.toHaveProperty('shopId');
  });

  it('refuses to build a write scope without a branch', () => {
    // The guard already rejects any non-GET under "all"; this is the second
    // line of defence, and what gives services a non-null shopId.
    expect(() => writeScope(allShopsCtx())).toThrow();
    expect(() => requireShop(allShopsCtx())).toThrow();
    expect(writeScope(testCtx())).toEqual({ orgId: 'org-1', shopId: 'shop-1' });
  });

  it('reads a mini against the employer business, not their own books', () => {
    // effectiveOwnerId stays the mini (consigned stock is on their books) while
    // orgId is the employer's — the two answer different questions.
    const mini = testCtx({
      tier: 'MINI_EMPLOYEE',
      actorId: 'mini-1',
      effectiveOwnerId: 'mini-1',
      orgId: 'org-employer',
      shopId: 'shop-employer',
    });
    expect(readScope(mini)).toEqual({ orgId: 'org-employer', shopId: 'shop-employer' });
    expect(mini.effectiveOwnerId).toBe('mini-1');
  });
});
