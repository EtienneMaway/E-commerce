'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { salesApi } from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { formatDate } from '../../../lib/utils';
import { useFormatCurrency } from '../../../lib/currency';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { useT } from '../../../lib/i18n';

type Period = '7d' | '30d' | '90d' | 'all';

interface Row {
  id: string;
  productName: string;
  source: string;
  qtySold: number;
  unitCost: string;
  salePrice: string;
  profit: string;
  isLoss: boolean;
  date: string;
}

export default function SalesPage() {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const [period, setPeriod] = useState<Period>('30d');

  const PERIODS: { label: string; value: Period }[] = [
    { label: t.sales.period7d, value: '7d' },
    { label: t.sales.period30d, value: '30d' },
    { label: t.sales.period90d, value: '90d' },
    { label: t.sales.periodAll, value: 'all' },
  ];

  const COLUMNS: Column<Row>[] = [
    {
      key: 'productName', header: t.sales.colProduct, sortable: true,
      render: (r) => (
        <span className="font-medium" style={{ color: 'var(--foreground)' }}>
          {r.productName.charAt(0).toUpperCase() + r.productName.slice(1)}
        </span>
      ),
    },
    {
      key: 'source', header: t.sales.colSource,
      render: (r) => <Badge label={r.source === 'PERSONAL' ? t.sales.sourcePersonal : t.sales.sourceSupplier} variant={r.source === 'PERSONAL' ? 'personal' : 'supplier'} />,
    },
    { key: 'qtySold', header: t.sales.colQty, sortable: true, getValue: (r) => r.qtySold },
    {
      key: 'unitCost', header: t.sales.colUnitCost, sortable: true,
      getValue: (r) => parseFloat(r.unitCost),
      render: (r) => formatCurrency(r.unitCost),
    },
    {
      key: 'salePrice', header: t.sales.colSalePrice, sortable: true,
      getValue: (r) => parseFloat(r.salePrice),
      render: (r) => formatCurrency(r.salePrice),
    },
    {
      key: 'profit', header: t.sales.colProfit, sortable: true,
      getValue: (r) => parseFloat(r.profit),
      render: (r) => (
        <Badge
          label={r.isLoss ? `-${formatCurrency(Math.abs(parseFloat(r.profit)).toFixed(2))}` : `+${formatCurrency(r.profit)}`}
          variant={r.isLoss ? 'loss' : 'profit'}
        />
      ),
    },
    { key: 'date', header: t.sales.colDate, sortable: true, getValue: (r) => r.date, render: (r) => formatDate(r.date) },
  ];

  const { data, isLoading } = useQuery({
    queryKey: QK.salesHistory({ period }),
    queryFn: () => salesApi.list({ period }),
    staleTime: 30_000,
  });

  const rows = ((data as { data: Row[]; total: number } | undefined)?.data) ?? [];
  const totalRevenue = rows.reduce((s, r) => s + parseFloat(r.salePrice) * r.qtySold, 0);
  const totalProfit = rows.reduce((s, r) => s + parseFloat(r.profit), 0);
  const lossCount = rows.filter((r) => r.isLoss).length;

  return (
    <div>
      <div className="page-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div className="flex-1 min-w-0">
          <h1 className="page-title">{t.sales.title}</h1>
          <p className="page-sub">
            {t.sales.transactions(rows.length)} · {t.sales.revenue}:{' '}
            <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{formatCurrency(totalRevenue.toFixed(2))}</span>
            {' '}· {t.sales.profit}:{' '}
            <span style={{ fontWeight: 600, color: totalProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatCurrency(totalProfit.toFixed(2))}
            </span>
            {lossCount > 0 && (
              <span style={{ color: 'var(--danger)' }}> · {t.sales.lossSales(lossCount)}</span>
            )}
          </p>
          {/* Period filter */}
          <div className="flex gap-1.5 mt-3">
            {PERIODS.map((p) => (
              <button key={p.value} onClick={() => setPeriod(p.value)} className={`pill${period === p.value ? ' active' : ''}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <Link href="/sales/top-products" className="btn btn-primary flex-shrink-0">
          {t.sales.topProducts}
        </Link>
      </div>

      <div className="page-content">
        {isLoading ? (
          <div className="loading-state"><div className="spinner" /><span>{t.sales.loading}</span></div>
        ) : (
          <DataTable
            columns={COLUMNS}
            data={rows}
            keyField="id"
            searchPlaceholder={t.sales.searchPlaceholder}
            searchFields={['productName']}
          />
        )}
      </div>
    </div>
  );
}
