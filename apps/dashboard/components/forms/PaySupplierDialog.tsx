'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { paymentsApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { getErrorMessage } from '../../lib/utils';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';

interface Supplier {
  id: string;
  username: string;
  outstanding: string;
}

interface Props {
  supplier: Supplier | null;
  onClose: () => void;
}

export function PaySupplierDialog({ supplier, onClose }: Props) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  // Reset form whenever the dialog opens for a new supplier
  useEffect(() => {
    if (supplier) { setAmount(''); setNote(''); setError(''); }
  }, [supplier]);

  const mutation = useMutation({
    mutationFn: () =>
      paymentsApi.paySupplier({
        supplierUserId: supplier!.id,
        amount,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.suppliers });
      qc.invalidateQueries({ queryKey: QK.supplierDetail(supplier!.id) });
      onClose();
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  if (!supplier) return null;

  const outstanding = parseFloat(supplier.outstanding);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-6 shadow-xl overflow-y-auto"
        style={{ background: 'var(--card)', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
              {t.suppliers.payTitle(supplier.username)}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: outstanding > 0 ? 'var(--danger)' : 'var(--muted)' }}>
              {t.suppliers.paySub(formatCurrency(supplier.outstanding))}
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

        {/* Amount */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
              {t.suppliers.payAmount}
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={outstanding > 0 ? outstanding.toFixed(2) : '0.00'}
              className="input"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
              {t.suppliers.payNote}
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.suppliers.payNotePlaceholder}
              className="input"
            />
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
              disabled={!amount || parseFloat(amount) <= 0 || mutation.isPending}
              className="btn btn-primary flex-1"
            >
              {mutation.isPending ? t.suppliers.paying : t.suppliers.paySubmit}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
