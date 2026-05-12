'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ProductPrice, pricingApi } from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { formatDate, getErrorMessage } from '../../../lib/utils';
import { useFormatCurrency } from '../../../lib/currency';
import { useOwnerOnlyPage } from '../../../hooks/use-owner-only';
import { useConfirm } from '../../../components/ui/ConfirmDialog';

export default function PricingPage() {
  const qc = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const isOwner = useOwnerOnlyPage();
  const [productName, setProductName] = useState('');
  const [unitPrice, setUnitPrice] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: QK.pricing,
    queryFn: () => pricingApi.list(),
    staleTime: 30_000,
    enabled: isOwner,
  });

  const upsert = useMutation({
    mutationFn: () => pricingApi.upsert({ productName, unitPrice }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.pricing });
      setProductName('');
      setUnitPrice('');
    },
  });

  if (!isOwner) return null;

  const list = (data as ProductPrice[] | undefined) ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Pricing</h1>
        <p className="text-sm opacity-70 mt-1">
          Set the standard unit price per product. Employees who try to sell below it must
          provide a discount reason; sales above are silently capped to the standard.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (productName && unitPrice) upsert.mutate();
        }}
        className="flex gap-2 flex-wrap items-end mb-4 p-4 rounded-xl border"
        style={{ borderColor: 'rgba(127,127,127,0.15)', background: 'var(--card)' }}
      >
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium mb-1 opacity-80">Product name</label>
          <input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className="w-full px-3 py-2 rounded-md border bg-transparent"
            style={{ borderColor: 'rgba(127,127,127,0.3)' }}
            placeholder="Rice 50kg"
          />
        </div>
        <div className="w-32">
          <label className="block text-xs font-medium mb-1 opacity-80">Unit price (USD)</label>
          <input
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            inputMode="decimal"
            className="w-full px-3 py-2 rounded-md border bg-transparent"
            style={{ borderColor: 'rgba(127,127,127,0.3)' }}
            placeholder="30.00"
          />
        </div>
        <button
          type="submit"
          disabled={!productName || !unitPrice || upsert.isPending}
          className="px-4 py-2 rounded-md text-sm text-white font-medium disabled:opacity-50"
          style={{ background: '#6366F1' }}
        >
          {upsert.isPending ? 'Saving…' : 'Save'}
        </button>
      </form>

      {!!upsert.error && (
        <div className="text-xs mb-3" style={{ color: '#EF4444' }}>{getErrorMessage(upsert.error)}</div>
      )}

      {isLoading ? (
        <div className="text-sm opacity-60 p-8 text-center">Loading…</div>
      ) : list.length === 0 ? (
        <div className="text-sm opacity-60 p-8 text-center">No standard prices set yet.</div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(127,127,127,0.15)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'rgba(127,127,127,0.08)' }}>
              <tr>
                <th className="text-left px-4 py-2 font-medium">Product</th>
                <th className="text-right px-4 py-2 font-medium">Unit price</th>
                <th className="text-left px-4 py-2 font-medium">Updated</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <PricingRow key={row.id} row={row} qc={qc} formatCurrency={formatCurrency} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PricingRow({
  row,
  qc,
  formatCurrency,
}: {
  row: ProductPrice;
  qc: ReturnType<typeof useQueryClient>;
  formatCurrency: (v: string | number) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.unitPrice);
  const confirm = useConfirm();

  const update = useMutation({
    mutationFn: () => pricingApi.update(row.id, draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.pricing });
      setEditing(false);
    },
  });

  const del = useMutation({
    mutationFn: () => pricingApi.delete(row.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.pricing }),
  });

  return (
    <tr className="border-t" style={{ borderColor: 'rgba(127,127,127,0.1)' }}>
      <td className="px-4 py-2 capitalize">{row.productName}</td>
      <td className="px-4 py-2 text-right">
        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            inputMode="decimal"
            className="w-24 px-2 py-1 rounded-md border text-right bg-transparent"
            style={{ borderColor: 'rgba(127,127,127,0.3)' }}
          />
        ) : (
          formatCurrency(row.unitPrice)
        )}
      </td>
      <td className="px-4 py-2 opacity-70">{formatDate(row.updatedAt)}</td>
      <td className="px-4 py-2 text-right">
        {editing ? (
          <div className="flex gap-1 justify-end">
            <button
              onClick={() => update.mutate()}
              disabled={update.isPending}
              className="px-2 py-1 rounded-md text-xs text-white disabled:opacity-50"
              style={{ background: '#6366F1' }}
            >
              Save
            </button>
            <button
              onClick={() => { setEditing(false); setDraft(row.unitPrice); }}
              className="px-2 py-1 rounded-md text-xs"
              style={{ border: '1px solid rgba(127,127,127,0.3)' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-1 justify-end">
            <button
              onClick={() => setEditing(true)}
              className="px-2 py-1 rounded-md text-xs"
              style={{ border: '1px solid rgba(127,127,127,0.3)' }}
            >
              Edit
            </button>
            <button
              onClick={async () => {
                const ok = await confirm({
                  title: `Delete standard price?`,
                  description: `The standard unit price for "${row.productName}" will be removed.`,
                  confirmLabel: 'Delete',
                  variant: 'danger',
                });
                if (ok) del.mutate();
              }}
              disabled={del.isPending}
              className="px-2 py-1 rounded-md text-xs disabled:opacity-50"
              style={{ border: '1px solid rgba(239,68,68,0.4)', color: '#EF4444' }}
            >
              Delete
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
