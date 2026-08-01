export const QK = {
  me: ['auth', 'me'] as const,
  inventoryProducts: ['inventory', 'products'] as const,
  inventory: (filters?: object) => ['inventory', filters] as const,
  salesHistory: (filters?: object) => ['sales', 'history', filters] as const,
  topProducts: (filters?: object) => ['sales', 'top-products', filters] as const,
  dashboard: ['dashboard', 'summary'] as const,
  /** Composite home payload — replaces 5 separate calls. See dashboardApi.home. */
  dashboardHome: ['dashboard', 'home'] as const,
  /**
   * Prefix key covering every ['dashboard', …] query (summary, home, suppliers,
   * alerts, cash-position, profit-by-*). Use this to invalidate after a write
   * that moves the books — invalidating only `dashboard` or `cashPosition`
   * individually silently misses the composite `home` payload the home screen
   * actually renders.
   */
  dashboardAll: ['dashboard'] as const,
  suppliers: ['dashboard', 'suppliers'] as const,
  supplierDetail: (id: string) => ['dashboard', 'suppliers', id] as const,
  profitByProduct: ['dashboard', 'profit-by-product'] as const,
  alerts: ['dashboard', 'alerts'] as const,
  userSearch: (q: string) => ['users', 'search', q] as const,
  exchangeRate: ['currency', 'rate'] as const,
  quantityDiscounts: ['quantity-discounts'] as const,
  salaryPaymentsPending: ['salary-payments', 'pending'] as const,
  salaryHistory: ['salary-payments', 'history'] as const,
  salarySummary: (employmentId: string, periodMonth: string) =>
    ['salary-payments', 'summary', employmentId, periodMonth] as const,
  expenses: (params?: object) => ['expenses', params ?? {}] as const,
  cashPosition: ['dashboard', 'cash-position'] as const,
  employments: (filters?: object) => ['employments', filters] as const,
  consignmentsIncoming: ['consignments', 'incoming'] as const,
  miniSettlementsOutgoing: ['mini-settlements', 'outgoing'] as const,
  miniExpenses: ['mini-settlements', 'expenses'] as const,
  miniExpensesAll: ['mini-settlements', 'expenses', 'all'] as const,
  miniExpenseAllowance: ['mini-settlements', 'expense-allowance'] as const,
  miniBalance: ['mini-settlements', 'my-balance'] as const,
  miniTeam: ['mini-settlements', 'team'] as const,
  miniStats: (period: string) => ['mini-settlements', 'stats', period] as const,
  profitSummary: (params?: object) => ['dashboard', 'profit-summary', params ?? {}] as const,
} as const;
