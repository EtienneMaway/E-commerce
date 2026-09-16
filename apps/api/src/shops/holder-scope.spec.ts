import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { holderColumnsCond, holderCond, holderScope, isOnMyBooks } from '../common/shop-scope';
import { allShopsCtx, testCtx } from '../common/testing/actor-context.fixture';

const SRC = join(__dirname, '..');

/**
 * The five tables whose rows are *held* by a person as well as sitting at a
 * branch. A mini's consigned lot, their sales, the movements on that lot and
 * their debt to the employer all carry the employer's `(org_id, shop_id)` —
 * so a branch-only read on these pools the mini's books into the owner's.
 *
 * That is not hypothetical: after migration 034 every read here filtered by
 * branch alone, and a live test showed the owner's product list counting a
 * mini's goods, an owner sale deducting the mini's lot, and the mini selling the
 * owner's shelf. Mocked-repository unit tests could not see it; this spec reads
 * the source instead.
 */
const HOLDER_FINDS = [
  // this.xRepo.find / findOne / count / exist
  /\b(entryRepo|saleRepo|supplierDebtRepo|debtorCreditRepo|movementRepo|stockMovementRepo)\.(find|findOne|findAndCount|count|exist|exists)\(/g,
  // manager.find(Entity, …)
  /\b(find|findOne|findAndCount|count|exists)\(\s*(InventoryEntry|SaleTransaction|StockMovement|SupplierDebt|DebtorCredit)\s*,/g,
];

const HOLDER_QBS =
  /\b(entryRepo|saleRepo|supplierDebtRepo|debtorCreditRepo|movementRepo|stockMovementRepo)\s*\.createQueryBuilder\(|createQueryBuilder\(\s*(InventoryEntry|SaleTransaction|StockMovement|SupplierDebt|DebtorCredit)\s*,/g;

/** A read that is holder-safe: the helper, or an explicit person key. */
const HOLDER_OK = ['holderScope(', 'holderCond(', 'holderColumnsCond(', 'ownerId', 'owner_id', 'tenancy-exempt:'];

function serviceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...serviceFiles(full));
    else if (entry.endsWith('.service.ts')) out.push(full);
  }
  return out;
}

/** Source from `from` to the matching close paren of the call opened there. */
function callAt(src: string, from: number): string {
  const open = src.indexOf('(', from);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') {
      depth--;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  return src.slice(from);
}

/** A chained query builder expression, up to the statement's end. */
function chainAt(src: string, from: number): string {
  const end = src.indexOf(';', from);
  return src.slice(from, end === -1 ? undefined : end);
}

describe('holder tables are read by branch AND holder', () => {
  const offenders: string[] = [];

  for (const file of serviceFiles(SRC)) {
    const src = readFileSync(file, 'utf8');
    const rel = file.slice(SRC.length + 1);
    const lineOf = (i: number): number => src.slice(0, i).split('\n').length;

    for (const re of HOLDER_FINDS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const call = callAt(src, m.index);
        // Branch-scoped but not holder-scoped is the failure. A lookup by id or
        // by a named person carries no readScope and is judged elsewhere.
        if (call.includes('readScope(') && !HOLDER_OK.some((ok) => call.includes(ok))) {
          offenders.push(`${rel}:${lineOf(m.index)}  branch-only read on a holder table`);
        }
      }
    }

    HOLDER_QBS.lastIndex = 0;
    let q: RegExpExecArray | null;
    while ((q = HOLDER_QBS.exec(src)) !== null) {
      const chain = chainAt(src, q.index);
      const branchScoped = /orgId = :|org_id = :/.test(chain) || chain.includes('applyShopScopeToQb(');
      if (branchScoped && !HOLDER_OK.some((ok) => chain.includes(ok))) {
        offenders.push(`${rel}:${lineOf(q.index)}  branch-only query builder on a holder table`);
      }
    }
  }

  it('finds no branch-only read on inventory, sales, movements, debts or credits', () => {
    expect(offenders).toEqual([]);
  });
});

describe('holder scope helpers', () => {
  const mini = testCtx({ actorId: 'mini-1', effectiveOwnerId: 'mini-1' });

  it('holderScope adds the holder to the branch scope', () => {
    expect(holderScope(testCtx())).toEqual({ orgId: 'org-1', shopId: 'shop-1', ownerId: 'owner-1' });
    expect(holderScope(allShopsCtx())).toEqual({ orgId: 'org-1', ownerId: 'owner-1' });
  });

  it('holderCond binds org, shop and holder under the alias', () => {
    const [sql, params] = holderCond('s', mini);
    expect(sql).toBe('s.orgId = :sHolderOrg AND s.shopId = :sHolderShop AND s.ownerId = :sHolderOwner');
    expect(params).toEqual({ sHolderOrg: 'org-1', sHolderShop: 'shop-1', sHolderOwner: 'mini-1' });
    expect(holderCond('s', allShopsCtx())[0]).not.toContain('shopId');
  });

  it('holderColumnsCond requires a branch, like every write', () => {
    expect(() => holderColumnsCond(allShopsCtx())).toThrow('Select a shop for this action');
    expect(holderColumnsCond(testCtx())[1]).toEqual({
      holderColOrg: 'org-1',
      holderColShop: 'shop-1',
      holderColOwner: 'owner-1',
    });
  });

  it("isOnMyBooks refuses a row at my branch that someone else holds", () => {
    const minisLot = { orgId: 'org-1', shopId: 'shop-1', ownerId: 'mini-1' };
    expect(isOnMyBooks(minisLot, testCtx())).toBe(false);
    expect(isOnMyBooks(minisLot, mini)).toBe(true);
    expect(isOnMyBooks({ ...minisLot, shopId: 'shop-2' }, mini)).toBe(false);
    expect(isOnMyBooks({ ...minisLot, shopId: 'shop-2' }, allShopsCtx({ effectiveOwnerId: 'mini-1' }))).toBe(true);
  });
});
