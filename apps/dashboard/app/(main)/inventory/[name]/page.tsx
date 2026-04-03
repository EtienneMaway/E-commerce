'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '../../../../lib/api';
import { QK } from '../../../../lib/query-keys';
import { formatDate, breakdownQuantity, formatBreakdown } from '../../../../lib/utils';
import { useFormatCurrency } from '../../../../lib/currency';
import { Badge } from '../../../../components/ui/Badge';
import { DataTable, type Column } from '../../../../components/ui/DataTable';
import { EditSellingPriceDialog } from '../../../../components/forms/EditSellingPriceDialog';
import { useT } from '../../../../lib/i18n';

interface InventoryEntry {
  id: string;
  source: string;
  productName: string;
  unitCost: string;
  sellingPrice: string;
  cartonPrice: string | null;
  category: string | null;
  quantityOriginal: number;
  quantityRemaining: number;
  piecesPerCarton: number | null;
  createdAt: string;
  supplierUserId: string | null;
  supplierUser?: { id: string; username: string } | null;
  debtorUserId: string | null;
  debtorUser?: { id: string; username: string } | null;
}

interface EditPriceTarget {
  id: string;
  productName: string;
  unitCost: string;
  sellingPrice: string;
}

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const productName = decodeURIComponent(name);
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const [editPriceTarget, setEditPriceTarget] = useState<EditPriceTarget | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: QK.inventory({ productName }),
    queryFn: () => inventoryApi.list({ productName }),
    staleTime: 30_000,
    enabled: !!productName,
  });

  const entries = (data as InventoryEntry[] | undefined) ?? [];

  const activeEntries = entries.filter((e) => e.source !== 'CONSIGNED_OUT');

  const totalAvailable = activeEntries.reduce((s, e) => s + e.quantityRemaining, 0);

  const piecesPerCarton = entries.find((e) => e.piecesPerCarton !== null)?.piecesPerCarton ?? null;
  const bd = breakdownQuantity(totalAvailable, piecesPerCarton);

  // Current stock value totals (only remaining units)
  const activePurchaseValue = activeEntries
    .reduce((s, e) => s + parseFloat(e.unitCost) * e.quantityRemaining, 0);
  const activeSellingValue = activeEntries
    .reduce((s, e) => s + parseFloat(e.sellingPrice) * e.quantityRemaining, 0);

  // All-time compound totals (all original quantities)
  const allTimePurchaseValue = activeEntries
    .reduce((s, e) => s + parseFloat(e.unitCost) * e.quantityOriginal, 0);
  const allTimeSellingValue = activeEntries
    .reduce((s, e) => s + parseFloat(e.sellingPrice) * e.quantityOriginal, 0);

  function sourceLabel(source: string): string {
    if (source === 'PERSONAL') return t.inventory.sourcePersonal;
    if (source === 'SUPPLIER') return t.inventory.sourceSupplier;
    if (source === 'CONSIGNED_IN') return t.inventory.sourceConsignedIn;
    return t.inventory.sourceConsigned;
  }

  function sourceBadgeVariant(source: string): 'personal' | 'supplier' | 'consigned' | 'pending' {
    if (source === 'PERSONAL') return 'personal';
    if (source === 'SUPPLIER') return 'supplier';
    if (source === 'CONSIGNED_IN') return 'pending';
    return 'consigned';
  }

  const COLUMNS: Column<InventoryEntry>[] = [
    {
      key: 'source',
      header: t.inventory.colSource,
      render: (r) => (
        <div>
          <Badge label={sourceLabel(r.source)} variant={sourceBadgeVariant(r.source)} />
          {(r.supplierUser || r.debtorUser) && (
            <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              {t.inventory.counterparty} @
              {r.supplierUser?.username ?? r.debtorUser?.username}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'quantityRemaining',
      header: t.inventory.colRemaining,
      sortable: true,
      getValue: (r) => r.quantityRemaining,
      render: (r) => {
        const bd = breakdownQuantity(r.quantityRemaining, r.piecesPerCarton);
        const isLow = r.quantityRemaining <= 5;
        return (
          <div style={{ color: isLow ? 'var(--danger)' : 'inherit' }}>
            <span style={{ fontWeight: isLow ? 600 : 400 }}>
              {formatBreakdown(bd)}
              {isLow && <span className="ml-1 text-xs">⚠️ {t.inventory.low}</span>}
            </span>
            <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              {r.quantityRemaining} / {r.quantityOriginal} pcs
              {r.piecesPerCarton ? ` · 1 ctn = ${r.piecesPerCarton} pcs` : ''}
            </div>
          </div>
        );
      },
    },
    {
      key: 'cartonPrice',
      header: t.inventory.colCartonPrice,
      sortable: true,
      getValue: (r) => r.cartonPrice ? parseFloat(r.cartonPrice) : 0,
      render: (r) => r.cartonPrice ? formatCurrency(r.cartonPrice) : <span style={{ color: 'var(--muted)' }}>—</span>,
    },
    {
      key: 'unitCost',
      header: t.inventory.colCost,
      sortable: true,
      getValue: (r) => parseFloat(r.unitCost),
      render: (r) => formatCurrency(r.unitCost),
    },
    {
      key: 'sellingPrice',
      header: t.inventory.colSellingPrice,
      sortable: true,
      getValue: (r) => parseFloat(r.sellingPrice),
      render: (r) => formatCurrency(r.sellingPrice),
    },
    {
      key: 'createdAt',
      header: t.inventory.colAdded,
      sortable: true,
      getValue: (r) => r.createdAt,
      render: (r) => formatDate(r.createdAt),
    },
    {
      key: 'actions',
      header: '',
      render: (r) =>
        r.source === 'CONSIGNED_IN' ? (
          <button
            onClick={() =>
              setEditPriceTarget({
                id: r.id,
                productName: r.productName,
                unitCost: r.unitCost,
                sellingPrice: r.sellingPrice,
              })
            }
            className="btn btn-secondary"
            style={{ fontSize: '12px', padding: '5px 12px' }}
          >
            {t.inventory.editPriceBtn}
          </button>
        ) : null,
    },
  ];

  return (
    <div>
      <EditSellingPriceDialog entry={editPriceTarget} onClose={() => setEditPriceTarget(null)} />

      {/* Header */}
      <div className="page-header">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link href="/inventory" className="text-sm" style={{ color: 'var(--muted)' }}>
              ← {t.inventory.title}
            </Link>
          </div>
          <h1 className="page-title">
            {productName.charAt(0).toUpperCase() + productName.slice(1)}
          </h1>

          {/* Available summary */}
          <div
            className="inline-flex flex-col mt-2 rounded-xl px-4 py-2 border"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          >
            <span className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>
              {t.inventory.totalAvailable}
            </span>
            <span className="font-bold text-lg" style={{ color: 'var(--foreground)' }}>
              {formatBreakdown(bd)}
            </span>
            {piecesPerCarton && (
              <span className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                1 ctn = {piecesPerCarton} pcs
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Value summary cards ─────────────────────────────────── */}
      {entries.length > 0 && (
        <div className="page-content" style={{ paddingTop: 0 }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Current stock values */}
            <div
              className="rounded-xl p-4 border"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">📦</span>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>
                    {t.inventory.currentStock}
                  </h3>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>{t.inventory.activeStockValues}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>{t.inventory.totalPurchaseValue}</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--warning)' }}>
                    {formatCurrency(activePurchaseValue.toFixed(2))}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>{t.inventory.totalSellingValue}</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--success)' }}>
                    {formatCurrency(activeSellingValue.toFixed(2))}
                  </span>
                </div>
              </div>
            </div>

            {/* All-time compound values */}
            <div
              className="rounded-xl p-4 border"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">📊</span>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>
                    {t.inventory.allTime}
                  </h3>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>{t.inventory.allTimeValues}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>{t.inventory.totalPurchaseValue}</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--warning)' }}>
                    {formatCurrency(allTimePurchaseValue.toFixed(2))}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>{t.inventory.totalSellingValue}</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--success)' }}>
                    {formatCurrency(allTimeSellingValue.toFixed(2))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Entries table */}
      <div className="page-content">
        <div className="mb-3 flex items-center gap-2">
          <span className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
            {t.inventory.stockLedger}
          </span>
          <span
            className="text-xs rounded-full px-2 py-0.5"
            style={{ background: 'var(--surface)', color: 'var(--muted)' }}
          >
            {entries.length}
          </span>
        </div>

        {isLoading ? (
          <div className="loading-state">
            <div className="spinner" />
            <span>{t.inventory.loading}</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-4xl mb-3">📦</div>
            <p className="font-semibold" style={{ color: 'var(--foreground)' }}>
              {t.inventory.noEntries}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              {t.inventory.noEntriesSub}
            </p>
          </div>
        ) : (
          <DataTable
            columns={COLUMNS}
            data={entries}
            keyField="id"
            searchPlaceholder=""
            searchFields={[]}
          />
        )}
      </div>
    </div>
  );
}
