'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { salesApi, inventoryApi } from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { formatDate } from '../../../lib/utils';
import { useFormatCurrency } from '../../../lib/currency';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { ActorPill } from '../../../components/ui/ActorPill';
import {
  ACTOR_FILTER_ALL,
  ActorFilter,
  resolveActorFilter,
} from '../../../components/ui/ActorFilter';
import { useAuthStore } from '../../../store/auth.store';
import { useT } from '../../../lib/i18n';
import { saleReceiptHtml } from '../../../lib/print-templates';
import { PrintDialog } from '../../../components/ui/PrintDialog';

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
  actorId: string | null;
  actor: { id: string; username: string } | null;
  originalUnitPrice: string | null;
  discountReason: string | null;
}

export default function SalesPage() {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const { user } = useAuthStore();
  const [period, setPeriod] = useState<Period>('30d');
  const [actorFilter, setActorFilter] = useState<string>(ACTOR_FILTER_ALL);
  const [printRow, setPrintRow] = useState<Row | null>(null);

  const { data: productsData } = useQuery<{ productName: string; piecesPerCarton: number | null }[]>({
    queryKey: QK.inventoryProducts,
    queryFn: () => inventoryApi.listProducts(),
    staleTime: 60_000,
  });
  const ppcMap = new Map((productsData ?? []).map((p) => [p.productName, p.piecesPerCarton]));

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
        <div className="flex flex-col gap-0.5">
          <span className="font-medium" style={{ color: 'var(--foreground)' }}>
            {r.productName.charAt(0).toUpperCase() + r.productName.slice(1)}
          </span>
          <ActorPill
            actor={r.actor}
            viewerId={user?.id}
            discount={{
              originalUnitPrice: r.originalUnitPrice,
              discountReason: r.discountReason,
            }}
          />
        </div>
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
    {
      key: 'print',
      header: '',
      render: (r) => (
        <button
          onClick={() => setPrintRow(r)}
          className="btn btn-secondary"
          style={{ fontSize: '12px', padding: '5px 12px' }}
          title={t.print.printBtn}
        >
          🖨️
        </button>
      ),
    },
  ];

  const queryParams = { period, actorId: resolveActorFilter(actorFilter) };
  const { data, isLoading } = useQuery({
    queryKey: QK.salesHistory(queryParams),
    queryFn: () => salesApi.list(queryParams),
    staleTime: 30_000,
  });

  const rows = ((data as { data: Row[]; total: number } | undefined)?.data) ?? [];
  const totalRevenue = rows.reduce((s, r) => s + parseFloat(r.salePrice) * r.qtySold, 0);
  const totalProfit = rows.reduce((s, r) => s + parseFloat(r.profit), 0);
  const lossCount = rows.filter((r) => r.isLoss).length;

  return (
    <div>
      <PrintDialog
        open={!!printRow}
        onClose={() => setPrintRow(null)}
        buildHtml={(fmt) => saleReceiptHtml({
          items: printRow ? [{ productName: printRow.productName, qtySold: printRow.qtySold, salePrice: printRow.salePrice, piecesPerCarton: ppcMap.get(printRow.productName) ?? null }] : [],
          date: printRow?.date ?? '',
          formatCurrency: fmt,
          t: { title: t.print.saleReceipt, date: t.print.date, product: t.print.product, qty: t.print.qty, unitPrice: t.print.unitPrice, total: t.print.total, grandTotal: t.print.grandTotal, cartonPrice: t.print.cartonPrice, pcsPerCarton: t.print.pcsPerCarton },
        })}
      />
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
          {/* Period + actor filters */}
          <div className="flex gap-2 mt-3 flex-wrap items-center">
            <div className="flex gap-1.5">
              {PERIODS.map((p) => (
                <button key={p.value} onClick={() => setPeriod(p.value)} className={`pill${period === p.value ? ' active' : ''}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <ActorFilter value={actorFilter} onChange={setActorFilter} />
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
