'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { productGroupsApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useToast } from '../ui/Toast';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';

export interface GroupPriceTarget {
  id: string;
  name: string;
  cartonSellingPrice: string | null;
  cartonBuyingPrice: string | null;
  variants: { variantId: string; label: string; sellingPrice: string }[];
}

interface Props {
  group: GroupPriceTarget | null;
  onClose: () => void;
}

export function EditGroupPricesDialog({ group, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();

  const [cartonPrice, setCartonPrice] = useState('');
  const [cartonCost, setCartonCost] = useState('');
  const [priceByVariant, setPriceByVariant] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!group) return;
    setCartonPrice(group.cartonSellingPrice ? String(parseFloat(group.cartonSellingPrice)) : '');
    setCartonCost(group.cartonBuyingPrice ? String(parseFloat(group.cartonBuyingPrice)) : '');
    setPriceByVariant(
      Object.fromEntries(group.variants.map((v) => [v.variantId, String(parseFloat(v.sellingPrice))])),
    );
    setError(null);
  }, [group?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cartonNum = parseFloat(cartonPrice);
  const costNum = parseFloat(cartonCost);
  const hasCarton = cartonPrice.trim() !== '' && cartonNum > 0;
  const hasCost = cartonCost.trim() !== '' && costNum > 0;
  const sellBelowBuy = hasCarton && hasCost && cartonNum <= costNum;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!group) return;
      await productGroupsApi.update(group.id, {
        ...(hasCost ? { cartonBuyingPrice: costNum.toFixed(4) } : {}),
        ...(hasCarton ? { cartonSellingPrice: cartonNum.toFixed(4) } : {}),
      });
      await Promise.all(
        group.variants
          .filter((v) => {
            const p = parseFloat(priceByVariant[v.variantId] ?? '');
            return p > 0 && p.toFixed(4) !== parseFloat(v.sellingPrice).toFixed(4);
          })
          .map((v) =>
            productGroupsApi.updateVariant(group.id, v.variantId, {
              sellingPrice: parseFloat(priceByVariant[v.variantId]).toFixed(4),
            }),
          ),
      );
    },
    onSuccess: () => {
      const product = group?.name ?? '';
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: QK.productGroups });
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

  if (!group) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-xl flex flex-col"
        style={{ background: 'var(--card)', maxHeight: '90vh' }}
      >
        <div
          className="flex items-center justify-between px-6 py-5 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="text-lg font-bold capitalize" style={{ color: 'var(--foreground)' }}>
            {t.sizedProducts.editPricesTitle} — {group.name}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--muted)' }}>
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                {t.sizedProducts.cartonBuyingLabel}
              </label>
              <input
                className="input mt-1"
                inputMode="decimal"
                value={cartonCost}
                onChange={(e) => setCartonCost(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                {t.sizedProducts.cartonPriceLabel}
              </label>
              <input
                className="input mt-1"
                inputMode="decimal"
                value={cartonPrice}
                onChange={(e) => setCartonPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          {sellBelowBuy && (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>
              {t.sizedProducts.sellAboveBuyError}
            </p>
          )}

          <div>
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              {t.sizedProducts.perSizePrices}
            </span>
            <div className="mt-2 space-y-2">
              {group.variants.map((v) => (
                <div key={v.variantId} className="flex items-center gap-3">
                  <span className="flex-1 text-sm font-medium capitalize" style={{ color: 'var(--foreground)' }}>
                    {v.label}
                  </span>
                  <input
                    className="input w-28"
                    inputMode="decimal"
                    value={priceByVariant[v.variantId] ?? ''}
                    onChange={(e) =>
                      setPriceByVariant((prev) => ({ ...prev, [v.variantId]: e.target.value }))
                    }
                    placeholder="0.00"
                  />
                </div>
              ))}
            </div>
          </div>

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
              if (sellBelowBuy) {
                setError(t.sizedProducts.sellAboveBuyError);
                return;
              }
              mutation.mutate();
            }}
            disabled={mutation.isPending || sellBelowBuy}
            className="btn btn-primary flex-1"
          >
            {mutation.isPending ? t.sizedProducts.savingPrices : t.sizedProducts.savePrices}
          </button>
        </div>
      </div>
    </div>
  );
}
