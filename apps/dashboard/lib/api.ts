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
  addPersonal: (body: { productName: string; unitCost: string; sellingPrice: string; quantity: number; category?: string; piecesPerCarton?: number }) =>
    api.post('/inventory/personal', body).then((r) => r.data),
  receiveFromSupplier: (body: { supplierUserId: string; productName: string; unitCost: string; sellingPrice: string; quantity: number; category?: string; piecesPerCarton?: number }) =>
    api.post('/inventory/receive', body).then((r) => r.data),
  updateSellingPrice: (id: string, sellingPrice: string) =>
    api.patch(`/inventory/${id}/selling-price`, { sellingPrice }).then((r) => r.data),
};

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
};

// ─── Sales ────────────────────────────────────────────────────────────────────

export const salesApi = {
  list: (params?: { productName?: string; period?: string; page?: number; limit?: number }) =>
    api.get('/sales', { params }).then((r) => r.data),
  topProducts: (params?: { rankBy?: 'qty' | 'revenue' | 'profit'; period?: string }) =>
    api.get('/sales/top-products', { params }).then((r) => r.data),
};

// ─── Currency ─────────────────────────────────────────────────────────────────

interface RateResponse { usdToFcRate: string; updatedAt: string; }

export const currencyApi = {
  getRate: (): Promise<RateResponse> =>
    api.get('/currency/rate').then((r) => r.data),
  setRate: (usdToFcRate: string): Promise<RateResponse> =>
    api.put('/currency/rate', { usdToFcRate }).then((r) => r.data),
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

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const dashboardApi = {
  summary: () => api.get('/dashboard').then((r) => r.data),
  suppliers: () => api.get('/dashboard/suppliers').then((r) => r.data),
  supplierDetail: (id: string) => api.get(`/dashboard/suppliers/${id}`).then((r) => r.data),
  debtors: () => api.get('/dashboard/debtors').then((r) => r.data),
  debtorDetail: (id: string) => api.get(`/dashboard/debtors/${id}`).then((r) => r.data),
  profitByProduct: (params?: { limit?: number }) =>
    api.get('/dashboard/profit-by-product', { params }).then((r) => r.data),
  profitBySource: () => api.get('/dashboard/profit-by-source').then((r) => r.data),
  alerts: () => api.get('/dashboard/alerts').then((r) => r.data),
};
