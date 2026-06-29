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
};

// ─── Sales ─────────────────────────────────────────────────────────────────

export const salesApi = {
  record: (
    body: {
      productName: string;
      qtySold: number;
      salePrice: string;
      confirmedOverride?: boolean;
      discountReason?: string;
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
};
