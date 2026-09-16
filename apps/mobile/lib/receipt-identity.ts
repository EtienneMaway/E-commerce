import { usePersonaStore } from '../store/persona.store';
import { useShopStore } from '../store/shop.store';

interface ReceiptUser {
  readonly name?: string | null;
  readonly username: string;
  readonly activeEmployment?: { readonly employer: { readonly username: string } } | null;
}

export interface ReceiptIdentity {
  readonly businessName?: string;
  readonly businessHandle?: string;
  readonly branchName?: string;
  readonly branchAddress?: string;
}

/**
 * Who a receipt is from: the business, then the branch that made the sale.
 *
 * `/auth/me` describes the books the account trades on — the employer's for an
 * employee, whichever persona is active. So the business and branch are only
 * printed when the sale really is on those books: an owner, or an employee in
 * Employer mode. An employee in Self mode keeps the old identity (their own
 * name and handle); printing the employer's shop on their private sale would
 * be wrong.
 *
 * The branch is printed only when the business has more than one — a merchant
 * with a single shop gets the receipt they always had.
 */
export function receiptIdentity(user: ReceiptUser | null | undefined): ReceiptIdentity {
  const isEmployerMode = usePersonaStore.getState().kind === 'employer' && !!user?.activeEmployment;
  const businessHandle = isEmployerMode ? user?.activeEmployment?.employer.username : user?.username;

  const onTenancyBooks = isEmployerMode || !user?.activeEmployment;
  if (!onTenancyBooks) {
    return { businessName: user?.name ?? undefined, businessHandle };
  }

  const { organization, shops, employed, selectedId, defaultShopId } = useShopStore.getState();
  const shopId = employed ? defaultShopId : (selectedId ?? defaultShopId);
  const shop = shops.find((s) => s.id === shopId);
  const multiBranch = !employed && shops.filter((s) => !s.isArchived).length > 1;

  return {
    // Employer mode used to print the handle alone because the client had no
    // employer display name; the business name now fills that gap.
    businessName: organization?.name ?? (isEmployerMode ? undefined : (user?.name ?? undefined)),
    businessHandle,
    branchName: multiBranch || employed ? shop?.name : undefined,
    branchAddress: multiBranch || employed ? (shop?.address ?? undefined) : undefined,
  };
}
