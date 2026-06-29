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
import { generateReceiptId, type ReceiptData } from '../../../lib/thermal-receipt';

type Period = '7d' | '30d' | '90d' | 'all';

/**
 * Map the sales-history period to profit-summary params. 7d/30d align exactly
 * with the endpoint's rolling week/month windows; 90d uses a custom range.
 */
function summaryParams(period: Period): {
  period: 'week' | 'month' | 'all' | 'custom';
  dateFrom?: string;
  dateTo?: string;
} {
  if (period === '7d') return { period: 'week' };
  if (period === '30d') return { period: 'month' };
  if (period === 'all') return { period: 'all' };
  const from = new Date();
  from.setDate(from.getDate() - 90);
  return { period: 'custom', dateFrom: from.toISOString().slice(0, 10), dateTo: new Date().toISOString().slice(0, 10) };
}

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
          label={r.isLoss ? `-${formatCurrency(Math.abs(parseFloat(r.profit)).toFixed(4))}` : `+${formatCurrency(r.profit)}`}
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

  // Period totals come from the dedicated profit-summary endpoint so they cover
  // the WHOLE period — not just the rows on the current page (which was the old
  // bug: the header summed only the visible ~10 rows).
  const sParams = { ...summaryParams(period), actorId: resolveActorFilter(actorFilter) };
  const { data: summary } = useQuery({
    queryKey: QK.salesProfitSummary(sParams),
    queryFn: () => salesApi.profitSummary(sParams),
    staleTime: 30_000,
  });
  const totalRevenue = summary ? parseFloat(summary.totalRevenue) : 0;
  const totalProfit = summary ? parseFloat(summary.totalProfit) : 0;
  const txnCount = summary?.salesCount ?? (data as { total: number } | undefined)?.total ?? 0;

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
        buildReceiptData={(rate): ReceiptData => {
          // Convert the stored USD sale into FC for the thermal receipt. The
          // SaleTransaction only carries total pieces (no carton breakdown),
          // so the packaging line is omitted — but the carton-tier price
          // line still renders via piecesPerCarton, mirroring the mobile
          // re-print look.
          const r = parseFloat(rate) || 1;
          if (!printRow) {
            return { items: [], grandTotalFc: 0, markupPct: 0, date: '' };
          }
          const unitUsd = parseFloat(printRow.salePrice);
          const unitFc = unitUsd * r;
          const ppc = ppcMap.get(printRow.productName) ?? null;
          return {
            items: [{
              productName: printRow.productName,
              qty: printRow.qtySold,
              unitPriceFc: unitFc,
              totalFc: unitFc * printRow.qtySold,
              piecesPerCarton: ppc,
            }],
            grandTotalFc: unitFc * printRow.qtySold,
            markupPct: 0,
            date: new Date(printRow.date).toLocaleString('fr-CD'),
            businessName: user?.name ?? undefined,
            businessHandle: user?.username,
            sellerName: printRow.actor ? undefined : user?.name ?? undefined,
            sellerUsername: printRow.actor?.username ?? user?.username,
            receiptId: generateReceiptId(),
          };
        }}
      />
      <div className="page-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div className="flex-1 min-w-0">
          <h1 className="page-title">{t.sales.title}</h1>
          <p className="page-sub">
            {t.sales.transactions(txnCount)} · {t.sales.revenue}:{' '}
            <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{formatCurrency(totalRevenue.toFixed(4))}</span>
            {' '}· {t.sales.profit}:{' '}
            <span style={{ fontWeight: 600, color: totalProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatCurrency(totalProfit.toFixed(4))}
            </span>
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
