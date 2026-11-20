/**
 * What is left to spend on expenses, in FC and in USD.
 *
 * An identical copy lives in apps/dashboard/lib/spend-remaining.ts and
 * apps/mobile/lib/spend-remaining.ts — change both. Tested in
 * apps/mobile/__tests__/spend-remaining.test.ts.
 *
 * Each limit that applies is turned into "FC you could still spend" and "USD
 * you could still spend", and the smaller of each wins:
 *
 * - Business limit (`availableProfitCash`, ledger USD at the System Rate): the
 *   profit still in the till. Cash is FC, so it is worth `× systemRate` FC. A
 *   USD expense has to buy dollars at the Current Market Rate, so the same
 *   headroom buys `× systemRate ÷ marketRate` USD — the API books a USD expense
 *   as `amount × marketRate ÷ systemRate`.
 * - Full employee's daily allowance (USD): the API compares an FC expense at
 *   `amount ÷ systemRate` and a USD one at face value.
 * - Mini's round allowance (FC only): USD is shown for reference at the System
 *   Rate; minis record FC.
 *
 * Expenses queued offline are not on the server yet, so they are taken off the
 * business and daily limits here.
 */

export interface QueuedExpense {
  readonly amount: string;
  readonly currency?: 'USD' | 'FC';
}

export interface SpendRemainingInput {
  /** `availableProfitCash` from /dashboard/cash-position, or null if not visible. */
  readonly profitLedgerUsd: string | null;
  /** Full employee: `remainingUsd` from /expenses/allowance. */
  readonly dailyAllowanceUsd: string | null;
  /** Mini: `remainingFc` from /mini-settlements/expense-allowance. */
  readonly miniAllowanceFc: string | null;
  readonly systemRate: number | null;
  /** Current Market Rate (`sellingRate`). Falls back to the System Rate. */
  readonly marketRate: number | null;
  readonly queued?: readonly QueuedExpense[];
}

export type SpendLimit = 'business' | 'daily' | 'mini';

export interface SpendRemaining {
  /** Whole FC, never negative. */
  readonly fc: number;
  /** USD truncated to cents, never negative. */
  readonly usd: number;
  /** The limit that gives the smallest FC figure. */
  readonly limitedBy: SpendLimit;
}

const num = (v: string | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

export function computeSpendRemaining(input: SpendRemainingInput): SpendRemaining | null {
  const sys = input.systemRate && input.systemRate > 0 ? input.systemRate : null;
  const market = input.marketRate && input.marketRate > 0 ? input.marketRate : sys;
  const queued = input.queued ?? [];

  const candidates: { limit: SpendLimit; fc: number; usd: number }[] = [];

  const profit = num(input.profitLedgerUsd);
  if (profit !== null && sys && market) {
    // Queued expenses in the same ledger USD the API would book them at.
    const queuedLedger = queued.reduce((sum, e) => {
      const a = num(e.amount) ?? 0;
      return sum + ((e.currency ?? 'FC') === 'USD' ? (a * market) / sys : a / sys);
    }, 0);
    const left = profit - queuedLedger;
    candidates.push({ limit: 'business', fc: left * sys, usd: (left * sys) / market });
  }

  const daily = num(input.dailyAllowanceUsd);
  if (daily !== null && sys) {
    const queuedUsd = queued.reduce((sum, e) => {
      const a = num(e.amount) ?? 0;
      return sum + ((e.currency ?? 'FC') === 'USD' ? a : a / sys);
    }, 0);
    const left = daily - queuedUsd;
    candidates.push({ limit: 'daily', fc: left * sys, usd: left });
  }

  const mini = num(input.miniAllowanceFc);
  if (mini !== null) {
    candidates.push({ limit: 'mini', fc: mini, usd: sys ? mini / sys : 0 });
  }

  if (candidates.length === 0) return null;

  const byFc = candidates.reduce((a, b) => (b.fc < a.fc ? b : a));
  const usd = Math.min(...candidates.map((c) => c.usd));
  return {
    fc: Math.max(0, Math.floor(byFc.fc)),
    usd: Math.max(0, Math.trunc(usd * 100) / 100),
    limitedBy: byFc.limit,
  };
}
