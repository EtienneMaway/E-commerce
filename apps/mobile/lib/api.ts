import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const TOKEN_KEY = 'auth_token';

export type ActingAs = 'self' | 'employer';

// Module-level mirror of the persona store. Set by store/persona.store.ts so
// the interceptor can read synchronously without importing the store (avoids a
// circular dependency: store imports api, api would import store).
let _actingAs: ActingAs = 'self';
export function setActingAs(kind: ActingAs): void {
  _actingAs = kind;
}

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3001/api',
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT + persona on every request.
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['X-Acting-As'] = _actingAs;
  return config;
});

// ─── Auth ──────────────────────────────────────────────────────────────────

export const authApi = {
  register: (body: { username: string; email?: string; phone?: string; password: string }) =>
    api.post('/auth/register', body).then((r) => r.data),

  login: (body: { emailOrPhone: string; password: string }) =>
    api.post('/auth/login', body).then((r) => r.data),

  restore: (body: { emailOrPhone: string; password: string }) =>
    api.post('/auth/restore', body).then((r) => r.data),

  me: () => api.get('/auth/me').then((r) => r.data),

  // Mini employee pairs with the one-time code shown to the employer at creation.
  pairMiniEmployee: (body: { username: string; pairingCode: string }) =>
    api.post('/auth/pair-mini-employee', body).then((r) => r.data),
};

export type PendingDeletionPayload = {
  pendingDeletion: true;
  deletedAt: string;
  expiresAt: string;
  message?: string;
};

// ─── Users ─────────────────────────────────────────────────────────────────

export const usersApi = {
  search: (q: string) =>
    api.get('/users/search', { params: { q } }).then((r) => r.data),
};

// ─── Expenses ──────────────────────────────────────────────────────────────

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
  actorId: string | null;
  actor?: { id: string; username: string } | null;
}

export interface ExpenseListResponse {
  data: Expense[];
  totals: {
    totalAmountUsd: string;
    byCategory: { category: ExpenseCategory; totalUsd: string; count: number }[];
    count: number;
  };
  pagination: { page: number; limit: number; total: number; totalPages: number };
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
    clientId?: string;
  }): Promise<Expense> => api.post('/expenses', body).then((r) => r.data),

  delete: (id: string): Promise<void> => api.delete(`/expenses/${id}`).then(() => undefined),
};

// ─── Account (self-service profile + deletion) ─────────────────────────────

export const accountApi = {
  updateProfile: (body: { name?: string | null; email?: string | null; phone?: string | null }) =>
    api.patch('/users/me', body).then((r) => r.data),

  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api.patch('/users/me/password', body).then((r) => r.data),

  deleteAccount: (body: { password: string }) =>
    api
      .delete('/users/me', { data: body })
      .then((r) => r.data as { deletedAt: string; expiresAt: string }),
};

// ─── Inventory ─────────────────────────────────────────────────────────────

export interface ProductVariantSummary {
  variantId: string;
  label: string;
  unitCost: string;
  sellingPrice: string;
  piecesPerCarton: number;
  available: number;
  usdToFcRateSnapshot?: string | null;
}

export interface ProductSummary {
  productName: string;
  category: string | null;
  piecesPerCarton: number | null;
  latestCartonPrice: string | null;
  totalAvailable: number;
  sourceBreakdown: {
    personal: number;
    supplier: number;
    consignedIn: number;
    consignedOut: number;
  };
  latestSellingPrice: string;
  latestUnitCost: string;
  /** Locked FC/USD rate for a mini employee's consigned-in stock (null/absent
   *  for owner/full stock). The mini's app converts this product's prices at
   *  this rate instead of the live one. */
  usdToFcRateSnapshot?: string | null;
  // Sized (carton-with-variants) products — absent on simple products.
  kind?: 'simple' | 'group';
  groupId?: string;
  cartonSellingPrice?: string | null;
  cartonsAvailable?: number;
  variants?: ProductVariantSummary[];
}

export const inventoryApi = {
  listProducts: (): Promise<ProductSummary[]> =>
    api.get('/inventory/products').then((r) => r.data),

  list: (params?: { source?: string; supplierUserId?: string; category?: string; productName?: string; page?: number; limit?: number }) =>
    api.get('/inventory', { params }).then((r) => r.data),

  addPersonal: (body: {
    productName: string; unitCost: string; sellingPrice: string;
    quantity: number; category?: string; piecesPerCarton?: number;
  }) => api.post('/inventory/personal', body).then((r) => r.data),

  receiveFromSupplier: (body: {
    supplierUserId: string; productName: string; unitCost: string;
    sellingPrice: string; quantity: number; category?: string; piecesPerCarton?: number;
  }) => api.post('/inventory/receive', body).then((r) => r.data),

  consignToDebtor: (body: {
    debtorUserId: string; productName: string;
    quantity: number; agreedUnitPrice: string; category?: string;
  }) => api.post('/inventory/consign', body).then((r) => r.data),

  // Mini employee raises the selling price on their own consigned-in stock (>= agreed price).
  updateMiniSellingPrice: (id: string, sellingPrice: string) =>
    api.patch(`/inventory/${id}/mini-selling-price`, { sellingPrice }).then((r) => r.data),

  // Mini employee sets the whole-carton selling price for a sized product.
  updateMiniCartonPrice: (groupId: string, cartonSellingPrice: string) =>
    api.patch('/inventory/mini-carton-price', { groupId, cartonSellingPrice }).then((r) => r.data),
};

// ─── Employments (mini-employee handshake) ───────────────────────────────────

export interface EmploymentSummary {
  id: string;
  employerId: string;
  employeeId: string;
  tier: 'FULL' | 'SALES_ONLY';
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'TERMINATION_REQUESTED' | 'TERMINATED';
  employer?: { id: string; username: string; name?: string | null };
  createdAt: string;
}

export const employmentsApi = {
  list: (params?: { role?: 'employer' | 'employee'; status?: string }): Promise<EmploymentSummary[]> =>
    api.get('/employments', { params }).then((r) => r.data),
  accept: (id: string) => api.patch(`/employments/${id}/accept`).then((r) => r.data),
  reject: (id: string) => api.patch(`/employments/${id}/reject`).then((r) => r.data),
};

// ─── Consignments (mini receives assigned products) ──────────────────────────

export interface ConsignmentItemSummary {
  id: string;
  productName: string;
  quantity: number;
  agreedUnitPrice: string;
  piecesPerCarton?: number | null;
  /** Sized products: the size (variant) + its group + label; null on simple products. */
  variantId?: string | null;
  groupId?: string | null;
  variantLabel?: string | null;
}

export interface ConsignmentSummary {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  note: string | null;
  createdAt: string;
  supplier?: { id: string; username: string; name?: string | null };
  items: ConsignmentItemSummary[];
}

export const consignmentsApi = {
  incoming: (): Promise<ConsignmentSummary[]> =>
    api.get('/consignments/incoming').then((r) => r.data),
  confirm: (id: string) => api.patch(`/consignments/${id}/confirm`).then((r) => r.data),
  reject: (id: string) => api.patch(`/consignments/${id}/reject`).then((r) => r.data),
};

// ─── Mini-employee settlements (cash + returns handover) ─────────────────────

export interface MiniSettlementSummary {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  cashAmount: string;
  note: string | null;
  createdAt: string;
  approvedAt: string | null;
  items: {
    id: string;
    productName: string;
    quantity: number;
    agreedUnitPrice: string;
    variantLabel?: string | null;
  }[];
}

export const miniSettlementsApi = {
  create: (body: {
    cashAmount?: string;
    cashAmountFc?: string;
    returns?: { productName: string; quantity: number; variantId?: string }[];
    note?: string;
  }) => api.post('/mini-settlements', body).then((r) => r.data),
  outgoing: (): Promise<MiniSettlementSummary[]> =>
    api.get('/mini-settlements/outgoing').then((r) => r.data),
  myBalance: (): Promise<{ outstanding: string }> =>
    api.get('/mini-settlements/my-balance').then((r) => r.data),
  stats: (period: MiniStatsPeriod = 'since_handover'): Promise<MiniStats> =>
    api.get('/mini-settlements/stats', { params: { period } }).then((r) => r.data),
  handoverPreview: (): Promise<HandoverPreview> =>
    api.get('/mini-settlements/handover-preview').then((r) => r.data),
  createExpense: (body: {
    amount: string; // FC
    category: string;
    description?: string;
    clientId?: string;
  }): Promise<MiniExpenseSummary> =>
    api.post('/mini-settlements/expenses', body).then((r) => r.data),
  listExpenses: (): Promise<MiniExpenseSummary[]> =>
    api.get('/mini-settlements/expenses').then((r) => r.data),
  // Full history — pending AND already-handed-over expenses.
  listAllExpenses: (): Promise<MiniExpenseSummary[]> =>
    api.get('/mini-settlements/expenses', { params: { scope: 'all' } }).then((r) => r.data),
  deleteExpense: (id: string): Promise<void> =>
    api.delete(`/mini-settlements/expenses/${id}`).then((r) => r.data),
};

export interface MiniExpenseSummary {
  id: string;
  amount: string; // FC
  category: string;
  description: string | null;
  /** null while pending; set once a handover has claimed it. */
  settlementId: string | null;
  createdAt: string;
}

export type MiniStatsPeriod = 'since_handover' | 'today' | 'week' | 'month' | 'all';

export interface MiniStats {
  period: MiniStatsPeriod;
  windowStart: string | null;
  windowEnd: string | null;
  lastHandoverAt: string | null;
  /** Agreed value of consigned-in goods accepted in the window (USD). */
  iOwe: string;
  /** Gross owed for goods sold in the window (USD). */
  cashForSold: string;
  /** The mini's markup on the sold goods (USD). */
  profitMade: string;
  /** FC-native versions, each row at its consignment's locked rate — what the
   *  mini's app displays so a rate change never moves them. */
  iOweFc: string;
  cashForSoldFc: string;
  profitMadeFc: string;
  /** Pending expenses in the window to deduct from the cash to hand over (FC). */
  expensesFc: string;
  soldUnits: number;
}

export interface HandoverPreview {
  sold: {
    productName: string;
    variantId: string | null;
    variantLabel: string | null;
    qtySold: number;
    piecesPerCarton: number | null;
    revenue: string;
    agreedValue: string;
    profit: string;
    agreedValueFc: string; // FC at the sale's locked rate
    profitFc: string; // FC at the sale's locked rate
  }[];
  returns: {
    productName: string;
    variantId: string | null;
    variantLabel: string | null;
    quantity: number;
    piecesPerCarton: number | null;
  }[];
  cashForSold: string; // USD
  profitMade: string; // USD
  cashForSoldFc: string; // FC (each sale at its locked rate) — what the app shows
  profitMadeFc: string; // FC
  expensesFc: string; // FC
  expenses: { category: string; description: string | null; amount: string }[]; // amount FC
}

export const MINI_EXPENSE_CATEGORIES = [
  'TRANSPORT', 'MEALS', 'COMMUNICATION', 'PACKAGING', 'OTHER',
] as const;

// ─── Sales ─────────────────────────────────────────────────────────────────

export const salesApi = {
  record: (
    body: {
      productName: string;
      /** Pieces sold — required for a simple or single-size sale; omitted for a
       *  whole-carton sale (use cartonQty). */
      qtySold?: number;
      salePrice: string;
      /** FC price the customer paid — sent by minis so each deducted lot books
       *  at its own locked consignment rate. */
      salePriceFc?: string;
      /** Sell one size of a sized product (stock looked up by size). */
      variantId?: string;
      /** Sell whole cartons of a sized product at the group carton price. */
      carton?: boolean;
      groupId?: string;
      cartonQty?: number;
      confirmedOverride?: boolean;
      discountReason?: string;
      /** Pre-discount unit price (USD) to store on the row — sent when a
       *  quantity ("group of prices") discount was applied. */
      originalUnitPrice?: string;
      clientName?: string;
      clientPhone?: string;
      receiptId?: string;
      // Idempotency key — the offline queue sends the same value on every
      // retry so a sale committed during a dropped connection is never
      // duplicated server-side.
      clientSaleId?: string;
    },
    // Per-call overrides (offline sync uses a longer timeout for slow links).
    config?: { timeout?: number },
  ) => api.post('/sales', body, config).then((r) => r.data),

  list: (params?: {
    productName?: string;
    dateFrom?: string;
    dateTo?: string;
    period?: string;
    page?: number;
    limit?: number;
    clientQuery?: string;
  }) => api.get('/sales', { params }).then((r) => r.data),

  topProducts: (params?: { rankBy?: 'qty' | 'revenue' | 'profit'; period?: string; dateFrom?: string; dateTo?: string }) =>
    api.get('/sales/top-products', { params }).then((r) => r.data),

  /** Fetch every sale row sharing a receiptId — used to reconstruct a multi-item original receipt. */
  byReceipt: (receiptId: string) =>
    api.get(`/sales/by-receipt/${encodeURIComponent(receiptId)}`).then((r) => r.data),

  /** Attach (or update) buyer name + phone on a sale. Propagates across the whole receipt when receiptId is set. */
  updateClient: (saleId: string, body: { clientName?: string; clientPhone?: string }) =>
    api.patch(`/sales/${saleId}/client`, body).then((r) => r.data),
};

// ─── Payments ──────────────────────────────────────────────────────────────

export const paymentsApi = {
  paySupplier: (body: { supplierUserId: string; amount: string; note?: string }) =>
    api.post('/payments/to-supplier', body).then((r) => r.data),
};

// ─── Currency ──────────────────────────────────────────────────────────────

export const currencyApi = {
  getRate: () =>
    api
      .get('/currency/rate')
      .then(
        (r) =>
          r.data as {
            usdToFcRate: string;
            sellingRate?: string | null;
            updatedAt: string;
          },
      ),
};

// ─── Quantity discounts ("group of prices") ──────────────────────────────────

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
};

// ─── Salary Payments ───────────────────────────────────────────────────────

export type SalaryPaymentStatus =
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'CANCELLED';

export interface SalaryPaymentParty {
  id: string;
  username: string;
}

export interface SalaryEmployment {
  id: string;
  monthlyPay: string | null;
  payrollActive: boolean;
  status: string;
  tier: string;
}

export interface SalaryPayment {
  id: string;
  employmentId: string;
  employerId: string;
  employer?: SalaryPaymentParty;
  employeeId: string;
  employee?: SalaryPaymentParty;
  employment?: SalaryEmployment;
  amount: string;
  periodMonth: string;
  status: SalaryPaymentStatus;
  note: string | null;
  rejectionReason: string | null;
  paidAt: string;
  confirmedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
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
}

export const salaryPaymentsApi = {
  pending: (): Promise<SalaryPayment[]> =>
    api.get('/salary-payments/pending').then((r) => r.data),
  myHistory: (): Promise<SalaryPayment[]> =>
    api.get('/salary-payments', { params: { role: 'employee' } }).then((r) => r.data),
  summary: (employmentId: string, periodMonth?: string): Promise<SalarySummary> =>
    api
      .get('/salary-payments/summary', { params: { employmentId, periodMonth } })
      .then((r) => r.data),
  confirm: (id: string): Promise<SalaryPayment> =>
    api.patch(`/salary-payments/${id}/confirm`).then((r) => r.data),
  reject: (id: string, reason?: string): Promise<SalaryPayment> =>
    api.patch(`/salary-payments/${id}/reject`, { reason }).then((r) => r.data),
};

// ─── Dashboard ─────────────────────────────────────────────────────────────

export interface CashPosition {
  totalExpenses: string;
  totalExpensesAtBuyingRate: string;
  availableBusinessCash: string;
  availableProfitCash: string;
}

export const dashboardApi = {
  summary: () => api.get('/dashboard').then((r) => r.data),
  suppliers: () => api.get('/dashboard/suppliers').then((r) => r.data),
  supplierDetail: (id: string) => api.get(`/dashboard/suppliers/${id}`).then((r) => r.data),
  profitByProduct: () => api.get('/dashboard/profit-by-product').then((r) => r.data),
  profitBySource: () => api.get('/dashboard/profit-by-source').then((r) => r.data),
  alerts: () => api.get('/dashboard/alerts').then((r) => r.data),
  cashPosition: (): Promise<CashPosition> => api.get('/dashboard/cash-position').then((r) => r.data),
  profitSummary: (params?: {
    period?: 'today' | 'week' | 'month' | 'all' | 'custom';
    actorId?: string; // 'self' or a UUID
    dateFrom?: string;
    dateTo?: string;
  }): Promise<DashboardProfitSummary> =>
    api.get('/dashboard/profit-summary', { params }).then((r) => r.data),
};

export interface DashboardProfitSummary {
  period: string;
  dateFrom: string | null;
  dateTo: string | null;
  salesCount: number;
  totalQtySold: number;
  totalRevenue: string;
  totalCost: string;
  salesProfit: string;
  externalProfit: string;
  totalProfit: string;
}
