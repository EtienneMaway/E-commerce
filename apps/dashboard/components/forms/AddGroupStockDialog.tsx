'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { productGroupsApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useToast } from '../ui/Toast';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';

export interface GroupStockTarget {
  id: string;
  name: string;
  variants: Array<{ variantId: string; label: string; piecesPerCarton: number }>;
}

interface Props {
  group: GroupStockTarget | null;
  onClose: () => void;
}

export function AddGroupStockDialog({ group, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [cartons, setCartons] = useState('');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Reset the inputs whenever a different group is opened.
  useEffect(() => {
    setCartons('');
    setQty({});
    setError(null);
  }, [group?.id]);

  // Typing a carton count fills each size = cartons × its pieces-per-carton.
  // Sizes stay individually editable afterwards (e.g. to add loose pieces).
  const applyCartons = (value: string) => {
    setCartons(value);
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n <= 0 || !group) {
      setQty({});
      return;
    }
    const next: Record<string, string> = {};
    for (const v of group.variants) {
      if (v.piecesPerCarton > 0) next[v.variantId] = String(n * v.piecesPerCarton);
    }
    setQty(next);
  };

  const items = Object.entries(qty)
    .map(([variantId, v]) => ({ variantId, quantity: parseInt(v, 10) }))
    .filter((i) => Number.isFinite(i.quantity) && i.quantity > 0);

  const mutation = useMutation({
    mutationFn: () => productGroupsApi.addStock(group!.id, { items }),
    onSuccess: () => {
      const product = group?.name ?? '';
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: QK.productGroups });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
      toast({ variant: 'success', title: t.toasts.stockAdded, description: t.toasts.stockAdjustedBody(product) });
    },
    onError: (err) => {
      const message = getErrorMessage(err);
      setError(message);
      toast({ variant: 'error', title: t.toasts.errorTitle, description: message });
    },
  });

  if (!group) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
    >
      <div
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col"
        style={{ background: 'var(--card)', maxHeight: '90vh' }}
      >
        <div
          className="flex items-center justify-between px-6 py-5 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
            {t.sizedProducts.addStockTitle(
              group.name.charAt(0).toUpperCase() + group.name.slice(1),
            )}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--muted)' }}>
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {t.sizedProducts.addStockSub}
          </p>

          {/* Bulk: add whole cartons — fills each size automatically */}
          <div
            className="rounded-xl border p-3"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                {t.sizedProducts.addByCartonLabel}
              </span>
              <input
                className="input w-28"
                inputMode="numeric"
                placeholder="0"
                value={cartons}
                onChange={(e) => applyCartons(e.target.value)}
              />
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>
              {t.sizedProducts.addByCartonHint}
            </p>
          </div>

          {group.variants.map((v) => (
            <div key={v.variantId} className="flex items-center gap-3">
              <div className="flex-1">
                <span className="text-sm font-medium capitalize" style={{ color: 'var(--foreground)' }}>
                  {v.label}
                </span>
                {v.piecesPerCarton > 0 && (
                  <span className="text-xs ml-1.5" style={{ color: 'var(--muted)' }}>
                    ({v.piecesPerCarton}/carton)
                  </span>
                )}
              </div>
              <input
                className="input w-28"
                inputMode="numeric"
                placeholder="0"
                value={qty[v.variantId] ?? ''}
                onChange={(e) => setQty((prev) => ({ ...prev, [v.variantId]: e.target.value }))}
              />
            </div>
          ))}
          {error && (
            <p className="text-sm" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t flex gap-2" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="btn btn-secondary flex-1">
            {t.common.cancel}
          </button>
          <button
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
            disabled={mutation.isPending || items.length === 0}
            className="btn btn-primary flex-1"
          >
            {mutation.isPending
              ? t.sizedProducts.addStockSubmitting
              : t.sizedProducts.addStockSubmit}
          </button>
        </div>
      </div>
    </div>
  );
}
