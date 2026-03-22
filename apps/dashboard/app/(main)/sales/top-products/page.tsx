'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { salesApi } from '../../../../lib/api';
import { QK } from '../../../../lib/query-keys';
import { useFormatCurrency } from '../../../../lib/currency';
import { TopProductsChart } from '../../../../components/charts/TopProductsChart';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { useT } from '../../../../lib/i18n';

type RankBy = 'profit' | 'revenue' | 'qty';
type Period = '7d' | '30d' | '90d' | 'all';

interface Row {
  productName: string;
  totalQtySold: string;
  totalRevenue: string;
  totalProfit: string;
}

export default function TopProductsPage() {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const [rankBy, setRankBy] = useState<RankBy>('profit');
  const [period, setPeriod] = useState<Period>('30d');

  const RANK_OPTIONS: { label: string; value: RankBy }[] = [
    { label: t.topProducts.rankByProfit, value: 'profit' },
    { label: t.topProducts.rankByRevenue, value: 'revenue' },
    { label: t.topProducts.rankByQty, value: 'qty' },
  ];

  const PERIODS: { label: string; value: Period }[] = [
    { label: t.sales.period7d, value: '7d' },
    { label: t.sales.period30d, value: '30d' },
    { label: t.sales.period90d, value: '90d' },
    { label: t.sales.periodAll, value: 'all' },
  ];

  const getColumns = (rb: RankBy): Column<Row>[] => [
    {
      key: 'productName', header: t.topProducts.colProduct,
      render: (r) => (
        <span className="font-medium" style={{ color: 'var(--foreground)' }}>
          {r.productName.charAt(0).toUpperCase() + r.productName.slice(1)}
        </span>
      ),
    },
    {
      key: 'totalQtySold', header: t.topProducts.colQtySold, sortable: true,
      getValue: (r) => Number(r.totalQtySold),
      render: (r) => <span style={{ fontWeight: rb === 'qty' ? 700 : 400, color: rb === 'qty' ? 'var(--primary)' : 'inherit' }}>{r.totalQtySold}</span>,
    },
    {
      key: 'totalRevenue', header: t.topProducts.colRevenue, sortable: true,
      getValue: (r) => parseFloat(r.totalRevenue),
      render: (r) => <span style={{ fontWeight: rb === 'revenue' ? 700 : 400, color: rb === 'revenue' ? 'var(--primary)' : 'inherit' }}>{formatCurrency(r.totalRevenue)}</span>,
    },
    {
      key: 'totalProfit', header: t.topProducts.colProfit, sortable: true,
      getValue: (r) => parseFloat(r.totalProfit),
      render: (r) => (
        <span style={{ fontWeight: rb === 'profit' ? 700 : 400, color: parseFloat(r.totalProfit) < 0 ? 'var(--danger)' : rb === 'profit' ? 'var(--primary)' : 'var(--success)' }}>
          {formatCurrency(r.totalProfit)}
        </span>
      ),
    },
  ];

  const { data, isLoading } = useQuery({
    queryKey: QK.topProducts({ rankBy, period }),
    queryFn: () => salesApi.topProducts({ rankBy, period }),
    staleTime: 30_000,
  });

  const rows = (data as Row[] | undefined) ?? [];

  return (
    <div>
      <div className="page-header">
        <div className="flex-1">
          <Link href="/sales" className="text-xs font-semibold mb-2 inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}>
            ← {t.sales.title}
          </Link>
          <h1 className="page-title">{t.topProducts.title}</h1>
          <div className="flex gap-3 mt-3 flex-wrap">
            <div className="flex gap-1.5">
              {RANK_OPTIONS.map((r) => (
                <button key={r.value} onClick={() => setRankBy(r.value)} className={`pill${rankBy === r.value ? ' active' : ''}`}>
                  {r.label}
                </button>
              ))}
            </div>
            <div className="w-px" style={{ background: 'var(--border)' }} />
            <div className="flex gap-1.5">
              {PERIODS.map((p) => (
                <button key={p.value} onClick={() => setPeriod(p.value)} className={`pill${period === p.value ? ' active' : ''}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="page-content space-y-6">
        {/* Chart */}
        <div className="card" style={{ padding: '24px' }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-sm tracking-tight" style={{ color: 'var(--foreground)' }}>
                {t.dashboard.top5} — {rankBy === 'qty' ? t.topProducts.rankByQty : rankBy === 'revenue' ? t.topProducts.rankByRevenue : t.topProducts.rankByProfit}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{period}</p>
            </div>
          </div>
          {isLoading ? (
            <div className="loading-state" style={{ padding: '32px 0' }}><div className="spinner" /></div>
          ) : (
            <TopProductsChart data={rows} rankBy={rankBy} />
          )}
        </div>

        {/* Table */}
        {!isLoading && (
          <DataTable
            columns={getColumns(rankBy)}
            data={rows}
            keyField="productName"
            searchPlaceholder={t.inventory.searchPlaceholder}
            searchFields={['productName']}
          />
        )}
      </div>
    </div>
  );
}
