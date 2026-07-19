'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useToast } from '../ui/Toast';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';

interface Props {
  open: boolean;
  currentName: string;
  onClose: () => void;
  onRenamed: (newName: string) => void;
}

export function RenameProductDialog({ open, currentName, onClose, onRenamed }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setValue(currentName);
      setError('');
    }
  }, [open, currentName]);

  const mutation = useMutation({
    mutationFn: (newName: string) => inventoryApi.renameProduct(currentName, newName),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      // A rename cascades across inventory, sales, external transactions and
      // pricing, so anything keyed on the old name is now stale.
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      const total =
        result.entriesUpdated + result.salesUpdated + result.externalTxUpdated + result.pricingUpdated;
      setError('');
      onRenamed(result.newName);
      // This total used to be computed and then thrown away (`void total`) with
      // a comment claiming the parent surfaced it — nothing did. It is the most
      // reassuring thing we can show after a cascading rename, so show it.
      toast({
        variant: 'success',
        title: t.toasts.productRenamed,
        description: t.toasts.productRenamedBody(result.newName, total),
      });
    },
    onError: (err) => {
      const message = getErrorMessage(err);
      setError(message);
      toast({ variant: 'error', title: t.toasts.errorTitle, description: message });
    },
  });

  if (!open) return null;

  const trimmed = value.trim();
  const normalised = trimmed.toLowerCase();
  const sameAsCurrent = normalised === currentName.trim().toLowerCase();
  const canSubmit = trimmed.length >= 2 && !sameAsCurrent && !mutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="w-full max-w-md rounded-2xl p-6 shadow-xl" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
            {t.inventory.renameDialogTitle}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--muted)' }}>✕</button>
        </div>

        <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--muted)' }}>
          {t.inventory.renameDialogBody}
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              {t.inventory.renameNewNameLabel}
            </label>
            <input
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(''); }}
              placeholder={t.inventory.renameNewNamePlaceholder}
              className="input"
              autoFocus
            />
            {sameAsCurrent && trimmed.length > 0 && (
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                {t.inventory.renameSameName}
              </p>
            )}
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn btn-secondary flex-1">
            {t.common.cancel}
          </button>
          <button
            onClick={() => mutation.mutate(trimmed)}
            disabled={!canSubmit}
            className="btn btn-primary flex-1"
          >
            {mutation.isPending ? t.inventory.renameSubmitting : t.inventory.renameSubmit}
          </button>
        </div>
      </div>
    </div>
  );
}
