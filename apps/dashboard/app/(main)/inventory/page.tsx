'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { breakdownQuantity, formatBreakdown } from '../../../lib/utils';
import { useFormatCurrency } from '../../../lib/currency';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { AddPersonalProductDialog } from '../../../components/forms/AddPersonalProductDialog';
import { ReceiveFromSupplierDialog } from '../../../components/forms/ReceiveFromSupplierDialog';
import { useT } from '../../../lib/i18n';
import { useState } from 'react';

interface Row {
  productName: string;
  category: string | null;
  piecesPerCarton: number | null;
  totalAvailable: number;
  sourceBreakdown: {
    personal: number;
    supplier: number;
    consignedIn: number;
    consignedOut: number;
  };
  latestSellingPrice: string;
  latestUnitCost: string;
}

export default function InventoryPage() {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const [addOpen, setAddOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const COLUMNS: Column<Row>[] = [
    {
      key: 'productName',
      header: t.inventory.colProduct,
      sortable: true,
      render: (r) => (
        <Link
          href={`/inventory/${encodeURIComponent(r.productName)}`}
          className="font-semibold hover:text-primary transition-colors"
          style={{ color: 'var(--foreground)' }}
        >
          {r.productName.charAt(0).toUpperCase() + r.productName.slice(1)}
        </Link>
      ),
    },
    {
      key: 'category',
      header: t.inventory.colCategory,
      render: (r) => <span style={{ color: 'var(--muted)' }}>{r.category ?? '—'}</span>,
    },
    {
      key: 'totalAvailable',
      header: t.inventory.colAvailable,
      sortable: true,
      getValue: (r) => r.totalAvailable,
      render: (r) => {
        const bd = breakdownQuantity(r.totalAvailable, r.piecesPerCarton);
        const isLow = r.totalAvailable > 0 && r.totalAvailable <= 5;
        const isOut = r.totalAvailable === 0;
        return (
          <div>
            <span
              style={{
                fontWeight: isLow ? 600 : 400,
                color: isOut
                  ? 'var(--muted)'
                  : isLow
                  ? 'var(--danger)'
                  : 'inherit',
              }}
            >
              {formatBreakdown(bd)}
              {isLow && <span className="ml-1 text-xs">⚠️ {t.inventory.low}</span>}
            </span>
            <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              {r.totalAvailable} pcs
              {r.piecesPerCarton ? ` · 1 ctn = ${r.piecesPerCarton} pcs` : ''}
            </div>
          </div>
        );
      },
    },
    {
      key: 'sourceBreakdown',
      header: t.inventory.colSources,
      render: (r) => (
        <div className="flex gap-1 flex-wrap">
          {r.sourceBreakdown.personal > 0 && (
            <span className="text-xs rounded px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              P: {r.sourceBreakdown.personal}
            </span>
          )}
          {r.sourceBreakdown.supplier > 0 && (
            <span className="text-xs rounded px-1.5 py-0.5 bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
              S: {r.sourceBreakdown.supplier}
            </span>
          )}
          {r.sourceBreakdown.consignedIn > 0 && (
            <span className="text-xs rounded px-1.5 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
              IN: {r.sourceBreakdown.consignedIn}
            </span>
          )}
          {r.sourceBreakdown.consignedOut > 0 && (
            <span className="text-xs rounded px-1.5 py-0.5" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
              OUT: {r.sourceBreakdown.consignedOut}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'latestUnitCost',
      header: t.inventory.colCost,
      sortable: true,
      getValue: (r) => parseFloat(r.latestUnitCost),
      render: (r) => formatCurrency(r.latestUnitCost),
    },
    {
      key: 'latestSellingPrice',
      header: t.inventory.colSellingPrice,
      sortable: true,
      getValue: (r) => parseFloat(r.latestSellingPrice),
      render: (r) => formatCurrency(r.latestSellingPrice),
    },
  ];

  const { data, isLoading } = useQuery({
    queryKey: QK.inventoryProducts,
    queryFn: () => inventoryApi.listProducts(),
    staleTime: 30_000,
  });

  const rows = (data as Row[] | undefined) ?? [];
  const lowStock = rows.filter((r) => r.totalAvailable > 0 && r.totalAvailable <= 5).length;

  return (
    <div>
      <AddPersonalProductDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <ReceiveFromSupplierDialog open={receiveOpen} onClose={() => setReceiveOpen(false)} />

      <div className="page-header">
        <div className="flex-1 min-w-0">
          <h1 className="page-title">{t.inventory.title}</h1>
          <p className="page-sub">
            {t.inventory.items(rows.length)}
            {lowStock > 0 && (
              <span style={{ color: 'var(--danger)' }}> · {t.inventory.lowStock(lowStock)}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => setAddOpen(true)} className="btn btn-primary">
            {t.inventory.addProduct}
          </button>
          <button onClick={() => setReceiveOpen(true)} className="btn btn-secondary">
            {t.inventory.receiveFromSupplier}
          </button>
        </div>
      </div>

      <div className="page-content">
        {isLoading ? (
          <div className="loading-state">
            <div className="spinner" />
            <span>{t.inventory.loading}</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-4xl mb-3">📦</div>
            <p className="font-semibold" style={{ color: 'var(--foreground)' }}>
              {t.inventory.noProducts}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              {t.inventory.noProductsSub}
            </p>
          </div>
        ) : (
          <DataTable
            columns={COLUMNS}
            data={rows}
            keyField="productName"
            searchPlaceholder={t.inventory.searchPlaceholder}
            searchFields={['productName', 'category']}
          />
        )}
      </div>
    </div>
  );
}
