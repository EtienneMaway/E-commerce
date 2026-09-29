import axios, { type InternalAxiosRequestConfig } from 'axios';
import { isShopRequiredError } from './utils';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export const api = axios.create({
  baseURL: BASE,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// Module-level token — updated by the auth store on login/logout/hydrate.
// Avoids any circular imports or SSR/localStorage timing issues.
let _token: string | null = null;
let _actingAs: 'self' | 'employer' = 'self';
/** Selected branch, or 'all' for a cross-branch read. Null = the default shop. */
let _shopId: string | null = null;
/** Selected business, for the rare owner who runs more than one. */
let _orgId: string | null = null;

export function setAuthToken(token: string | null) {
  _token = token;
}

export function setActingAs(kind: 'self' | 'employer') {
  _actingAs = kind;
}

export function setShopId(shopId: string | null) {
  _shopId = shopId;
}

export function setOrgId(orgId: string | null) {
  _orgId = orgId;
}

api.interceptors.request.use((config) => {
  if (_token) {
    config.headers.set('Authorization', `Bearer ${_token}`);
  }
  // Send user's locale so the API can return translated error messages
  const locale = typeof window !== 'undefined' ? (localStorage.getItem('ta_locale') ?? 'en') : 'en';
  config.headers.set('Accept-Language', locale);
  // Persona toggle — read localStorage on every request so a switch in one tab
  // is honoured by axios calls in another. Fall back to the module-level
  // _actingAs during SSR or before localStorage is populated on cold boot.
  let persona: 'self' | 'employer' = _actingAs;
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('ta_persona');
    if (stored === 'employer' || stored === 'self') persona = stored;
  }
  config.headers.set('X-Acting-As', persona);

  // Branch selection, read from localStorage on every request for the same
  // reason the persona is: a switch in one tab must be honoured in another.
  // Absent, the API resolves the organization's default shop — which is what
  // keeps every screen that has not been touched yet working unchanged.
  let shopId = _shopId;
  let orgId = _orgId;
  if (typeof window !== 'undefined') {
    shopId = localStorage.getItem('ta_shop');
    orgId = localStorage.getItem('ta_org');
  }
  if (shopId) config.headers.set('X-Shop-Id', shopId);
  if (orgId) config.headers.set('X-Org-Id', orgId);

  return config;
});

// ─── "Select a branch" — pause, ask, replay ──────────────────────────────────

/**
 * How the UI asks which branch a write belongs to. Resolves with the chosen
 * branch id, or null if the user backed out.
 *
 * A module-level slot rather than React context, because the caller is an axios
 * interceptor and not a component — the same reason `_token` and `_shopId` live
 * up here. `components/ui/BranchRequiredDialog.tsx` registers it on mount.
 */
type BranchChooser = () => Promise<string | null>;
let _branchChooser: BranchChooser | null = null;
let _branchPending: Promise<string | null> | null = null;

export function setBranchChooser(fn: BranchChooser | null): void {
  _branchChooser = fn;
}

/**
 * One prompt, however many requests were refused.
 *
 * A screen can have several writes in flight at once (a bulk add, or a form
 * that saves two things). Without this they would each open the dialog and the
 * user would answer the same question three times. The first caller opens it;
 * the rest wait on the same answer.
 */
function chooseBranch(): Promise<string | null> {
  if (!_branchChooser) return Promise.resolve(null);
  if (!_branchPending) {
    _branchPending = _branchChooser().finally(() => {
      _branchPending = null;
    });
  }
  return _branchPending;
}

type RetriedConfig = InternalAxiosRequestConfig & { _branchRetried?: boolean };

/**
 * Under "All branches" the API refuses every write — it cannot know which
 * branch a sale or a teammate belongs to. That refusal used to surface as a
 * bare error toast, leaving the user to go find the switcher, change branch,
 * and fill the whole form in again.
 *
 * Now it is a question: the dialog asks which branch, and the request that was
 * refused is replayed against the answer. The caller — a React Query mutation,
 * usually — never learns any of this happened. Its promise simply takes longer
 * to settle, and `onSuccess` runs as though the first attempt had worked, so
 * every existing form resumes with no changes of its own.
 *
 * The retry re-runs the request interceptor rather than stamping `X-Shop-Id`
 * here: the dialog has already written the choice to the shop store, and so to
 * localStorage, which is what keeps this request and every later one on the
 * same branch. `_branchRetried` bounds it to one extra attempt, so a request
 * refused for some *other* reason after the switch cannot loop.
 */
api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const config = axios.isAxiosError(error)
      ? (error.config as RetriedConfig | undefined)
      : undefined;

    if (!config || config._branchRetried || !isShopRequiredError(error)) {
      return Promise.reject(error);
    }

    const shopId = await chooseBranch();
    // Backed out, or there was nothing to choose from: let the original
    // refusal surface exactly the way it always did.
    if (!shopId) return Promise.reject(error);

    config._branchRetried = true;
    return api.request(config);
  },
);

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (body: { emailOrPhone: string; password: string }) =>
    api.post('/auth/login', body).then((r) => r.data),
  register: (body: { username: string; email?: string; phone?: string; password: string }) =>
    api.post('/auth/register', body).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api.patch('/auth/password', body).then((r) => r.data),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  search: (q: string) =>
    api.get('/users/search', { params: { q } }).then((r) => r.data),
};

// ─── Account ──────────────────────────────────────────────────────────────────

export const accountApi = {
  /**
   * Close the signed-in account. The API soft-deletes immediately and starts a
   * 7-day grace window, returning when it expires; after that the row is
   * anonymised rather than dropped, so counterparties keep their own trading
   * history. Same endpoint the mobile app calls.
   */
  deleteAccount: (body: { password: string }): Promise<{ deletedAt: string; expiresAt: string }> =>
    api.delete('/users/me', { data: body }).then((r) => r.data),
};

// ─── Inventory ────────────────────────────────────────────────────────────────

export const inventoryApi = {
  listProducts: () => api.get('/inventory/products').then((r) => r.data),

  list: (params?: {
    source?: string;
    category?: string;
    productName?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: unknown[]; pagination: PaginationMeta }> =>
    api.get('/inventory', { params }).then((r) => r.data),
  addPersonal: (body: { productName: string; unitCost: string; sellingPrice: string; quantity: number; category?: string; cartonPrice?: string; piecesPerCarton?: number }) =>
    api.post('/inventory/personal', body).then((r) => r.data),
  addPersonalBulk: (body: {
    items: Array<{
      productName: string;
      unitCost: string;
      sellingPrice: string;
      quantity: number;
      category?: string;
      cartonPrice?: string;
      piecesPerCarton?: number;
    }>;
  }) => api.post('/inventory/personal/bulk', body).then((r) => r.data),
  receiveFromSupplier: (body: { supplierUserId: string; productName: string; unitCost: string; sellingPrice: string; quantity: number; category?: string; cartonPrice?: string; piecesPerCarton?: number }) =>
    api.post('/inventory/receive', body).then((r) => r.data),
  updateSellingPrice: (id: string, sellingPrice: string) =>
    api.patch(`/inventory/${id}/selling-price`, { sellingPrice }).then((r) => r.data),
  renameProduct: (
    currentName: string,
    newName: string,
  ): Promise<{
    oldName: string;
    newName: string;
    entriesUpdated: number;
    salesUpdated: number;
    externalTxUpdated: number;
    pricingUpdated: number;
  }> =>
    api
      .patch(`/inventory/products/${encodeURIComponent(currentName)}/rename`, { newName })
      .then((r) => r.data),
  adjustStock: (
    entryId: string,
    body: { reason: string; qty: number; notes?: string },
  ) => api.post(`/inventory/${entryId}/adjust`, body).then((r) => r.data),
  adjustVariantStock: (
    variantId: string,
    body: { reason: string; qty: number; notes?: string },
  ) => api.post(`/inventory/variant/${variantId}/adjust`, body).then((r) => r.data),
};

// ─── Product Groups (sized / carton products) ─────────────────────────────────

export interface GroupVariant {
  id: string;
  label: string;
  unitCost: string | null;
  sellingPrice: string;
  piecesPerCarton: number;
  sortOrder: number;
  available: number;
}

export interface ProductGroupSummary {
  id: string;
  name: string;
  category: string | null;
  cartonSellingPrice: string | null;
  cartonBuyingPrice: string | null;
  archived: boolean;
  variants: GroupVariant[];
  cartonsAvailable: number;
  totalPieces: number;
}

export interface CreateVariantBody {
  label: string;
  unitCost?: string;
  sellingPrice: string;
  piecesPerCarton?: number;
  sortOrder?: number;
}

export const productGroupsApi = {
  list: (): Promise<ProductGroupSummary[]> =>
    api.get('/product-groups').then((r) => r.data),
  get: (id: string): Promise<ProductGroupSummary> =>
    api.get(`/product-groups/${id}`).then((r) => r.data),
  create: (body: {
    name: string;
    category?: string;
    cartonSellingPrice?: string;
    cartonBuyingPrice?: string;
    variants: CreateVariantBody[];
  }) => api.post('/product-groups', body).then((r) => r.data),
  update: (
    id: string,
    body: {
      category?: string;
      cartonSellingPrice?: string;
      cartonBuyingPrice?: string;
      archived?: boolean;
    },
  ) => api.patch(`/product-groups/${id}`, body).then((r) => r.data),
  rename: (
    id: string,
    newName: string,
  ): Promise<{ oldName: string; newName: string; entriesUpdated: number; salesUpdated: number }> =>
    api.patch(`/product-groups/${id}/rename`, { newName }).then((r) => r.data),
  addVariant: (id: string, body: CreateVariantBody) =>
    api.post(`/product-groups/${id}/variants`, body).then((r) => r.data),
  updateVariant: (
    id: string,
    variantId: string,
    body: Partial<CreateVariantBody> & { archived?: boolean },
  ) => api.patch(`/product-groups/${id}/variants/${variantId}`, body).then((r) => r.data),
  archiveVariant: (id: string, variantId: string) =>
    api.delete(`/product-groups/${id}/variants/${variantId}`).then((r) => r.data),
  addStock: (
    id: string,
    body: {
      items: Array<{
        variantId: string;
        quantity: number;
        unitCost?: string;
        sellingPrice?: string;
      }>;
    },
  ) => api.post(`/product-groups/${id}/stock`, body).then((r) => r.data),
};

// ─── Stock Movements ──────────────────────────────────────────────────────────

export interface StockMovement {
  id: string;
  inventoryEntryId: string;
  ownerId: string;
  reason: string;
  qtyDelta: number;
  qtyBefore: number;
  qtyAfter: number;
  unitCostSnapshot: string;
  notes: string | null;
  saleTransactionId: string | null;
  consignmentRequestId: string | null;
  supplierDebtId: string | null;
  createdAt: string;
  inventoryEntry?: {
    id: string;
    productName: string;
    source: string;
    unitCost: string;
    piecesPerCarton: number | null;
  };
}

export interface StockMovementsFilter {
  entryId?: string;
  productName?: string;
  reason?: string | string[];
  source?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface StockMovementsSummary {
  qtyIn: number;
  qtyOut: number;
  qtyNet: number;
  valueIn: string;
  valueOut: string;
  valueNet: string;
}

export const stockMovementsApi = {
  list: (
    params?: StockMovementsFilter,
  ): Promise<{
    data: StockMovement[];
    total: number;
    summary: StockMovementsSummary;
  }> => {
    const query: Record<string, string | number> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        query[k] = Array.isArray(v) ? v.join(',') : (v as string | number);
      }
    }
    return api.get('/inventory/movements', { params: query }).then((r) => r.data);
  },
  byEntry: (entryId: string): Promise<StockMovement[]> =>
    api.get(`/inventory/entries/${entryId}/movements`).then((r) => r.data),
};

export const MANUAL_STOCK_REASONS = [
  'CUSTOMER_RETURN',
  'RECOUNT_UP',
  'OTHER_IN',
  'DAMAGE',
  'LOSS',
  'THEFT',
  'EXPIRY',
  'SUPPLIER_RETURN',
  'INTERNAL_USE',
  'RECOUNT_DOWN',
  'OTHER_OUT',
] as const;
export type ManualStockReason = (typeof MANUAL_STOCK_REASONS)[number];

export const POSITIVE_REASONS_SET: ReadonlySet<string> = new Set([
  'PURCHASE',
  'RECEIVE_SUPPLIER',
  'CUSTOMER_RETURN',
  'RECOUNT_UP',
  'OTHER_IN',
  'EXTERNAL_IN',
]);

export const NOTES_REQUIRED_REASONS_SET: ReadonlySet<string> = new Set([
  'RECOUNT_UP',
  'RECOUNT_DOWN',
  'OTHER_IN',
  'OTHER_OUT',
]);

// ─── Consignments ─────────────────────────────────────────────────────────────

export const consignmentsApi = {
  create: (body: {
    debtorUserId: string;
    note?: string;
    items: { productName: string; quantity: number; agreedUnitPrice: string; variantId?: string }[];
    /** Optional people teaming up with the recipient on this batch — record only. */
    teamMembers?: { name: string; phone?: string }[];
  }) => api.post('/consignments', body).then((r) => r.data),
  outgoing: () => api.get('/consignments/outgoing').then((r) => r.data),
  incoming: () => api.get('/consignments/incoming').then((r) => r.data),
  confirm: (id: string) => api.patch(`/consignments/${id}/confirm`).then((r) => r.data),
  reject: (id: string) => api.patch(`/consignments/${id}/reject`).then((r) => r.data),
  cancel: (id: string) => api.patch(`/consignments/${id}/cancel`).then((r) => r.data),
};

// ─── Mini-employee settlements & activity ───────────────────────────────────────

export interface MiniSettlementItem {
  id: string;
  productName: string;
  quantity: number;
  agreedUnitPrice: string;
  unitCost: string | null;
  /** Size label for a sized product (null on simple products). */
  variantLabel?: string | null;
}

export interface MiniSettlement {
  id: string;
  ownerId: string;
  miniId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  cashAmount: string;
  /** FC value of the sold cash at the batches' locked rates (null pre-snapshot). */
  cashAmountFc: string | null;
  note: string | null;
  paymentId: string | null;
  actorId: string | null;
  createdAt: string;
  approvedAt: string | null;
  items: MiniSettlementItem[];
  /** Expenses (FC) the mini claimed on this handover — deducted from the cash
   *  they physically hand over and booked as the owner's expenses on approval. */
  expenses?: { id: string; amount: string; category: string; description: string | null }[];
  /** Who was out selling with the mini during the cycle this handover closes.
   *  Materialised on approval from the cycle's consignments, then editable here. */
  team?: MiniTeamMember[];
  /** Expense ceiling sealed when this handover was submitted — a later change to
   *  the employment never rewrites it. Null on handovers predating the field. */
  expenseAllowancePct?: string | null;
  /** Sales the mini voided as mistakes during the cycle this handover settles.
   *  They owe nothing (the goods are back in `items`); this is the record of
   *  the correction. Null when none were rejected. */
  rejectedLines?: {
    productName: string;
    variantLabel: string | null;
    qtySold: number;
    agreedValueFc: string;
    rejectedAt: string;
    reason: string | null;
  }[] | null;
  mini?: EmploymentParty;
  owner?: EmploymentParty;
}

export interface MiniTeamMember {
  id: string;
  name: string;
  phone: string | null;
  createdAt: string;
}

/** One product a mini is still holding unsold from what they were entrusted. */
export interface MiniUnsoldLine {
  productName: string;
  variantId: string | null;
  variantLabel: string | null;
  /** The sized product this line belongs to; null for simple products. */
  groupId: string | null;
  /** How many sizes the group defines in total; null for simple products. */
  groupSizeCount: number | null;
  quantity: number;
  /** For a sized line this is that size's share of one carton, not a carton itself. */
  piecesPerCarton: number | null;
  /** Agreed price per unit the mini owes, USD. */
  agreedUnitPrice: string;
  /** quantity × agreed price, FC at the batch's locked rate. */
  agreedValueFc: string;
}

/** A person on the cycle in progress — goods out but not yet handed over. */
export interface ActiveTeamMember {
  id: string;
  name: string;
  phone: string | null;
  /** SELF — the mini themself (always first, not removable); GIVE — came in with
   *  a consignment (fixed); MANUAL — added here (removable). */
  source: 'SELF' | 'GIVE' | 'MANUAL';
}

export interface MiniActivitySale {
  id: string;
  productName: string;
  qtySold: number;
  salePrice: string;
  agreedUnitPrice: string;
  markup: string;
  /** The batch's locked FC/USD rate this sale was booked at (null pre-snapshot). */
  usdToFcRateSnapshot: string | null;
  date: string;
}

export interface MiniActivity {
  miniUserId: string;
  miniUsername: string;
  dateFrom: string | null;
  dateTo: string | null;
  givenInPeriod: string;
  givenUnitsInPeriod: number;
  given: {
    productName: string;
    quantity: number;
    agreedUnitPrice: string;
    /** The rate this batch was consigned at + its value in FC at that rate. */
    usdToFcRateSnapshot: string | null;
    agreedValueFc: string;
    date: string;
  }[];
  outstanding: string;
  totalCreditGiven: string;
  totalReceived: string;
  stillOutUnits: number;
  soldUnits: number;
  soldAtSalePrice: string;
  soldAtAgreedPrice: string;
  markup: string;
  /** FC-native aggregates, each row at its batch's locked rate (for the FC toggle). */
  givenInPeriodFc: string;
  soldAtSalePriceFc: string;
  soldAtAgreedPriceFc: string;
  markupFc: string;
  sales: MiniActivitySale[];
}

export const miniSettlementsApi = {
  incoming: (): Promise<MiniSettlement[]> =>
    api.get('/mini-settlements/incoming').then((r) => r.data),
  approve: (id: string): Promise<MiniSettlement> =>
    api.patch(`/mini-settlements/${id}/approve`).then((r) => r.data),
  reject: (id: string): Promise<MiniSettlement> =>
    api.patch(`/mini-settlements/${id}/reject`).then((r) => r.data),
  miniUnsold: (miniUserId: string): Promise<MiniUnsoldLine[]> =>
    api.get(`/mini-settlements/mini/${miniUserId}/unsold`).then((r) => r.data),
  // The team on the cycle in progress (goods out, not yet handed over).
  miniTeam: (miniUserId: string): Promise<ActiveTeamMember[]> =>
    api.get(`/mini-settlements/mini/${miniUserId}/team`).then((r) => r.data),
  addActiveTeamMember: (
    miniUserId: string,
    body: { name: string; phone?: string },
  ): Promise<MiniTeamMember> =>
    api.post(`/mini-settlements/mini/${miniUserId}/team`, body).then((r) => r.data),
  // A handover's team record — only on approved handovers, and only from here.
  addTeamMember: (
    settlementId: string,
    body: { name: string; phone?: string },
  ): Promise<MiniTeamMember> =>
    api.post(`/mini-settlements/${settlementId}/team`, body).then((r) => r.data),
  removeTeamMember: (memberId: string): Promise<void> =>
    api.delete(`/mini-settlements/team/${memberId}`).then((r) => r.data),
  miniActivity: (
    miniUserId: string,
    params?: { dateFrom?: string; dateTo?: string },
  ): Promise<MiniActivity> =>
    api.get(`/mini-settlements/mini/${miniUserId}/activity`, { params }).then((r) => r.data),
};

// ─── Payments ─────────────────────────────────────────────────────────────────

export const paymentsApi = {
  paySupplier: (body: { supplierUserId: string; amount: string; note?: string }) =>
    api.post('/payments/to-supplier', body).then((r) => r.data),
  recordDebtorPayment: (body: { debtorUserId: string; amount: string; note?: string }) =>
    api.post('/payments/from-debtor', body).then((r) => r.data),
  pendingFromDebtors: () =>
    api.get('/payments/pending-from-debtors').then((r) => r.data),
  approvePayment: (id: string) =>
    api.patch(`/payments/${id}/approve`).then((r) => r.data),
  rejectPayment: (id: string) =>
    api.patch(`/payments/${id}/reject`).then((r) => r.data),
};

// ─── Sales ────────────────────────────────────────────────────────────────────

export interface SalesProfitSummary {
  period: 'today' | 'week' | 'month' | 'all' | 'custom';
  dateFrom: string | null;
  dateTo: string | null;
  salesCount: number;
  totalQtySold: number;
  totalRevenue: string;
  totalCost: string;
  totalProfit: string;
}

export const salesApi = {
  list: (params?: {
    productName?: string;
    period?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
    actorId?: string;
    /** Live sales (default), the ones rejected as mistakes, or both. */
    status?: 'active' | 'rejected' | 'all';
  }) => api.get('/sales', { params }).then((r) => r.data),

  /**
   * Reject a sale recorded by mistake: the row is kept and listed under
   * `status: 'rejected'`, its quantity goes back onto the lot it came off, and
   * it leaves every revenue/profit/cash figure. Idempotent server-side.
   */
  reject: (saleId: string, body?: { reason?: string }) =>
    api.post(`/sales/${saleId}/reject`, body ?? {}).then((r) => r.data),
  topProducts: (params?: { rankBy?: 'qty' | 'revenue' | 'profit'; period?: string }) =>
    api.get('/sales/top-products', { params }).then((r) => r.data),
  // Aggregate direct-sales profit for a period (today/week/month/all) or a
  // custom dateFrom–dateTo range: revenue vs bought price (cost) vs profit.
  profitSummary: (params?: {
    period?: 'today' | 'week' | 'month' | 'all' | 'custom';
    dateFrom?: string;
    dateTo?: string;
    productName?: string;
    actorId?: string;
  }): Promise<SalesProfitSummary> =>
    api.get('/sales/profit-summary', { params }).then((r) => r.data),
};

// ─── Currency ─────────────────────────────────────────────────────────────────

interface RateResponse { usdToFcRate: string; sellingRate: string | null; updatedAt: string; }

export const currencyApi = {
  getRate: (): Promise<RateResponse> =>
    api.get('/currency/rate').then((r) => r.data),
  setRate: (body: { usdToFcRate: string; sellingRate?: string }): Promise<RateResponse> =>
    api.put('/currency/rate', body).then((r) => r.data),
};

// ─── External Contacts ────────────────────────────────────────────────────────

export const externalContactsApi = {
  list: () => api.get('/external-contacts').then((r) => r.data),
  create: (body: { name: string; phone?: string; notes?: string; role: 'DEBTOR' | 'SUPPLIER' | 'BOTH' }) =>
    api.post('/external-contacts', body).then((r) => r.data),
  detail: (id: string) => api.get(`/external-contacts/${id}`).then((r) => r.data),
  update: (id: string, body: { name?: string; phone?: string; notes?: string; role?: 'DEBTOR' | 'SUPPLIER' | 'BOTH' }) =>
    api.patch(`/external-contacts/${id}`, body).then((r) => r.data),
  delete: (id: string) => api.delete(`/external-contacts/${id}`),
  recordProductOut: (id: string, body: { productName: string; quantity: number; unitPrice: string; notes?: string }) =>
    api.post(`/external-contacts/${id}/product-out`, body).then((r) => r.data),
  recordProductOutBatch: (
    id: string,
    body: {
      items: Array<{ productName: string; quantity: number; unitPrice: string; discountReason?: string }>;
      notes?: string;
    },
  ) => api.post(`/external-contacts/${id}/product-out-batch`, body).then((r) => r.data),
  recordPaymentIn: (id: string, body: { amount: string; notes?: string }) =>
    api.post(`/external-contacts/${id}/payment-in`, body).then((r) => r.data),
  recordProductIn: (id: string, body: { productName: string; quantity: number; unitCost: string; sellingPrice: string; category?: string; notes?: string }) =>
    api.post(`/external-contacts/${id}/product-in`, body).then((r) => r.data),
  recordProductInBatch: (
    id: string,
    body: {
      items: Array<{ productName: string; quantity: number; unitCost: string; sellingPrice: string; category?: string }>;
      notes?: string;
    },
  ) => api.post(`/external-contacts/${id}/product-in-batch`, body).then((r) => r.data),
  recordPaymentOut: (id: string, body: { amount: string; notes?: string }) =>
    api.post(`/external-contacts/${id}/payment-out`, body).then((r) => r.data),
  deleteTransaction: (contactId: string, txId: string) =>
    api.delete(`/external-contacts/${contactId}/transactions/${txId}`),
  listTransactions: (
    contactId: string,
    params?: { page?: number; limit?: number },
  ): Promise<{ data: unknown[]; pagination: PaginationMeta }> =>
    api.get(`/external-contacts/${contactId}/transactions`, { params }).then((r) => r.data),
};

// ─── Expenses ─────────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  'TRANSPORT',
  'RENT',
  'UTILITIES',
  'COMMUNICATION',
  'STAFF',
  'PACKAGING',
  'MARKETING',
  'TAXES',
  'MAINTENANCE',
  'MEALS',
  'OTHER',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type ExpenseCurrency = 'USD' | 'FC';
export type ExpensePeriod = 'today' | 'week' | 'month' | 'lastNDays' | 'all';

export interface Expense {
  id: string;
  ownerId: string;
  amount: string;
  currency: ExpenseCurrency;
  category: ExpenseCategory;
  description: string | null;
  usdToFcRateSnapshot: string | null;
  date: string;
  createdAt: string;
  updatedAt: string;
  amountUsd: string;
  /** Branch the expense was recorded at — labelled under "All branches". */
  shopId: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ExpenseListResponse {
  data: Expense[];
  totals: {
    totalAmountUsd: string;
    byCategory: { category: ExpenseCategory; totalUsd: string; count: number }[];
    count: number;
  };
  pagination: PaginationMeta;
}

export interface ExpenseListParams {
  period?: ExpensePeriod;
  days?: number;
  from?: string;
  to?: string;
  category?: ExpenseCategory;
  actorId?: string;
  page?: number;
  limit?: number;
}

export const expensesApi = {
  list: (params?: ExpenseListParams): Promise<ExpenseListResponse> =>
    api.get('/expenses', { params }).then((r) => r.data),
  create: (body: {
    amount: string;
    currency: ExpenseCurrency;
    category: ExpenseCategory;
    description?: string;
    date?: string;
  }): Promise<Expense> => api.post('/expenses', body).then((r) => r.data),
  delete: (id: string): Promise<void> => api.delete(`/expenses/${id}`),
};

// ─── Withdrawals ──────────────────────────────────────────────────────────────

export type WithdrawalCurrency = 'USD' | 'FC';

export interface Withdrawal {
  id: string;
  ownerId: string;
  amount: string;
  currency: WithdrawalCurrency;
  amountUsd: string;
  usdToFcRateSnapshot: string | null;
  withdrawnAt: string;
  periodStartAt: string;
  periodIncome: string;
  periodExpenses: string;
  leftoverCarried: string;
  leftoverOut: string;
  note: string | null;
}

export interface AvailableWithdrawal {
  lastWithdrawalAt: string | null;
  periodStartAt: string;
  periodIncome: string;
  periodExpenses: string;
  leftoverCarried: string;
  available: string;
  incomeBreakdown: {
    directSales: string;
    debtorPayments: string;
    externalPaymentIn: string;
  };
}

export interface WithdrawalListResponse {
  data: Withdrawal[];
  pagination: PaginationMeta;
}

export const withdrawalsApi = {
  available: (): Promise<AvailableWithdrawal> =>
    api.get('/withdrawals/available').then((r) => r.data),
  list: (params?: { page?: number; limit?: number }): Promise<WithdrawalListResponse> =>
    api.get('/withdrawals', { params }).then((r) => r.data),
  create: (body: {
    amount: string;
    currency: WithdrawalCurrency;
    note?: string;
  }): Promise<Withdrawal> => api.post('/withdrawals', body).then((r) => r.data),
  delete: (id: string): Promise<void> => api.delete(`/withdrawals/${id}`),
};

// ─── Employments ──────────────────────────────────────────────────────────────

export type EmploymentTier = 'FULL' | 'SALES_ONLY';
export type EmploymentStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'REJECTED'
  | 'TERMINATION_REQUESTED'
  | 'TERMINATED';

export interface EmploymentParty {
  id: string;
  username: string;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  dateOfBirth?: string | null;
  role?: string | null;
  isMiniEmployee?: boolean;
  isExternalEmployee?: boolean;
}

export interface Employment {
  /** Branch this employment is at, and a proposed move awaiting the employee. */
  shopId: string | null;
  pendingShopId: string | null;
  id: string;
  employerId: string;
  employer?: EmploymentParty;
  employeeId: string;
  employee?: EmploymentParty;
  tier: EmploymentTier;
  status: EmploymentStatus;
  terminationRequestedBy: string | null;
  monthlyPay: string | null;
  payrollActive: boolean;
  /** Share of their sales claimable as expenses. Always set (2% by default). */
  expenseAllowancePct?: string;
  /** Mini employees: % of each approved handover's sold value the employer pays them. Null = no commission. */
  commissionPct?: string | null;
  /** Role gating which services this employee may use. Null = full access for their tier. */
  roleId?: string | null;
  acceptedAt: string | null;
  terminatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SalaryPaymentStatus =
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'CANCELLED';

export type SalaryPaymentKind = 'MONTHLY' | 'COMMISSION';

export interface SalaryPayment {
  id: string;
  employmentId: string;
  employerId: string;
  employer?: EmploymentParty;
  employeeId: string;
  employee?: EmploymentParty;
  employment?: Employment;
  amount: string;
  periodMonth: string;
  status: SalaryPaymentStatus;
  kind: SalaryPaymentKind;
  note: string | null;
  rejectionReason: string | null;
  paidAt: string;
  confirmedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Branch the pay was earned at. A transfer keeps the employment, so one history can span two. */
  shopId: string;
  shopName: string | null;
}

export interface CommissionSummary {
  pct: string | null;
  earned: string;
  paidConfirmed: string;
  pendingConfirmation: string;
  remaining: string;
}

export interface SalarySummary {
  employmentId: string;
  periodMonth: string;
  monthlyPay: string | null;
  paidConfirmed: string;
  pendingConfirmation: string;
  rejected: string;
  balanceRemaining: string | null;
  paymentCount: number;
  /** Mini-employee handover commission; null when never in play for this employment. */
  commission: CommissionSummary | null;
}

export interface CreateMiniEmployeeResult {
  employment: Employment;
  employee: { id: string; username: string; name: string };
  pairingCode: string;
}

export const employmentsApi = {
  list: (params?: { role?: 'employer' | 'employee'; status?: EmploymentStatus }): Promise<Employment[]> =>
    api.get('/employments', { params }).then((r) => r.data),
  get: (id: string): Promise<Employment> =>
    api.get(`/employments/${id}`).then((r) => r.data),
  create: (body: {
    employeeUserId?: string;
    emailOrPhone?: string;
    tier: EmploymentTier;
    /** Branch to hire into; defaults to the branch making the request. */
    shopId?: string;
  }): Promise<Employment> => api.post('/employments', body).then((r) => r.data),

  /**
   * Move an employee to another branch (§3.11.3). A transfer, not a re-hire:
   * they keep tenure, pay, role and payroll history, and keep working where
   * they are until they accept.
   */
  proposeTransfer: (id: string, shopId: string): Promise<Employment> =>
    api.patch(`/employments/${id}/transfer`, { shopId }).then((r) => r.data),
  acceptTransfer: (id: string): Promise<Employment> =>
    api.patch(`/employments/${id}/transfer/accept`).then((r) => r.data),
  rejectTransfer: (id: string): Promise<Employment> =>
    api.patch(`/employments/${id}/transfer/reject`).then((r) => r.data),
  createMiniEmployee: (body: { name: string; phone?: string }): Promise<CreateMiniEmployeeResult> =>
    api.post('/employments/mini-employee', body).then((r) => r.data),
  accept: (id: string): Promise<Employment> =>
    api.patch(`/employments/${id}/accept`).then((r) => r.data),
  reject: (id: string): Promise<Employment> =>
    api.patch(`/employments/${id}/reject`).then((r) => r.data),
  requestTermination: (id: string): Promise<Employment> =>
    api.patch(`/employments/${id}/request-termination`).then((r) => r.data),
  approveTermination: (id: string): Promise<Employment> =>
    api.patch(`/employments/${id}/approve-termination`).then((r) => r.data),
  cancelTermination: (id: string): Promise<Employment> =>
    api.patch(`/employments/${id}/cancel-termination`).then((r) => r.data),
  rejectTermination: (id: string): Promise<Employment> =>
    api.patch(`/employments/${id}/reject-termination`).then((r) => r.data),
  setSalary: (id: string, monthlyPay: number | null): Promise<Employment> =>
    api.patch(`/employments/${id}/salary`, { monthlyPay }).then((r) => r.data),
  setExpenseAllowance: (id: string, expenseAllowancePct: string): Promise<Employment> =>
    api.patch(`/employments/${id}/expense-allowance`, { expenseAllowancePct }).then((r) => r.data),
  setCommission: (id: string, commissionPct: number | null): Promise<Employment> =>
    api.patch(`/employments/${id}/commission`, { commissionPct }).then((r) => r.data),
  setPayrollActive: (id: string, active: boolean): Promise<Employment> =>
    api.patch(`/employments/${id}/payroll-active`, { active }).then((r) => r.data),
  createExternalEmployee: (body: {
    name: string;
    dateOfBirth?: string;
    role?: string;
    monthlyPay?: number;
  }): Promise<{
    employment: Employment;
    employee: { id: string; username: string; name: string };
  }> => api.post('/employments/external-employee', body).then((r) => r.data),
  removeExternalEmployee: (id: string): Promise<Employment> =>
    api.delete(`/employments/${id}/external`).then((r) => r.data),
  updateEmployeeProfile: (
    id: string,
    body: { name?: string; dateOfBirth?: string; role?: string },
  ): Promise<EmploymentParty> =>
    api.patch(`/employments/${id}/profile`, body).then((r) => r.data),
  /** Pass null to clear — note that clearing WIDENS access back to tier defaults. */
  setRole: (id: string, roleId: string | null): Promise<Employment> =>
    api.patch(`/employments/${id}/role`, { roleId }).then((r) => r.data),
};

// ─── Employee roles (which services an employee may use) ─────────────────────

export type ServiceGroup = 'SALES' | 'STOCK' | 'NETWORK' | 'MONEY' | 'PEOPLE';
export type ActorTier = 'OWNER' | 'FULL_EMPLOYEE' | 'MINI_EMPLOYEE';

export interface ServiceDefinition {
  key: string;
  group: ServiceGroup;
  /** Tiers a role CAN grant this to — outside these the checkbox has no effect. */
  tiers: ActorTier[];
  /** Tiers that hold this unconditionally, even on an empty role. */
  mandatory: ActorTier[];
  /** Reads granted implicitly with this one. */
  implies: string[];
}

export interface RolePreset {
  key: string;
  tier: ActorTier;
  services: string[];
}

export interface ServiceCatalog {
  groups: ServiceGroup[];
  services: ServiceDefinition[];
  presets: RolePreset[];
}

export interface EmployeeRole {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  services: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeRoleWithUsage extends EmployeeRole {
  assignedCount: number;
}

export const employeeRolesApi = {
  catalog: (): Promise<ServiceCatalog> =>
    api.get('/employee-roles/catalog').then((r) => r.data),
  list: (): Promise<EmployeeRoleWithUsage[]> =>
    api.get('/employee-roles').then((r) => r.data),
  get: (id: string): Promise<EmployeeRole> =>
    api.get(`/employee-roles/${id}`).then((r) => r.data),
  create: (body: {
    name: string;
    description?: string | null;
    services: string[];
  }): Promise<EmployeeRole> => api.post('/employee-roles', body).then((r) => r.data),
  update: (
    id: string,
    body: { name?: string; description?: string | null; services?: string[] },
  ): Promise<EmployeeRole> => api.patch(`/employee-roles/${id}`, body).then((r) => r.data),
  delete: (id: string): Promise<void> => api.delete(`/employee-roles/${id}`),
};

// ─── Salary Payments ──────────────────────────────────────────────────────────

export const salaryPaymentsApi = {
  list: (params?: {
    role?: 'employer' | 'employee';
    employmentId?: string;
    status?: SalaryPaymentStatus;
    periodMonth?: string;
  }): Promise<SalaryPayment[]> =>
    api.get('/salary-payments', { params }).then((r) => r.data),
  pending: (): Promise<SalaryPayment[]> =>
    api.get('/salary-payments/pending').then((r) => r.data),
  summary: (employmentId: string, periodMonth?: string): Promise<SalarySummary> =>
    api
      .get('/salary-payments/summary', { params: { employmentId, periodMonth } })
      .then((r) => r.data),
  create: (body: {
    employmentId: string;
    amount: number;
    kind?: SalaryPaymentKind;
    periodMonth?: string;
    note?: string;
    confirmedOverride?: boolean;
  }): Promise<SalaryPayment> =>
    api.post('/salary-payments', body).then((r) => r.data),
  confirm: (id: string): Promise<SalaryPayment> =>
    api.patch(`/salary-payments/${id}/confirm`).then((r) => r.data),
  reject: (id: string, reason?: string): Promise<SalaryPayment> =>
    api.patch(`/salary-payments/${id}/reject`, { reason }).then((r) => r.data),
  cancel: (id: string): Promise<SalaryPayment> =>
    api.delete(`/salary-payments/${id}`).then((r) => r.data),
};

// ─── Activity Logs ────────────────────────────────────────────────────────────

export const ACTIVITY_LOG_TYPES = [
  'SALE',
  'CONSIGNMENT',
  'EXTERNAL_PRODUCT_OUT',
  'EXTERNAL_PAYMENT_IN',
  'EXTERNAL_PRODUCT_IN',
  'EXTERNAL_PAYMENT_OUT',
  'PAYMENT_TO_SUPPLIER',
  'PAYMENT_FROM_DEBTOR',
  'HANDOVER',
  'EXPENSE',
  'INVENTORY_PERSONAL_ADDED',
  'INVENTORY_RECEIVED_FROM_SUPPLIER',
] as const;
export type ActivityLogType = (typeof ACTIVITY_LOG_TYPES)[number];

export interface ActivityLogEntry {
  id: string;
  type: ActivityLogType;
  timestamp: string;
  actor: { id: string; username: string } | null;
  summary: string;
  amount: string | null;
  productName: string | null;
  resourceId: string;
  resourceType:
    | 'sale'
    | 'consignment_item'
    | 'external_transaction'
    | 'payment'
    | 'expense'
    | 'inventory_entry'
    | 'mini_settlement';
}

export interface ActivityLogsParams {
  actionTypes?: ActivityLogType[];
  actorId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface ActivityLogsResponse {
  data: ActivityLogEntry[];
  total: number;
  byType: Partial<Record<ActivityLogType, number>>;
}

export const activityLogsApi = {
  list: (params?: ActivityLogsParams): Promise<ActivityLogsResponse> => {
    const q: Record<string, string | number> = {};
    if (params) {
      if (params.actionTypes && params.actionTypes.length > 0) q.actionTypes = params.actionTypes.join(',');
      if (params.actorId) q.actorId = params.actorId;
      if (params.from) q.from = params.from;
      if (params.to) q.to = params.to;
      if (params.page) q.page = params.page;
      if (params.limit) q.limit = params.limit;
    }
    return api.get('/activity-logs', { params: q }).then((r) => r.data);
  },
};

// ─── Pricing ──────────────────────────────────────────────────────────────────

export interface ProductPrice {
  id: string;
  ownerId: string;
  productName: string;
  unitPrice: string;
  createdAt: string;
  updatedAt: string;
}

export const pricingApi = {
  list: (): Promise<ProductPrice[]> => api.get('/pricing').then((r) => r.data),
  upsert: (body: { productName: string; unitPrice: string }): Promise<ProductPrice> =>
    api.post('/pricing', body).then((r) => r.data),
  update: (id: string, unitPrice: string): Promise<ProductPrice> =>
    api.patch(`/pricing/${id}`, { unitPrice }).then((r) => r.data),
  delete: (id: string): Promise<void> => api.delete(`/pricing/${id}`),
};

// ─── Quantity discounts ("group of prices") ────────────────────────────────────

export interface QuantityDiscountConfig {
  enabled: boolean;
  halfDozenPercent: string;
  dozenPercent: string;
  cartonPercent: string;
  updatedAt: string | null;
}

export const quantityDiscountsApi = {
  get: (): Promise<QuantityDiscountConfig> =>
    api.get('/quantity-discounts').then((r) => r.data),
  update: (body: {
    enabled: boolean;
    halfDozenPercent: number;
    dozenPercent: number;
    cartonPercent: number;
  }): Promise<QuantityDiscountConfig> =>
    api.put('/quantity-discounts', body).then((r) => r.data),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardProfitSummary {
  period: 'today' | 'week' | 'month' | 'all' | 'custom';
  dateFrom: string | null;
  dateTo: string | null;
  salesCount: number;
  totalQtySold: number;
  totalRevenue: string; // direct sales only
  totalCost: string; // direct sales only
  salesProfit: string; // direct-sales profit
  externalProfit: string; // external-contact PAYMENT_IN profit realized in range
  totalProfit: string; // salesProfit + externalProfit
}

export interface ShopBreakdownRow {
  shopId: string;
  shopName: string;
  isArchived: boolean;
  salesCount: number;
  totalRevenue: string;
  totalProfit: string;
  availableBusinessCash: string;
}

export const dashboardApi = {
  summary: () => api.get('/dashboard').then((r) => r.data),
  // Combined period profit (direct sales + external-contact payments) for the
  // dashboard profit cards. Mirrors salesApi.profitSummary params.
  profitSummary: (params?: {
    period?: 'today' | 'week' | 'month' | 'all' | 'custom';
    dateFrom?: string;
    dateTo?: string;
  }): Promise<DashboardProfitSummary> =>
    api.get('/dashboard/profit-summary', { params }).then((r) => r.data),
  cashPosition: () => api.get('/dashboard/cash-position').then((r) => r.data),
  /** Headline figures per branch — every branch under "All branches". */
  byShop: (params?: {
    period?: 'today' | 'week' | 'month' | 'all' | 'custom';
    dateFrom?: string;
    dateTo?: string;
  }): Promise<ShopBreakdownRow[]> =>
    api.get('/dashboard/by-shop', { params }).then((r) => r.data),
  suppliers: () => api.get('/dashboard/suppliers').then((r) => r.data),
  supplierDetail: (id: string) => api.get(`/dashboard/suppliers/${id}`).then((r) => r.data),
  debtors: () => api.get('/dashboard/debtors').then((r) => r.data),
  debtorDetail: (id: string) => api.get(`/dashboard/debtors/${id}`).then((r) => r.data),
  profitByProduct: (params?: { limit?: number }) =>
    api.get('/dashboard/profit-by-product', { params }).then((r) => r.data),
  profitBySource: () => api.get('/dashboard/profit-by-source').then((r) => r.data),
  alerts: () => api.get('/dashboard/alerts').then((r) => r.data),
};

// ─── Sync (inbox change-signal) ─────────────────────────────────────────────────

/** One epoch-ms stamp per inbox channel. See useInboxSignal / the API's SyncService. */
export interface InboxSignal {
  handovers: number;
  employment: number;
  consignments: number;
  salary: number;
}

export const syncApi = {
  signal: (): Promise<InboxSignal> => api.get('/sync/signal').then((r) => r.data),
};

// ─── Shops & the business ────────────────────────────────────────────────────

export interface Shop {
  id: string;
  orgId: string;
  name: string;
  address: string | null;
  phone: string | null;
  city: string | null;
  note: string | null;
  receiptHeader: string | null;
  receiptFooter: string | null;
  isDefault: boolean;
  archivedAt: string | null;
}

export interface Organization {
  id: string;
  ownerUserId: string;
  pendingOwnerUserId: string | null;
  name: string;
  taxId: string | null;
  logoUrl: string | null;
}

export interface OwnershipHistoryEntry {
  id: string;
  fromUserId: string | null;
  toUserId: string;
  transferredAt: string;
  note: string | null;
}

export const shopsApi = {
  list: (): Promise<Shop[]> => api.get('/shops').then((r) => r.data),
  create: (body: Partial<Shop> & { name: string }): Promise<Shop> =>
    api.post('/shops', body).then((r) => r.data),
  update: (id: string, body: Partial<Shop>): Promise<Shop> =>
    api.patch(`/shops/${id}`, body).then((r) => r.data),
  setDefault: (id: string): Promise<Shop> =>
    api.patch(`/shops/${id}/default`).then((r) => r.data),
  archive: (id: string): Promise<Shop> =>
    api.patch(`/shops/${id}/archive`).then((r) => r.data),
  unarchive: (id: string): Promise<Shop> =>
    api.patch(`/shops/${id}/unarchive`).then((r) => r.data),
  remove: (id: string): Promise<void> => api.delete(`/shops/${id}`).then(() => undefined),
};

export const organizationsApi = {
  mine: (): Promise<Organization> => api.get('/organizations/me').then((r) => r.data),
  update: (body: Partial<Organization>): Promise<Organization> =>
    api.patch('/organizations/me', body).then((r) => r.data),
  history: (): Promise<OwnershipHistoryEntry[]> =>
    api.get('/organizations/me/ownership-history').then((r) => r.data),

  proposeTransfer: (body: { newOwnerUserId: string; note?: string }): Promise<Organization> =>
    api.post('/organizations/me/transfer', body).then((r) => r.data),
  cancelTransfer: (): Promise<Organization> =>
    api.delete('/organizations/me/transfer').then((r) => r.data),

  /** Businesses someone has offered to me. */
  offers: (): Promise<Organization[]> => api.get('/organizations/offers').then((r) => r.data),
  acceptOffer: (orgId: string): Promise<Organization> =>
    api.patch(`/organizations/offers/${orgId}/accept`).then((r) => r.data),
  rejectOffer: (orgId: string): Promise<void> =>
    api.patch(`/organizations/offers/${orgId}/reject`).then(() => undefined),
};

// ─── Shop custody (full-employee accountability) ──────────────────────────────

export type StockCustodyStatus = 'OPEN' | 'CLOSED';
export type StockIssueStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
export type CustodyHandoverStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type CustodyAdjustmentKind =
  | 'CASH_SHORT'
  | 'CASH_OVER'
  | 'ITEM_MISSING'
  | 'ITEM_FOUND'
  | 'OTHER';

export interface StockCustody {
  id: string;
  custodianId: string;
  custodian?: { id: string; name: string | null; username: string };
  status: StockCustodyStatus;
  note: string | null;
  openedAt: string;
  closedAt: string | null;
}

export interface StockIssueItem {
  id: string;
  productName: string;
  quantity: number;
  variantLabel: string | null;
}

export interface StockIssue {
  id: string;
  status: StockIssueStatus;
  isOpeningSweep: boolean;
  note: string | null;
  rejectionReason: string | null;
  items: StockIssueItem[];
  createdAt: string;
  acceptedAt: string | null;
}

export interface CustodyTeamMember {
  id: string;
  userId: string;
  user?: { id: string; name: string | null; username: string };
  addedAt: string;
}

export interface CustodyHandoverItem {
  id: string;
  productName: string;
  variantLabel: string | null;
  quantity: number;
  unitCost: string;
  piecesPerCarton: number | null;
}

export interface CustodyHandoverAdjustment {
  id: string;
  kind: CustodyAdjustmentKind;
  amountFc: string | null;
  productName: string | null;
  variantLabel: string | null;
  quantity: number | null;
  note: string;
  createdAt: string;
}

export interface CustodyHandoverSoldLine {
  productName: string;
  variantLabel: string | null;
  qtySold: number;
  piecesPerCarton: number | null;
  valueFc: string;
  profitFc: string;
}

export interface CustodyHandoverMiniLine {
  miniId: string;
  miniName: string;
  settlementId: string;
  approvedAt: string;
  cashFc: string;
  returnedUnits: number;
}

export interface CustodyHandover {
  id: string;
  custodyId: string;
  custodianId: string;
  custodian?: { id: string; name: string | null; username: string };
  status: CustodyHandoverStatus;
  periodStart: string;
  periodEnd: string;
  cashDeclaredFc: string;
  cashExpectedFc: string;
  miniRollupCashFc: string;
  expensesFc: string;
  soldLines: CustodyHandoverSoldLine[] | null;
  rejectedLines:
    | { productName: string; qtySold: number; valueFc: string; reason: string | null }[]
    | null;
  miniRollupLines: CustodyHandoverMiniLine[] | null;
  note: string | null;
  items: CustodyHandoverItem[];
  adjustments: CustodyHandoverAdjustment[];
  createdAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
}

// ─── Shop custody (the custodian's own view) ──────────────────────────────────
// Mirrors apps/mobile/lib/api.ts's custody types — the mobile screen was built
// first, so these are kept structurally identical to the same endpoints.

export interface CustodyVolumeLine {
  productName: string;
  variantId: string | null;
  variantLabel: string | null;
  quantityRemaining: number;
  unitCost: string;
  sellingPrice: string;
  piecesPerCarton: number | null;
  entryIds: string[];
}

export interface CustodyOverview {
  custody: { id: string; openedAt: string; note: string | null };
  lines: CustodyVolumeLine[];
  totalUnits: number;
  pendingSaleCount: number;
  pendingIssueCount: number;
  teamSize: number;
}

export interface CustodyPendingSale {
  id: string;
  productName: string;
  variantLabel: string | null;
  qtySold: number;
  salePrice: string;
  date: string;
  actor?: { id: string; name: string | null; username: string } | null;
}

export interface CustodyHandoverPreview {
  custodyId: string;
  periodStart: string;
  periodEnd: string;
  soldLines: CustodyHandoverSoldLine[];
  rejectedLines: { productName: string; qtySold: number; valueFc: string }[];
  miniRollupLines: { miniId: string; miniName: string; cashFc: string; returnedUnits: number }[];
  pendingMiniHandovers: { miniId: string; miniName: string; settlementId: string }[];
  salesFc: string;
  miniRollupCashFc: string;
  expensesFc: string;
  cashExpectedFc: string;
  unattestedSaleCount: number;
  holding: {
    inventoryEntryId: string;
    productName: string;
    variantLabel: string | null;
    quantityRemaining: number;
    unitCost: string;
    piecesPerCarton: number | null;
  }[];
}

export const custodyApi = {
  current: (): Promise<StockCustody | null> =>
    api.get('/custody/current').then((r) => r.data),
  appoint: (body: {
    custodianId: string;
    sweepExistingStock?: boolean;
    note?: string;
  }): Promise<StockCustody> => api.post('/custody', body).then((r) => r.data),
  close: (id: string): Promise<StockCustody> =>
    api.patch(`/custody/${id}/close`).then((r) => r.data),

  issues: (custodyId: string): Promise<StockIssue[]> =>
    api.get(`/custody/${custodyId}/issues`).then((r) => r.data),
  createIssue: (
    custodyId: string,
    body: {
      items: { productName: string; quantity: number; variantId?: string }[];
      note?: string;
    },
  ): Promise<StockIssue> =>
    api.post(`/custody/${custodyId}/issues`, body).then((r) => r.data),
  cancelIssue: (issueId: string): Promise<StockIssue> =>
    api.patch(`/custody/issues/${issueId}/cancel`).then((r) => r.data),

  team: (custodyId: string): Promise<CustodyTeamMember[]> =>
    api.get(`/custody/${custodyId}/team`).then((r) => r.data),
  addTeamMember: (custodyId: string, userId: string): Promise<CustodyTeamMember> =>
    api.post(`/custody/${custodyId}/team`, { userId }).then((r) => r.data),
  removeTeamMember: (memberId: string): Promise<void> =>
    api.delete(`/custody/team/${memberId}`).then((r) => r.data),

  handovers: (params?: {
    custodianId?: string;
    status?: CustodyHandoverStatus;
  }): Promise<CustodyHandover[]> =>
    api.get('/custody/handovers', { params }).then((r) => r.data),
  handover: (id: string): Promise<CustodyHandover> =>
    api.get(`/custody/handovers/${id}`).then((r) => r.data),
  addAdjustment: (
    handoverId: string,
    body: {
      kind: CustodyAdjustmentKind;
      amountFc?: string;
      inventoryEntryId?: string;
      quantity?: number;
      note: string;
    },
  ): Promise<CustodyHandoverAdjustment> =>
    api.post(`/custody/handovers/${handoverId}/adjustments`, body).then((r) => r.data),
  removeAdjustment: (id: string): Promise<void> =>
    api.delete(`/custody/handovers/adjustments/${id}`).then((r) => r.data),
  approveHandover: (id: string): Promise<CustodyHandover> =>
    api.patch(`/custody/handovers/${id}/approve`).then((r) => r.data),
  rejectHandover: (id: string, reason?: string): Promise<CustodyHandover> =>
    api.patch(`/custody/handovers/${id}/reject`, { reason }).then((r) => r.data),

  // The custodian's own endpoints (mirrors apps/mobile/lib/api.ts).
  mine: (): Promise<CustodyOverview | null> =>
    api.get('/custody/mine').then((r) => r.data),
  myIssues: (): Promise<StockIssue[]> =>
    api.get('/custody/mine/issues').then((r) => r.data),
  acceptIssue: (id: string): Promise<StockIssue> =>
    api.patch(`/custody/issues/${id}/accept`).then((r) => r.data),
  rejectIssue: (id: string, reason?: string): Promise<StockIssue> =>
    api.patch(`/custody/issues/${id}/reject`, { reason }).then((r) => r.data),
  pendingSales: (): Promise<CustodyPendingSale[]> =>
    api.get('/custody/mine/pending-sales').then((r) => r.data),
  approveSales: (body: {
    saleIds: string[];
    expectedCount: number;
    reviewed: true;
  }): Promise<{ approved: number }> =>
    api.post('/custody/mine/approve-sales', body).then((r) => r.data),
  handoverPreview: (): Promise<CustodyHandoverPreview | null> =>
    api.get('/custody/mine/handover-preview').then((r) => r.data),
  // No `items` any more — a handover always hands back everything currently
  // held (the API computes it), which is what lets approval end the custody.
  submitHandover: (body: { cashDeclaredFc: string; note?: string }): Promise<{ id: string }> =>
    api.post('/custody/handovers', body).then((r) => r.data),
};
