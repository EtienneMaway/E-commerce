import Decimal from 'decimal.js';

/**
 * What came in (or went out) between two "take-outs". Additive: `cash` and
 * `profit` are summed straight onto the till. Sales add their price and their
 * margin; debtor/external payments add the amount and the profit share they
 * carry; expenses subtract their full value from both.
 */
export interface TillSegment {
  readonly cash: Decimal;
  readonly profit: Decimal;
}

export interface TillState {
  readonly cash: Decimal;
  readonly profit: Decimal;
}

/**
 * The profit still sitting inside the till.
 *
 * Cash in the till is a mix of stock money and profit. A take-out (owner
 * withdrawal, payment to another branch) is just cash leaving, so it carries
 * away the same SHARE of profit as its share of the cash: emptying the till
 * empties the profit, taking half takes half. It is never a debt to earn back.
 *
 * `segments[i]` is everything that happened before `takeOuts[i]` (and after
 * `takeOuts[i - 1]`), so `segments.length === takeOuts.length + 1`; the last
 * segment is what happened after the latest take-out.
 *
 * A negative profit (expenses beyond profit, only possible on data that
 * pre-dates the cap) is left as is by a take-out: taking cash out never makes
 * an over-spend smaller or larger.
 */
export function profitInTill(
  segments: readonly TillSegment[],
  takeOuts: readonly Decimal[],
): TillState {
  if (segments.length !== takeOuts.length + 1) {
    throw new Error('profitInTill: need exactly one more segment than take-outs');
  }

  let cash = new Decimal(0);
  let profit = new Decimal(0);

  segments.forEach((segment, i) => {
    cash = cash.plus(segment.cash);
    profit = profit.plus(segment.profit);

    const takeOut = takeOuts[i];
    if (takeOut === undefined) return;

    if (profit.gt(0)) {
      profit =
        cash.gt(0) && takeOut.lt(cash)
          ? profit.mul(cash.minus(takeOut)).div(cash)
          : new Decimal(0);
    }
    cash = cash.minus(takeOut);
  });

  return { cash, profit };
}

/** Index of the segment an event at `at` falls into (events at a take-out's instant count after it). */
export function segmentIndex(at: Date, takeOutTimes: readonly Date[]): number {
  let i = 0;
  while (i < takeOutTimes.length && takeOutTimes[i].getTime() <= at.getTime()) i += 1;
  return i;
}
