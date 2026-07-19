'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  inventoryApi,
  POSITIVE_REASONS_SET,
  NOTES_REQUIRED_REASONS_SET,
  type ManualStockReason,
} from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useToast } from '../ui/Toast';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';

export interface GroupAdjustTarget {
  id: string;
  name: string;
  variants: { variantId: string; label: string; available: number }[];
}

interface Props {
  group: GroupAdjustTarget | null;
  onClose: () => void;
}

// SUPPLIER_RETURN is excluded — composite stock lives in the owner's personal lots.
const POSITIVE_MANUAL: ManualStockReason[] = ['CUSTOMER_RETURN', 'RECOUNT_UP', 'OTHER_IN'];
const NEGATIVE_MANUAL: ManualStockReason[] = [
  'DAMAGE',
  'LOSS',
  'THEFT',
  'EXPIRY',
  'INTERNAL_USE',
  'RECOUNT_DOWN',
  'OTHER_OUT',
];

export function AdjustGroupStockDialog({ group, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();

  const [variantId, setVariantId] = useState('');
  const [reason, setReason] = useState<ManualStockReason | ''>('');
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!group) return;
    setVariantId(group.variants[0]?.variantId ?? '');
    setReason('');
    setQty('');
    setNotes('');
    setError('');
  }, [group?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutation = useMutation({
    mutationFn: () => {
      if (!reason || !variantId) throw new Error('missing input');
      return inventoryApi.adjustVariantStock(variantId, {
        reason,
        qty: Number(qty),
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      const product = group?.name ?? '';
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      qc.invalidateQueries({ queryKey: QK.inventory() });
      qc.invalidateQueries({ queryKey: QK.productGroups });
      qc.invalidateQueries({ queryKey: ['inventory', 'movements'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
      toast({ variant: 'success', title: t.toasts.stockAdjusted, description: t.toasts.stockAdjustedBody(product) });
    },
    onError: (err) => {
      const message = getErrorMessage(err);
      setError(message);
      toast({ variant: 'error', title: t.toasts.errorTitle, description: message });
    },
  });

  if (!group) return null;

  const selected = group.variants.find((v) => v.variantId === variantId) ?? null;
  const isPositive = reason ? POSITIVE_REASONS_SET.has(reason) : false;
  const notesRequired = reason ? NOTES_REQUIRED_REASONS_SET.has(reason) : false;
  const parsedQty = parseInt(qty, 10);
  const maxQty = isPositive ? Number.MAX_SAFE_INTEGER : selected?.available ?? 0;
  const qtyValid = !!qty && Number.isInteger(parsedQty) && parsedQty > 0 && parsedQty <= maxQty;
  const canSubmit =
    !!variantId && !!reason && qtyValid && (!notesRequired || notes.trim().length > 0) && !mutation.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 shadow-xl"
        style={{ background: 'var(--card)' }}
      >
        <div className="flex items-start justify-between mb-5">
          <h2 className="text-base font-bold capitalize" style={{ color: 'var(--foreground)' }}>
            {t.stockMovements.adjustTitle(group.name)}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--muted)' }}>
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {/* Size picker */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
              {t.sizedProducts.colSize}
            </label>
            <select
              value={variantId}
              onChange={(e) => {
                setVariantId(e.target.value);
                setQty('');
              }}
              className="input"
            >
              {group.variants.map((v) => (
                <option key={v.variantId} value={v.variantId}>
                  {v.label} ({v.available} pcs)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
              {t.stockMovements.adjustReason}
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as ManualStockReason | '')}
              className="input"
            >
              <option value="">{t.stockMovements.adjustReasonPlaceholder}</option>
              <optgroup label={t.stockMovements.adjustGroupIn}>
                {POSITIVE_MANUAL.map((r) => (
                  <option key={r} value={r}>
                    {t.stockMovements.reason[r]}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t.stockMovements.adjustGroupOut}>
                {NEGATIVE_MANUAL.map((r) => (
                  <option key={r} value={r}>
                    {t.stockMovements.reason[r]}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
              {t.stockMovements.adjustQty}
              {!isPositive && reason && selected && (
                <span className="ml-1 font-normal" style={{ color: 'var(--muted)' }}>
                  (max {selected.available})
                </span>
              )}
            </label>
            <input
              type="number"
              min={1}
              max={maxQty === Number.MAX_SAFE_INTEGER ? undefined : maxQty}
              step={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              className="input"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
              {notesRequired ? t.stockMovements.adjustNotesRequired : t.stockMovements.adjustNotes}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={500}
              className="input"
              style={{ resize: 'vertical' }}
            />
          </div>

          {error && (
            <p
              className="text-xs rounded-lg px-3 py-2"
              style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}
            >
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
              {mutation.isPending ? t.stockMovements.adjustSubmitting : t.stockMovements.adjustSubmit}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
