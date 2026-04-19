'use client';

import { useQuery } from '@tanstack/react-query';
import { dashboardApi, salesApi } from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { formatDate } from '../../../lib/utils';
import { useFormatCurrency } from '../../../lib/currency';
import { KpiCard } from '../../../components/ui/KpiCard';
import { Badge } from '../../../components/ui/Badge';
import { TopProductsChart } from '../../../components/charts/TopProductsChart';
import { SourcePieChart } from '../../../components/charts/SourcePieChart';
import { useT } from '../../../lib/i18n';

interface Summary { totalIOwe: string; totalOwedToMe: string; netPosition: string; totalProfitAllTime: string; totalPurchaseValue: string; totalSellingValue: string; }
interface CashPosition {
  totalIncome: string;
  totalCogs: string;
  totalProfit: string;
  totalExpenses: string;
  availableCash: string;
  breakdown: { directSalesRevenue: string; consignmentRevenue: string; externalProductOutRevenue: string };
}
interface TopProduct { productName: string; totalProfit: string; totalRevenue: string; totalQtySold: string; }
interface SourceRow { source: string; supplierUsername?: string; totalProfit: string; }
interface SaleRow { id: string; productName: string; salePrice: string; qtySold: number; profit: string; isLoss: boolean; date: string; }
interface SalesPage { data: SaleRow[]; total: number; }
interface AlertItem {
  type: 'overdue_debtor' | 'low_stock';
  debtorUserId?: string;
  debtorUsername?: string;
  outstandingBalance?: string;
  daysSinceActivity?: number;
  productName?: string;
  quantityRemaining?: number;
}

export default function DashboardPage() {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: QK.dashboard,
    queryFn: () => dashboardApi.summary(),
  });
  const { data: topProducts } = useQuery({
    queryKey: QK.topProducts({ rankBy: 'profit', period: '30d' }),
    queryFn: () => dashboardApi.profitByProduct({ limit: 5 }),
  });
  const { data: sourceData } = useQuery({
    queryKey: QK.profitBySource,
    queryFn: () => dashboardApi.profitBySource(),
  });
  const { data: recentSales } = useQuery({
    queryKey: QK.salesHistory({ limit: 10 }),
    queryFn: () => salesApi.list({ limit: 10 }),
  });
  const { data: alertsData } = useQuery({
    queryKey: QK.alerts,
    queryFn: () => dashboardApi.alerts(),
    staleTime: 5 * 60_000,
  });
  const { data: cashPosition, isLoading: cashLoading } = useQuery({
    queryKey: QK.cashPosition,
    queryFn: () => dashboardApi.cashPosition(),
  });

  const alerts = (alertsData as AlertItem[] | undefined) ?? [];
  const overdueDebtors = alerts.filter((a) => a.type === 'overdue_debtor');
  const lowStockItems  = alerts.filter((a) => a.type === 'low_stock');

  const s = summary as Summary | undefined;
  const net = s ? parseFloat(s.netPosition) : 0;
  const cp = cashPosition as CashPosition | undefined;
  const availableCash = cp ? parseFloat(cp.availableCash) : 0;
  const overSpent = availableCash < 0;

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.dashboard.title}</h1>
          <p className="page-sub">{t.dashboard.sub}</p>
        </div>
        <div
          className="text-xs font-semibold px-3 py-1.5 rounded-full"
          style={{ background: 'rgba(var(--success-rgb),0.1)', color: 'var(--success)', border: '1px solid rgba(var(--success-rgb),0.2)' }}
        >
          ● {t.common.live}
        </div>
      </div>

      <div className="page-content space-y-6">

        {/* ── Alerts ────────────────────────────────────────────────── */}
        {alerts.length > 0 && (
          <div className="space-y-3 anim-fade-up">
            {overdueDebtors.length > 0 && (
              <div
                className="alert-box"
                style={{ background: 'var(--danger-light)', borderColor: 'rgba(var(--danger-rgb),0.2)' }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
                  style={{ background: 'rgba(var(--danger-rgb),0.15)' }}
                >
                  ⏰
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm" style={{ color: 'var(--danger)' }}>
                    {t.dashboard.overdueDebtors(overdueDebtors.length)}
                  </p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--danger)', opacity: 0.75 }}>
                    {overdueDebtors.map((a) => `@${a.debtorUsername} (${formatCurrency(a.outstandingBalance ?? '0')} — ${t.dashboard.daysSince(a.daysSinceActivity ?? 0)})`).join(' · ')}
                  </p>
                </div>
                <a href="/debtors" className="btn btn-danger text-xs flex-shrink-0">View →</a>
              </div>
            )}
            {lowStockItems.length > 0 && (
              <div
                className="alert-box"
                style={{ background: 'var(--warning-light)', borderColor: 'rgba(var(--warning-rgb),0.2)' }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
                  style={{ background: 'rgba(var(--warning-rgb),0.15)' }}
                >
                  📦
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm" style={{ color: 'var(--warning)' }}>
                    {t.dashboard.lowStockItems(lowStockItems.length)}
                  </p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--warning)', opacity: 0.75 }}>
                    {lowStockItems.map((a) => `${a.productName} (${t.dashboard.left(a.quantityRemaining ?? 0)})`).join(' · ')}
                  </p>
                </div>
                <a href="/inventory" className="btn btn-danger text-xs flex-shrink-0" style={{ color: 'var(--warning)', background: 'rgba(var(--warning-rgb),0.15)', borderColor: 'rgba(var(--warning-rgb),0.25)' }}>View →</a>
              </div>
            )}
          </div>
        )}

        {/* ── Cash Position ─────────────────────────────────────────── */}
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <h2 className="font-bold text-sm tracking-tight" style={{ color: 'var(--foreground)' }}>
                {t.dashboard.cashPositionTitle}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                {t.dashboard.cashPositionSub}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label={t.dashboard.totalIncome}
              value={formatCurrency(cp?.totalIncome ?? '0')}
              icon="💵"
              color="primary"
              sub={t.dashboard.totalIncomeSub}
              loading={cashLoading}
            />
            <KpiCard
              label={t.dashboard.totalProfitBeforeExpenses}
              value={formatCurrency(cp?.totalProfit ?? '0')}
              icon="📊"
              color="success"
              sub={t.dashboard.totalProfitSub}
              loading={cashLoading}
            />
            <KpiCard
              label={t.dashboard.totalExpenses}
              value={formatCurrency(cp?.totalExpenses ?? '0')}
              icon="🧾"
              color="warning"
              sub={t.dashboard.totalExpensesSub}
              loading={cashLoading}
            />
            <KpiCard
              label={t.dashboard.availableCash}
              value={formatCurrency(cp?.availableCash ?? '0')}
              icon={overSpent ? '⚠️' : '💰'}
              color={overSpent ? 'danger' : 'success'}
              sub={overSpent ? t.dashboard.availableCashOver : t.dashboard.availableCashSub}
              loading={cashLoading}
            />
          </div>
        </div>

        {/* ── KPI cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard label={t.dashboard.iOweSuppliers} value={formatCurrency(s?.totalIOwe ?? '0')} icon="🏭" color="danger" sub={t.dashboard.outstandingSupplierDebt} loading={summaryLoading} />
          <KpiCard label={t.dashboard.debtorsOweMe} value={formatCurrency(s?.totalOwedToMe ?? '0')} icon="🤝" color="success" sub={t.dashboard.outstandingDebtorCredit} loading={summaryLoading} />
          <KpiCard label={t.dashboard.netPosition} value={formatCurrency(s?.netPosition ?? '0')} icon={net >= 0 ? '📈' : '📉'} color={net >= 0 ? 'success' : 'danger'} sub={net >= 0 ? t.dashboard.netPositive : t.dashboard.netNegative} loading={summaryLoading} />
          <KpiCard label={t.dashboard.totalProfit} value={formatCurrency(s?.totalProfitAllTime ?? '0')} icon="💰" color="primary" sub={t.dashboard.allTimeSalesProfit} loading={summaryLoading} />
          <KpiCard label={t.dashboard.totalPurchaseValue} value={formatCurrency(s?.totalPurchaseValue ?? '0')} icon="🛒" color="warning" sub={t.dashboard.purchaseValueSub} loading={summaryLoading} />
          <KpiCard label={t.dashboard.totalSellingValue} value={formatCurrency(s?.totalSellingValue ?? '0')} icon="💵" color="success" sub={t.dashboard.sellingValueSub} loading={summaryLoading} />
        </div>

        {/* ── Charts ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card anim-fade-up delay-1" style={{ padding: '24px' }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-bold text-sm tracking-tight" style={{ color: 'var(--foreground)' }}>{t.dashboard.topProductsByProfit}</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{t.dashboard.allTime}</p>
              </div>
              <div
                className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
              >
                {t.dashboard.top5}
              </div>
            </div>
            <TopProductsChart data={(topProducts as TopProduct[] | undefined) ?? []} rankBy="profit" />
          </div>
          <div className="card anim-fade-up delay-2" style={{ padding: '24px' }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-bold text-sm tracking-tight" style={{ color: 'var(--foreground)' }}>{t.dashboard.profitBySource}</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{t.dashboard.revenueBreakdown}</p>
              </div>
            </div>
            <SourcePieChart data={(sourceData as SourceRow[] | undefined) ?? []} />
          </div>
        </div>

        {/* ── Recent sales ──────────────────────────────────────────── */}
        <div className="card anim-fade-up delay-3" style={{ overflow: 'hidden', padding: 0 }}>
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div>
              <h2 className="font-bold text-sm tracking-tight" style={{ color: 'var(--foreground)' }}>{t.dashboard.recentSales}</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{t.dashboard.last10Transactions}</p>
            </div>
            <a
              href="/sales"
              className="text-xs font-semibold"
              style={{ color: 'var(--primary)' }}
            >
              {t.common.viewAll}
            </a>
          </div>
          <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm" style={{ minWidth: '480px' }}>
            <thead>
              <tr className="data-table-head-row">
                {[t.dashboard.colProduct, t.dashboard.colQty, t.dashboard.colSalePrice, t.dashboard.colProfit, t.dashboard.colDate].map((h) => (
                  <th key={h} className="data-table-head-cell">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {((recentSales as SalesPage | undefined)?.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm" style={{ color: 'var(--muted)' }}>
                    <div className="text-2xl mb-2">📊</div>
                    {t.dashboard.noSalesYet}
                  </td>
                </tr>
              ) : (
                ((recentSales as SalesPage).data).map((row, i) => (
                  <tr
                    key={row.id}
                    className="data-table-row"
                    style={{ background: i % 2 === 0 ? 'var(--card)' : 'var(--surface)' }}
                  >
                    <td className="data-table-cell font-semibold">
                      {row.productName.charAt(0).toUpperCase() + row.productName.slice(1)}
                    </td>
                    <td className="data-table-cell" style={{ color: 'var(--muted)' }}>{row.qtySold}</td>
                    <td className="data-table-cell">{formatCurrency(row.salePrice)}</td>
                    <td className="data-table-cell">
                      <Badge
                        label={row.isLoss
                          ? `-${formatCurrency(Math.abs(parseFloat(row.profit)).toFixed(2))}`
                          : `+${formatCurrency(row.profit)}`}
                        variant={row.isLoss ? 'loss' : 'profit'}
                      />
                    </td>
                    <td className="data-table-cell" style={{ color: 'var(--muted)', fontSize: '12px' }}>{formatDate(row.date)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>

      </div>
    </div>
  );
}
