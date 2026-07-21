'use client';

import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import Link from 'next/link';
import { salesApi, inventoryApi } from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { formatDate, breakdownQuantity, formatBreakdown } from '../../../lib/utils';
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

type Period = '7d' | '30d' | '90d' | 'all' | 'custom';

/** Rows fetched per query — the sales list DTO caps `limit` at 200. Beyond this
 *  the table shows the most recent 200 (with a note); the header count stays
 *  exact via the aggregate endpoint. */
const MAX_LIST_ROWS = 200;
/** Client-side page size for the history table. */
const TABLE_PAGE_SIZE = 15;

/** A user-picked date range (YYYY-MM-DD strings; '' = open-ended). */
interface CustomRange {
  from: string;
  to: string;
}

/**
 * Map the sales-history period to profit-summary params. 7d/30d align exactly
 * with the endpoint's rolling week/month windows; 90d and the user 'custom'
 * range both use the summary endpoint's custom mode.
 */
function summaryParams(period: Period, custom: CustomRange): {
  period: 'week' | 'month' | 'all' | 'custom';
  dateFrom?: string;
  dateTo?: string;
} {
  if (period === '7d') return { period: 'week' };
  if (period === '30d') return { period: 'month' };
  if (period === 'all') return { period: 'all' };
  if (period === 'custom') {
    // Undefined (not '') so an open-ended side is omitted from the query string.
    return { period: 'custom', dateFrom: custom.from || undefined, dateTo: custom.to || undefined };
  }
  const from = new Date();
  from.setDate(from.getDate() - 90);
  return { period: 'custom', dateFrom: from.toISOString().slice(0, 10), dateTo: new Date().toISOString().slice(0, 10) };
}

/**
 * Params for the sales LIST endpoint. Its `period` enum has no `custom` value,
 * so a user range is expressed as `period: 'all'` (which makes the API skip the
 * rolling-window filter) plus explicit dateFrom/dateTo. The presets pass through.
 */
function listParams(period: Period, custom: CustomRange, actorId?: string): {
  period: string;
  dateFrom?: string;
  dateTo?: string;
  actorId?: string;
} {
  if (period === 'custom') {
    return { period: 'all', dateFrom: custom.from || undefined, dateTo: custom.to || undefined, actorId };
  }
  return { period, actorId };
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
  const [custom, setCustom] = useState<CustomRange>({ from: '', to: '' });
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
    { label: t.sales.periodCustom, value: 'custom' },
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
    {
      key: 'qtySold', header: t.sales.colQty, sortable: true,
      // Sort on the raw piece count; render the packaging breakdown. A product
      // with piecesPerCarton set shows e.g. "2 ctn  1 dz  3 pcs  (51 total)";
      // a loose product (no carton) shows "51 pcs". ppcMap keys already align
      // with sale productName (same map drives receipt printing below).
      getValue: (r) => r.qtySold,
      render: (r) => formatBreakdown(breakdownQuantity(r.qtySold, ppcMap.get(r.productName) ?? null)),
    },
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

  // Fetch the whole filtered period (up to the API's hard cap) and paginate the
  // table client-side. Without an explicit limit the API returned only its
  // default 10 rows while reporting the true total, so widening a period could
  // never reveal more than 10 and there was no pager to reach the rest — the
  // filters looked broken. TABLE_PAGE_SIZE drives DataTable's own pager.
  const queryParams = { ...listParams(period, custom, resolveActorFilter(actorFilter)), limit: MAX_LIST_ROWS };
  const { data, isLoading } = useQuery({
    queryKey: QK.salesHistory(queryParams),
    queryFn: () => salesApi.list(queryParams),
    // Cache tuning so identical filters aren't re-fetched or re-aggregated: a
    // filter already viewed this session serves from cache with no server hit,
    // and keepPreviousData holds the current rows while the next filter loads
    // instead of flashing a spinner (and re-mounting the table) each switch.
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const rows = ((data as { data: Row[]; total: number } | undefined)?.data) ?? [];
  const listTotal = (data as { total: number } | undefined)?.total ?? 0;
  // True when the period holds more rows than the API cap returned, so the table
  // shows only the most recent MAX_LIST_ROWS. The header count stays exact (it
  // comes from the aggregate endpoint), so this note explains the difference.
  const isTruncated = listTotal > rows.length;

  // Period totals come from the dedicated profit-summary endpoint so they cover
  // the WHOLE period — not just the rows on the current page (which was the old
  // bug: the header summed only the visible ~10 rows).
  const sParams = { ...summaryParams(period, custom), actorId: resolveActorFilter(actorFilter) };
  const { data: summary } = useQuery({
    queryKey: QK.salesProfitSummary(sParams),
    queryFn: () => salesApi.profitSummary(sParams),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const totalRevenue = summary ? parseFloat(summary.totalRevenue) : 0;
  const totalProfit = summary ? parseFloat(summary.totalProfit) : 0;
  const txnCount = summary?.salesCount ?? listTotal;

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
            {period === 'custom' && (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{t.sales.filterFrom}</span>
                <input
                  type="date"
                  value={custom.from}
                  max={custom.to || undefined}
                  onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                  className="rounded-lg border outline-none"
                  style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)', padding: '4px 8px', fontSize: 12 }}
                />
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{t.sales.filterTo}</span>
                <input
                  type="date"
                  value={custom.to}
                  min={custom.from || undefined}
                  onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                  className="rounded-lg border outline-none"
                  style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)', padding: '4px 8px', fontSize: 12 }}
                />
              </div>
            )}
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
          <>
            <DataTable
              columns={COLUMNS}
              data={rows}
              keyField="id"
              searchPlaceholder={t.sales.searchPlaceholder}
              searchFields={['productName']}
              pageSize={TABLE_PAGE_SIZE}
            />
            {isTruncated && (
              <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                {t.sales.showingRecent(rows.length, listTotal)}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
