import Decimal from 'decimal.js';

/**
 * A BranchTransfersService stand-in for specs that construct a service by hand
 * and don't care about branch transfers: nothing in transit, nothing pending,
 * no branch cash moved.
 */
export function branchTransfersStub(): {
  custodyHasTransferInTransit: () => Promise<boolean>;
  custodianHasPendingPayment: () => Promise<boolean>;
  custodianCashFc: () => Promise<{ paidOutFc: Decimal; receivedFc: Decimal }>;
  productInTransit: () => Promise<boolean>;
} {
  return {
    custodyHasTransferInTransit: async () => false,
    custodianHasPendingPayment: async () => false,
    custodianCashFc: async () => ({ paidOutFc: new Decimal(0), receivedFc: new Decimal(0) }),
    productInTransit: async () => false,
  };
}
