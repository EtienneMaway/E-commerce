'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { formatDate } from '../../../lib/utils';
import { useFormatCurrency } from '../../../lib/currency';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { AddPersonalProductDialog } from '../../../components/forms/AddPersonalProductDialog';
import { ReceiveFromSupplierDialog } from '../../../components/forms/ReceiveFromSupplierDialog';
import { EditSellingPriceDialog } from '../../../components/forms/EditSellingPriceDialog';
import { useT } from '../../../lib/i18n';

type Source = 'ALL' | 'PERSONAL' | 'SUPPLIER' | 'CONSIGNED_OUT' | 'CONSIGNED_IN';

interface Row {
  id: string;
  source: string;
  productName: string;
  unitCost: string;
  sellingPrice: string;
  category: string | null;
  quantityOriginal: number;
  quantityRemaining: number;
  createdAt: string;
}

interface EditPriceTarget {
  id: string;
  productName: string;
  unitCost: string;
  sellingPrice: string;
}

export default function InventoryPage() {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const [filter, setFilter] = useState<Source>('ALL');
  const [addOpen, setAddOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [editPriceTarget, setEditPriceTarget] = useState<EditPriceTarget | null>(null);

  const FILTERS: { label: string; value: Source }[] = [
    { label: t.inventory.filterAll, value: 'ALL' },
    { label: t.inventory.filterPersonal, value: 'PERSONAL' },
    { label: t.inventory.filterSupplier, value: 'SUPPLIER' },
    { label: t.inventory.filterConsigned, value: 'CONSIGNED_OUT' },
    { label: t.inventory.filterConsignedIn, value: 'CONSIGNED_IN' },
  ];

  const COLUMNS: Column<Row>[] = [
    {
      key: 'productName', header: t.inventory.colProduct, sortable: true,
      render: (r) => (
        <span className="font-medium">
          {r.productName.charAt(0).toUpperCase() + r.productName.slice(1)}
        </span>
      ),
    },
    {
      key: 'source', header: t.inventory.colSource,
      render: (r) => {
        if (r.source === 'PERSONAL') return <Badge label={t.inventory.sourcePersonal} variant="personal" />;
        if (r.source === 'SUPPLIER') return <Badge label={t.inventory.sourceSupplier} variant="supplier" />;
        if (r.source === 'CONSIGNED_IN') return <Badge label={t.inventory.sourceConsignedIn} variant="pending" />;
        return <Badge label={t.inventory.sourceConsigned} variant="consigned" />;
      },
    },
    { key: 'category', header: t.inventory.colCategory, render: (r) => <span>{r.category ?? '—'}</span> },
    {
      key: 'unitCost', header: t.inventory.colCost, sortable: true,
      getValue: (r) => parseFloat(r.unitCost),
      render: (r) => formatCurrency(r.unitCost),
    },
    {
      key: 'sellingPrice', header: t.inventory.colSellingPrice, sortable: true,
      getValue: (r) => parseFloat(r.sellingPrice),
      render: (r) => formatCurrency(r.sellingPrice),
    },
    {
      key: 'quantityRemaining', header: t.inventory.colRemaining, sortable: true,
      getValue: (r) => r.quantityRemaining,
      render: (r) => (
        <span style={{ color: r.quantityRemaining <= 5 ? 'var(--danger)' : 'inherit', fontWeight: r.quantityRemaining <= 5 ? 600 : 400 }}>
          {r.quantityRemaining} / {r.quantityOriginal}
          {r.quantityRemaining <= 5 && <span className="ml-1 text-xs">⚠️ {t.inventory.low}</span>}
        </span>
      ),
    },
    { key: 'createdAt', header: t.inventory.colAdded, sortable: true, getValue: (r) => r.createdAt, render: (r) => formatDate(r.createdAt) },
    {
      key: 'actions', header: '',
      render: (r) => r.source === 'CONSIGNED_IN' ? (
        <button
          onClick={() => setEditPriceTarget({ id: r.id, productName: r.productName, unitCost: r.unitCost, sellingPrice: r.sellingPrice })}
          className="btn btn-secondary"
          style={{ fontSize: '12px', padding: '5px 12px' }}
        >
          {t.inventory.editPriceBtn}
        </button>
      ) : null,
    },
  ];

  const { data, isLoading } = useQuery({
    queryKey: QK.inventory(filter === 'ALL' ? undefined : { source: filter }),
    queryFn: () => inventoryApi.list(filter === 'ALL' ? undefined : { source: filter }),
    staleTime: 30_000,
  });

  const rows = (data as Row[] | undefined) ?? [];
  const lowStock = rows.filter((r) => r.quantityRemaining <= 5 && r.source !== 'CONSIGNED_OUT' && r.source !== 'CONSIGNED_IN').length;

  return (
    <div>
      <AddPersonalProductDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <ReceiveFromSupplierDialog open={receiveOpen} onClose={() => setReceiveOpen(false)} />
      <EditSellingPriceDialog entry={editPriceTarget} onClose={() => setEditPriceTarget(null)} />

      <div className="page-header">
        <div className="flex-1 min-w-0">
          <h1 className="page-title">{t.inventory.title}</h1>
          <p className="page-sub">
            {t.inventory.items(rows.length)}
            {lowStock > 0 && <span style={{ color: 'var(--danger)' }}> · {t.inventory.lowStock(lowStock)}</span>}
          </p>
          <div className="flex gap-1.5 mt-3">
            {FILTERS.map((f) => (
              <button key={f.value} onClick={() => setFilter(f.value)} className={`pill${filter === f.value ? ' active' : ''}`}>
                {f.label}
              </button>
            ))}
          </div>
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
          <div className="loading-state"><div className="spinner" /><span>{t.inventory.loading}</span></div>
        ) : (
          <DataTable
            columns={COLUMNS}
            data={rows}
            keyField="id"
            searchPlaceholder={t.inventory.searchPlaceholder}
            searchFields={['productName', 'category']}
          />
        )}
      </div>
    </div>
  );
}
