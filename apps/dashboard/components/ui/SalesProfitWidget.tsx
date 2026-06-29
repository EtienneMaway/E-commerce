'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { salesApi, type SalesProfitSummary } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import {
  PeriodFilter,
  DEFAULT_PERIOD,
  periodReady,
  periodToParams,
  type PeriodState,
  type SummaryPeriod,
} from './PeriodFilter';

interface Props {
  /** Restrict the summary to a single product (e.g. a product detail page). */
  productName?: string;
  /** Restrict the summary to a single actor (employee). */
  actorId?: string;
  /** Period selected by default. */
  defaultPeriod?: SummaryPeriod;
}

/**
 * Self-contained "sales profit for a period" card: revenue (what was sold for)
 * vs bought price (COGS) vs profit, over Today / last 7d / last 30d / all time
 * or a custom date range. Used on the product detail page; reusable elsewhere.
 */
export function SalesProfitWidget({ productName, actorId, defaultPeriod = 'today' }: Props) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const [sel, setSel] = useState<PeriodState>({ ...DEFAULT_PERIOD, period: defaultPeriod });

  const ready = periodReady(sel);
  const params = {
    ...periodToParams(sel),
    ...(productName ? { productName } : {}),
    ...(actorId ? { actorId } : {}),
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: QK.salesProfitSummary(params),
    queryFn: () => salesApi.profitSummary(params),
    enabled: ready,
    staleTime: 30_000,
  });

  const s = data as SalesProfitSummary | undefined;
  const profit = s ? parseFloat(s.totalProfit) : 0;
  const loading = isLoading || (isFetching && !s);
  const showEmpty = ready && !isLoading && s != null && s.salesCount === 0;

  return (
    <div className="card anim-fade-up" style={{ padding: '24px' }}>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="font-bold text-sm tracking-tight" style={{ color: 'var(--foreground)' }}>
            {t.dashboard.profitWidgetTitle}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            {t.dashboard.profitWidgetSub}
          </p>
        </div>
        <PeriodFilter value={sel} onChange={setSel} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Figure label={t.dashboard.profitRevenue} value={formatCurrency(s?.totalRevenue ?? '0')} color="var(--foreground)" loading={loading} />
        <Figure label={t.dashboard.profitCost} value={formatCurrency(s?.totalCost ?? '0')} color="var(--warning)" loading={loading} />
        <Figure
          label={t.dashboard.profitNet}
          value={formatCurrency(s?.totalProfit ?? '0')}
          color={profit >= 0 ? 'var(--success)' : 'var(--danger)'}
          loading={loading}
          emphatic
        />
      </div>

      <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
        {!ready
          ? `${t.dashboard.profitFrom} → ${t.dashboard.profitTo}`
          : showEmpty
            ? t.dashboard.profitNoSales
            : `${t.dashboard.profitSalesCount(s?.salesCount ?? 0)} · ${s?.totalQtySold ?? 0} ${t.dashboard.colQty.toLowerCase()}`}
      </p>
    </div>
  );
}

function Figure({
  label,
  value,
  color,
  loading,
  emphatic,
}: {
  label: string;
  value: string;
  color: string;
  loading?: boolean;
  emphatic?: boolean;
}) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
        {label}
      </p>
      {loading ? (
        <div className="skeleton h-6 w-24 mt-1.5" />
      ) : (
        <p
          className={emphatic ? 'text-xl font-bold tracking-tight mt-1' : 'text-lg font-semibold tracking-tight mt-1'}
          style={{ color }}
        >
          {value}
        </p>
      )}
    </div>
  );
}
