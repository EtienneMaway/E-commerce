export const QK = {
  me: ['auth', 'me'] as const,
  appVersion: (version: string, build: number | null) =>
    ['app-version', version, build] as const,
  inventoryProducts: ['inventory', 'products'] as const,
  inventory: (filters?: object) => ['inventory', filters ?? {}] as const,
  salesHistory: (filters?: object) => ['sales', 'history', filters ?? {}] as const,
  // Infinite (paged) history. The `pages` marker keeps it apart from the old
  // single-page entries an older build persisted under salesHistory(filters).
  salesHistoryPages: (filters: object) => ['sales', 'history', { ...filters, pages: true }] as const,
  topProducts: (filters?: object) => ['sales', 'top-products', filters ?? {}] as const,
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
  // Prefixed 'expenses' so the blanket ['expenses'] invalidation after an
  // expense mutation refreshes the full-employee daily allowance too.
  expenseAllowance: ['expenses', 'allowance'] as const,
  cashPosition: ['dashboard', 'cash-position'] as const,
  employments: (filters?: object) => ['employments', filters ?? {}] as const,
  consignmentsIncoming: ['consignments', 'incoming'] as const,
  // Children of consignmentsIncoming, so its invalidations (inbox signal,
  // confirm/reject) refresh them. Distinct keys, never the bare prefix: a cache
  // persisted by an older build holds a plain array there, and an infinite
  // query reading it would crash.
  consignmentsPending: ['consignments', 'incoming', 'pending'] as const,
  consignmentsHistoryPages: ['consignments', 'incoming', 'history-pages'] as const,
  miniSettlementsOutgoing: ['mini-settlements', 'outgoing'] as const,
  miniExpenses: ['mini-settlements', 'expenses'] as const,
  miniExpensesAll: ['mini-settlements', 'expenses', 'all'] as const,
  miniExpenseAllowance: ['mini-settlements', 'expense-allowance'] as const,
  miniBalance: ['mini-settlements', 'my-balance'] as const,
  miniTeam: ['mini-settlements', 'team'] as const,
  miniStats: (period: string) => ['mini-settlements', 'stats', period] as const,
  custodyMine: ['custody', 'mine'] as const,
  // Branch transfers — one prefix so a single invalidation refreshes them all.
  branchTransfersAll: ['branch-transfers'] as const,
  branchTransfers: (direction: string) => ['branch-transfers', 'list', direction] as const,
  branchTransferPages: (direction: string) => ['branch-transfers', 'list', direction, 'pages'] as const,
  branchDestinations: ['branch-transfers', 'destinations'] as const,
  branchBalances: ['branch-transfers', 'balances'] as const,
  branchPayments: ['branch-transfers', 'payments'] as const,
  custodyIssues: ['custody', 'mine', 'issues'] as const,
  custodyPendingSales: ['custody', 'mine', 'pending-sales'] as const,
  custodyPreview: ['custody', 'mine', 'handover-preview'] as const,
  profitSummary: (params?: object) => ['dashboard', 'profit-summary', params ?? {}] as const,
} as const;
