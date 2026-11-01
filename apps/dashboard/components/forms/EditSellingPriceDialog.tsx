'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useToast } from '../ui/Toast';
import { getErrorMessage } from '../../lib/utils';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';

interface Target {
  id: string;
  productName: string;
  unitCost: string;
  sellingPrice: string;
  source: string;
}

interface Props {
  entry: Target | null;
  onClose: () => void;
}

export function EditSellingPriceDialog({ entry, onClose }: Props) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const qc = useQueryClient();
  const toast = useToast();
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (entry) {
      setPrice(entry.sellingPrice);
      setCost(entry.unitCost);
      setError('');
    }
  }, [entry]);

  // Own stock (PERSONAL/SUPPLIER) can have its buying price edited; consigned-in
  // stock can only have its resale selling price set (the cost owed is fixed).
  const isOwnStock = entry?.source === 'PERSONAL' || entry?.source === 'SUPPLIER';

  const mutation = useMutation({
    mutationFn: () =>
      inventoryApi.updateEntryPrices(entry!.id, {
        ...(isOwnStock ? { unitCost: parseFloat(cost).toFixed(4) } : {}),
        sellingPrice: parseFloat(price).toFixed(4),
      }),
    onSuccess: () => {
      const product = entry?.productName ?? '';
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      qc.invalidateQueries({ queryKey: QK.inventory() });
      // Selling price feeds the dashboard's total selling value.
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
      toast({ variant: 'success', title: t.toasts.priceUpdated, description: t.toasts.priceUpdatedBody(product) });
    },
    onError: (err) => {
      const message = getErrorMessage(err);
      setError(message);
      toast({ variant: 'error', title: t.toasts.errorTitle, description: message });
    },
  });

  if (!entry) return null;

  const productLabel = entry.productName.charAt(0).toUpperCase() + entry.productName.slice(1);
  const parsedPrice = parseFloat(price);
  const parsedCost = parseFloat(cost);
  const belowCost = parsedPrice > 0 && parsedCost > 0 && parsedPrice <= parsedCost;
  const canSubmit =
    parsedPrice > 0 &&
    (!isOwnStock || parsedCost > 0) &&
    !mutation.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-6 shadow-xl"
        style={{ background: 'var(--card)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
              {t.inventory.editPriceTitle(productLabel)}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              {t.inventory.editPriceSub(formatCurrency(entry.unitCost))}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg"
            style={{ color: 'var(--muted)' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          {isOwnStock && (
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
                {t.inventory.editBuyingLabel}
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="0.00"
                className="input"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
              {t.inventory.editPriceLabel}
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="input"
            />
            {belowCost && (
              <p className="text-xs mt-1" style={{ color: 'var(--warning, #f59e0b)' }}>
                ⚠️ {t.inventory.editBelowCostWarning(formatCurrency(parsedCost.toFixed(4)))}
              </p>
            )}
          </div>

          {error && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="btn btn-secondary flex-1">
              {t.common.cancel}
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={!canSubmit}
              className="btn btn-primary flex-1"
            >
              {mutation.isPending ? t.inventory.editPriceSubmitting : t.inventory.editPriceSubmit}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
