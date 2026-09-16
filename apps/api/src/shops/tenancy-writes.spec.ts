import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..');

/**
 * Entities whose rows must carry `(org_id, shop_id)` — every table migration
 * 034 marked NOT NULL. Creating one without the pair is not a type error and
 * not a lint error: it is a 500 at runtime, on a path a unit test with a mocked
 * repository will happily let through.
 *
 * That is exactly how hiring broke — `employments.shop_id` became NOT NULL and
 * all three hire paths kept inserting without it. Nothing caught it until a
 * real request hit a real database. This spec is the cheap version of that
 * discovery.
 */
const TENANCY_ENTITIES = [
  'InventoryEntry',
  'StockMovement',
  'ProductGroup',
  'ProductVariant',
  'ProductPrice',
  'QuantityDiscount',
  'SaleTransaction',
  'Expense',
  'Withdrawal',
  'ExternalTransaction',
  'ExternalContact',
  'SupplierDebt',
  'DebtorCredit',
  'MiniExpense',
  'MiniSettlement',
  'MiniTeamMember',
  'Payment',
  'Employment',
  'SalaryPayment',
];

/** Ways a create can legitimately get its tenancy. */
const TENANCY_MARKERS = [
  'writeScope(',
  'hireScope(',
  'orgId',
  'shopId',
  'supplierSide',
  'debtorSide',
  // StockMovementsService derives the pair from the lot being moved.
  'input.entry',
];

function serviceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...serviceFiles(full));
    else if (entry.endsWith('.service.ts')) out.push(full);
  }
  return out;
}

/** The object literal that follows a `create(` call, to its matching brace. */
function literalAfter(src: string, from: number): string {
  const open = src.indexOf('{', from);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return src.slice(open);
}

describe('every tenancy-carrying row is created with a branch', () => {
  const offenders: string[] = [];

  for (const file of serviceFiles(SRC)) {
    const src = readFileSync(file, 'utf8');
    for (const entity of TENANCY_ENTITIES) {
      // `manager.create(Entity, {…})` and `this.xRepo.create({…})` both appear.
      const patterns = [
        new RegExp(`create\\(\\s*${entity}\\s*,`, 'g'),
        new RegExp(`${entity.charAt(0).toLowerCase()}${entity.slice(1)}Repo\\.create\\(`, 'g'),
      ];
      for (const re of patterns) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) {
          const literal = literalAfter(src, m.index);
          if (!TENANCY_MARKERS.some((marker) => literal.includes(marker))) {
            const line = src.slice(0, m.index).split('\n').length;
            offenders.push(`${file.slice(SRC.length + 1)}:${line}  create(${entity}) has no branch`);
          }
        }
      }
    }
  }

  it('finds no create without a tenancy pair', () => {
    expect(offenders).toEqual([]);
  });
});
