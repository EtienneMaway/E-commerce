'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { getErrorMessage } from '../../lib/utils';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';

interface EditableEntry {
  id: string;
  unitCost: string;
  sellingPrice: string;
  source: string;
  piecesPerCarton: number | null;
  createdAt: string;
}

interface Props {
  open: boolean;
  productName: string;
  entries: EditableEntry[];
  onClose: () => void;
}

type Mode = 'unit' | 'carton';

export function EditProductSellingPriceDialog({
  open,
  productName,
  entries,
  onClose,
}: Props) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const qc = useQueryClient();

  // Editable = owned active (PERSONAL or SUPPLIER), excludes CONSIGNED_IN/OUT
  const editable = useMemo(
    () =>
      entries.filter(
        (e) => e.source === 'PERSONAL' || e.source === 'SUPPLIER',
      ),
    [entries],
  );

  // Current values: take the most recent entry
  const latest = useMemo(() => {
    if (editable.length === 0) return null;
    return [...editable].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
  }, [editable]);

  const piecesPerCarton = useMemo(() => {
    return editable.find((e) => e.piecesPerCarton !== null)?.piecesPerCarton ?? null;
  }, [editable]);

  // Detect mixed prices across lots
  const mixed = useMemo(() => {
    if (editable.length < 2) return false;
    const first = editable[0].sellingPrice;
    return editable.some((e) => e.sellingPrice !== first);
  }, [editable]);

  const [mode, setMode] = useState<Mode>('unit');
  const [unitPrice, setUnitPrice] = useState('');
  const [cartonPrice, setCartonPrice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && latest) {
      setUnitPrice(latest.sellingPrice);
      if (piecesPerCarton) {
        setCartonPrice((parseFloat(latest.sellingPrice) * piecesPerCarton).toFixed(2));
      } else {
        setCartonPrice('');
      }
      setMode('unit');
      setError('');
    }
  }, [open, latest, piecesPerCarton]);

  // Sync the two inputs when piecesPerCarton known
  function onUnitChange(v: string) {
    setUnitPrice(v);
    const n = parseFloat(v);
    if (piecesPerCarton && !isNaN(n)) {
      setCartonPrice((n * piecesPerCarton).toFixed(2));
    }
  }
  function onCartonChange(v: string) {
    setCartonPrice(v);
    const n = parseFloat(v);
    if (piecesPerCarton && !isNaN(n)) {
      setUnitPrice((n / piecesPerCarton).toFixed(2));
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const finalUnit = parseFloat(unitPrice);
      if (!finalUnit || finalUnit <= 0) throw new Error('Invalid price');
      // Update each editable lot in parallel
      await Promise.all(
        editable.map((e) => inventoryApi.updateSellingPrice(e.id, finalUnit.toFixed(2))),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      qc.invalidateQueries({ queryKey: QK.inventory() });
      onClose();
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  if (!open) return null;

  const productLabel = productName.charAt(0).toUpperCase() + productName.slice(1);
  const parsedUnit = parseFloat(unitPrice);
  const minCost = editable.length > 0
    ? Math.min(...editable.map((e) => parseFloat(e.unitCost)))
    : 0;
  const belowCost = parsedUnit > 0 && parsedUnit <= minCost;

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
            <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
              {t.inventory.bulkSellingTitle(productLabel)}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              {t.inventory.bulkSellingSub}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--muted)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {editable.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {t.inventory.bulkSellingNoEditable}
          </p>
        ) : (
          <div className="space-y-3">
            {/* Current price hint */}
            {latest && (
              <div
                className="rounded-lg p-3 border space-y-1.5"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--muted)' }}>
                    {t.inventory.bulkSellingCurrentUnit}
                  </span>
                  <span className="font-semibold tabular-nums" style={{ color: 'var(--foreground)' }}>
                    {formatCurrency(latest.sellingPrice)}
                  </span>
                </div>
                {piecesPerCarton && (
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--muted)' }}>
                      {t.inventory.bulkSellingCurrentCarton}
                    </span>
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--foreground)' }}>
                      {formatCurrency((parseFloat(latest.sellingPrice) * piecesPerCarton).toFixed(2))}
                    </span>
                  </div>
                )}
                {mixed && (
                  <p className="text-[11px] mt-1" style={{ color: 'var(--warning)' }}>
                    ⚠️ {t.inventory.bulkSellingMixedNote}
                  </p>
                )}
              </div>
            )}

            {/* Mode toggle */}
            {piecesPerCarton && (
              <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                {(['unit', 'carton'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className="flex-1 px-3 py-1.5 text-xs font-semibold transition-colors"
                    style={{
                      background: mode === m ? 'var(--primary)' : 'var(--surface)',
                      color: mode === m ? '#fff' : 'var(--foreground)',
                    }}
                  >
                    {m === 'unit' ? t.inventory.bulkSellingUnitLabel : t.inventory.bulkSellingCartonLabel}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
                {mode === 'unit' ? t.inventory.bulkSellingUnitLabel : t.inventory.bulkSellingCartonLabel}
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={mode === 'unit' ? unitPrice : cartonPrice}
                onChange={(e) =>
                  mode === 'unit' ? onUnitChange(e.target.value) : onCartonChange(e.target.value)
                }
                placeholder="0.00"
                className="input"
              />
              {belowCost && (
                <p className="text-xs mt-1" style={{ color: 'var(--warning)' }}>
                  ⚠️ {formatCurrency(parsedUnit.toFixed(2))} ≤ cost ({formatCurrency(minCost.toFixed(2))})
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
                disabled={!parsedUnit || parsedUnit <= 0 || mutation.isPending}
                className="btn btn-primary flex-1"
              >
                {mutation.isPending ? t.inventory.bulkSellingSubmitting : t.inventory.bulkSellingSubmit}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
