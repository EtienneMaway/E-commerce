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

/**
 * Repository field names in a file, mapped to the entity they hold:
 * `private readonly miniTeamRepo: Repository<MiniTeamMember>` → miniTeamRepo.
 *
 * Read from the declaration rather than guessed from the entity name. Guessing
 * `miniTeamMemberRepo` is how `MiniTeamMember` sat un-scanned while both of its
 * create paths inserted a null `org_id` — a 500 on every add-teammate request.
 * Half the repos in this codebase are named for something other than their
 * entity (`entryRepo`, `saleRepo`, `extTxRepo`, plain `repo`).
 */
function repoFields(src: string): Map<string, string> {
  const fields = new Map<string, string>();
  const re = /(\w+)\s*:\s*Repository<\s*(\w+)\s*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) fields.set(m[1], m[2]);
  return fields;
}

function serviceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...serviceFiles(full));
    else if (entry.endsWith('.service.ts')) out.push(full);
  }
  return out;
}

/**
 * The whole argument list of a `create(` call, to its matching paren.
 *
 * The arguments, not the first `{` after them: `create(writeScope(ctx))` has no
 * object literal at all, and looking for one walked off into the next method's
 * body and read its braces as the row being created.
 */
function argsOf(src: string, from: number): string {
  const open = src.indexOf('(', from);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') {
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
    const repos = repoFields(src);
    for (const entity of TENANCY_ENTITIES) {
      // `manager.create(Entity, {…})` and `this.someRepo.create({…})` both appear.
      const patterns = [
        new RegExp(`create\\(\\s*${entity}\\s*,`, 'g'),
        ...[...repos.entries()]
          .filter(([, held]) => held === entity)
          .map(([field]) => new RegExp(`\\b${field}\\.create\\(`, 'g')),
      ];
      for (const re of patterns) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) {
          const args = argsOf(src, m.index);
          if (!TENANCY_MARKERS.some((marker) => args.includes(marker))) {
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
