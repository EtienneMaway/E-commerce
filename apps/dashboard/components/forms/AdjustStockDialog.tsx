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
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';

interface Target {
  id: string;
  productName: string;
  quantityRemaining: number;
  source: string;
}

interface Props {
  entry: Target | null;
  onClose: () => void;
}

const POSITIVE_MANUAL: ManualStockReason[] = [
  'CUSTOMER_RETURN',
  'RECOUNT_UP',
  'OTHER_IN',
];

const NEGATIVE_MANUAL: ManualStockReason[] = [
  'DAMAGE',
  'LOSS',
  'THEFT',
  'EXPIRY',
  'SUPPLIER_RETURN',
  'INTERNAL_USE',
  'RECOUNT_DOWN',
  'OTHER_OUT',
];

export function AdjustStockDialog({ entry, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();

  const [reason, setReason] = useState<ManualStockReason | ''>('');
  const [qty, setQty] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (entry) {
      setReason('');
      setQty('');
      setNotes('');
      setError('');
    }
  }, [entry]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!entry || !reason) throw new Error('missing input');
      return inventoryApi.adjustStock(entry.id, {
        reason,
        qty: Number(qty),
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      qc.invalidateQueries({ queryKey: QK.inventory() });
      qc.invalidateQueries({ queryKey: ['inventory', 'movements'] });
      qc.invalidateQueries({ queryKey: ['inventory', 'entries'] });
      onClose();
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  if (!entry) return null;

  const isPositive = reason ? POSITIVE_REASONS_SET.has(reason) : false;
  const notesRequired = reason ? NOTES_REQUIRED_REASONS_SET.has(reason) : false;
  const parsedQty = parseInt(qty, 10);

  // Filter SUPPLIER_RETURN out unless source is SUPPLIER
  const allowedNegative = NEGATIVE_MANUAL.filter(
    (r) => r !== 'SUPPLIER_RETURN' || entry.source === 'SUPPLIER',
  );

  const maxQty = isPositive ? Number.MAX_SAFE_INTEGER : entry.quantityRemaining;
  const qtyValid =
    !!qty &&
    Number.isInteger(parsedQty) &&
    parsedQty > 0 &&
    parsedQty <= maxQty;
  const notesValid = !notesRequired || notes.trim().length > 0;
  const canSubmit = !!reason && qtyValid && notesValid && !mutation.isPending;

  const productLabel =
    entry.productName.charAt(0).toUpperCase() + entry.productName.slice(1);

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
          <div>
            <h2
              className="text-base font-bold"
              style={{ color: 'var(--foreground)' }}
            >
              {t.stockMovements.adjustTitle(productLabel)}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              {t.stockMovements.adjustSub(entry.quantityRemaining)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg"
            style={{ color: 'var(--muted)' }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label
              className="block text-xs font-semibold mb-1"
              style={{ color: 'var(--foreground)' }}
            >
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
                {allowedNegative.map((r) => (
                  <option key={r} value={r}>
                    {t.stockMovements.reason[r]}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div>
            <label
              className="block text-xs font-semibold mb-1"
              style={{ color: 'var(--foreground)' }}
            >
              {t.stockMovements.adjustQty}
              {!isPositive && reason && (
                <span
                  className="ml-1 font-normal"
                  style={{ color: 'var(--muted)' }}
                >
                  (max {entry.quantityRemaining})
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
            <label
              className="block text-xs font-semibold mb-1"
              style={{ color: 'var(--foreground)' }}
            >
              {notesRequired
                ? t.stockMovements.adjustNotesRequired
                : t.stockMovements.adjustNotes}
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
              style={{
                background: 'var(--danger-light)',
                color: 'var(--danger)',
              }}
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
              {mutation.isPending
                ? t.stockMovements.adjustSubmitting
                : t.stockMovements.adjustSubmit}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
