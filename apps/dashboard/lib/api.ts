import axios from 'axios';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export const api = axios.create({
  baseURL: BASE,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// Module-level token — updated by the auth store on login/logout/hydrate.
// Avoids any circular imports or SSR/localStorage timing issues.
let _token: string | null = null;

export function setAuthToken(token: string | null) {
  _token = token;
}

api.interceptors.request.use((config) => {
  if (_token) {
    config.headers.set('Authorization', `Bearer ${_token}`);
  }
  // Send user's locale so the API can return translated error messages
  const locale = typeof window !== 'undefined' ? (localStorage.getItem('ta_locale') ?? 'en') : 'en';
  config.headers.set('Accept-Language', locale);
  return config;
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (body: { emailOrPhone: string; password: string }) =>
    api.post('/auth/login', body).then((r) => r.data),
  register: (body: { username: string; email?: string; phone?: string; password: string }) =>
    api.post('/auth/register', body).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  search: (q: string) =>
    api.get('/users/search', { params: { q } }).then((r) => r.data),
};

// ─── Inventory ────────────────────────────────────────────────────────────────

export const inventoryApi = {
  listProducts: () => api.get('/inventory/products').then((r) => r.data),

  list: (params?: { source?: string; category?: string; productName?: string }) =>
    api.get('/inventory', { params }).then((r) => r.data),
  addPersonal: (body: { productName: string; unitCost: string; sellingPrice: string; quantity: number; category?: string; cartonPrice?: string; piecesPerCarton?: number }) =>
    api.post('/inventory/personal', body).then((r) => r.data),
  receiveFromSupplier: (body: { supplierUserId: string; productName: string; unitCost: string; sellingPrice: string; quantity: number; category?: string; cartonPrice?: string; piecesPerCarton?: number }) =>
    api.post('/inventory/receive', body).then((r) => r.data),
  updateSellingPrice: (id: string, sellingPrice: string) =>
    api.patch(`/inventory/${id}/selling-price`, { sellingPrice }).then((r) => r.data),
  adjustStock: (
    entryId: string,
    body: { reason: string; qty: number; notes?: string },
  ) => api.post(`/inventory/${entryId}/adjust`, body).then((r) => r.data),
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
  create: (body: { debtorUserId: string; note?: string; items: { productName: string; quantity: number; agreedUnitPrice: string }[] }) =>
    api.post('/consignments', body).then((r) => r.data),
  outgoing: () => api.get('/consignments/outgoing').then((r) => r.data),
  incoming: () => api.get('/consignments/incoming').then((r) => r.data),
  confirm: (id: string) => api.patch(`/consignments/${id}/confirm`).then((r) => r.data),
  reject: (id: string) => api.patch(`/consignments/${id}/reject`).then((r) => r.data),
  cancel: (id: string) => api.patch(`/consignments/${id}/cancel`).then((r) => r.data),
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

export const salesApi = {
  list: (params?: { productName?: string; period?: string; page?: number; limit?: number; actorId?: string }) =>
    api.get('/sales', { params }).then((r) => r.data),
  topProducts: (params?: { rankBy?: 'qty' | 'revenue' | 'profit'; period?: string }) =>
    api.get('/sales/top-products', { params }).then((r) => r.data),
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
  recordPaymentIn: (id: string, body: { amount: string; notes?: string }) =>
    api.post(`/external-contacts/${id}/payment-in`, body).then((r) => r.data),
  recordProductIn: (id: string, body: { productName: string; quantity: number; unitCost: string; sellingPrice: string; category?: string; notes?: string }) =>
    api.post(`/external-contacts/${id}/product-in`, body).then((r) => r.data),
  recordPaymentOut: (id: string, body: { amount: string; notes?: string }) =>
    api.post(`/external-contacts/${id}/payment-out`, body).then((r) => r.data),
  deleteTransaction: (contactId: string, txId: string) =>
    api.delete(`/external-contacts/${contactId}/transactions/${txId}`),
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
}

export interface ExpenseListResponse {
  data: Expense[];
  totals: {
    totalAmountUsd: string;
    byCategory: { category: ExpenseCategory; totalUsd: string; count: number }[];
    count: number;
  };
}

export interface ExpenseListParams {
  period?: ExpensePeriod;
  days?: number;
  from?: string;
  to?: string;
  category?: ExpenseCategory;
  actorId?: string;
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

export const withdrawalsApi = {
  available: (): Promise<AvailableWithdrawal> =>
    api.get('/withdrawals/available').then((r) => r.data),
  list: (): Promise<Withdrawal[]> => api.get('/withdrawals').then((r) => r.data),
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
  isMiniEmployee?: boolean;
}

export interface Employment {
  id: string;
  employerId: string;
  employer?: EmploymentParty;
  employeeId: string;
  employee?: EmploymentParty;
  tier: EmploymentTier;
  status: EmploymentStatus;
  terminationRequestedBy: string | null;
  acceptedAt: string | null;
  terminatedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  create: (body: { employeeUserId?: string; emailOrPhone?: string; tier: EmploymentTier }): Promise<Employment> =>
    api.post('/employments', body).then((r) => r.data),
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

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const dashboardApi = {
  summary: () => api.get('/dashboard').then((r) => r.data),
  cashPosition: () => api.get('/dashboard/cash-position').then((r) => r.data),
  suppliers: () => api.get('/dashboard/suppliers').then((r) => r.data),
  supplierDetail: (id: string) => api.get(`/dashboard/suppliers/${id}`).then((r) => r.data),
  debtors: () => api.get('/dashboard/debtors').then((r) => r.data),
  debtorDetail: (id: string) => api.get(`/dashboard/debtors/${id}`).then((r) => r.data),
  profitByProduct: (params?: { limit?: number }) =>
    api.get('/dashboard/profit-by-product', { params }).then((r) => r.data),
  profitBySource: () => api.get('/dashboard/profit-by-source').then((r) => r.data),
  alerts: () => api.get('/dashboard/alerts').then((r) => r.data),
};
