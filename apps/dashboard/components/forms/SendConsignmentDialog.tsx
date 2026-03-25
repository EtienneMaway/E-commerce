'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { consignmentsApi, inventoryApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { getErrorMessage } from '../../lib/utils';
import { UserSearchInput } from '../ui/UserSearchInput';
import { useT } from '../../lib/i18n';

interface UserOption {
  id: string;
  username: string;
}

interface ProductSummary {
  productName: string;
  latestUnitCost: string;
  totalAvailable: number;
}

interface ItemRow {
  productName: string;
  quantity: string;
  agreedUnitPrice: string;
  priceMode: 'manual' | 'pct';
  unitCost: string;
  markupPct: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const EMPTY_ITEM: ItemRow = {
  productName: '',
  quantity: '',
  agreedUnitPrice: '',
  priceMode: 'manual',
  unitCost: '',
  markupPct: 25,
};

export function SendConsignmentDialog({ open, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [debtor, setDebtor] = useState<UserOption | null>(null);
  const [note, setNote] = useState('');
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);
  const [error, setError] = useState('');
  const [focusedItemIndex, setFocusedItemIndex] = useState<number | null>(null);

  const { data: products } = useQuery({
    queryKey: QK.inventoryProducts,
    queryFn: inventoryApi.listProducts,
    staleTime: 60_000,
    enabled: open,
  });

  const getFilteredProducts = (query: string): ProductSummary[] =>
    (products as ProductSummary[] | undefined)?.filter((p) =>
      p.productName.includes(query.toLowerCase().trim())
    ) ?? [];

  const selectProduct = (i: number, p: ProductSummary) => {
    setItems((prev) =>
      prev.map((row, idx) => {
        if (idx !== i) return row;
        const unitCost = p.latestUnitCost;
        const agreedUnitPrice =
          row.priceMode === 'pct' && parseFloat(unitCost) > 0
            ? (parseFloat(unitCost) * (1 + row.markupPct / 100)).toFixed(2)
            : row.agreedUnitPrice;
        return { ...row, productName: p.productName, unitCost, agreedUnitPrice };
      })
    );
    setFocusedItemIndex(null);
  };

  const setProductName = (i: number, value: string) => {
    setItems((prev) =>
      prev.map((row, idx) => (idx === i ? { ...row, productName: value } : row))
    );
  };

  const setStringField =
    (i: number, k: keyof Pick<ItemRow, 'quantity' | 'agreedUnitPrice'>) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setItems((prev) => prev.map((row, idx) => (idx === i ? { ...row, [k]: e.target.value } : row)));

  const handleUnitCostChange = (i: number, value: string) => {
    setItems((prev) =>
      prev.map((row, idx) => {
        if (idx !== i) return row;
        const cost = parseFloat(value);
        const agreedUnitPrice =
          row.priceMode === 'pct' && !isNaN(cost) && cost > 0
            ? (cost * (1 + row.markupPct / 100)).toFixed(2)
            : row.agreedUnitPrice;
        return { ...row, unitCost: value, agreedUnitPrice };
      })
    );
  };

  const setMode = (i: number, mode: 'manual' | 'pct') =>
    setItems((prev) =>
      prev.map((row, idx) => {
        if (idx !== i) return row;
        const cost = parseFloat(row.unitCost);
        const agreedUnitPrice =
          mode === 'pct' && !isNaN(cost) && cost > 0
            ? (cost * (1 + row.markupPct / 100)).toFixed(2)
            : row.agreedUnitPrice;
        return { ...row, priceMode: mode, agreedUnitPrice };
      })
    );

  const handleMarkupChange = (i: number, pct: number) =>
    setItems((prev) =>
      prev.map((row, idx) => {
        if (idx !== i) return row;
        const cost = parseFloat(row.unitCost);
        const agreedUnitPrice =
          !isNaN(cost) && cost > 0
            ? (cost * (1 + pct / 100)).toFixed(2)
            : row.agreedUnitPrice;
        return { ...row, markupPct: pct, agreedUnitPrice };
      })
    );

  const addItem = () => setItems((prev) => [...prev, { ...EMPTY_ITEM }]);

  const removeItem = (i: number) =>
    setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const mutation = useMutation({
    mutationFn: () =>
      consignmentsApi.create({
        debtorUserId: debtor!.id,
        ...(note.trim() ? { note: note.trim() } : {}),
        items: items.map((it) => ({
          productName: it.productName.trim(),
          quantity: Number(it.quantity),
          agreedUnitPrice: it.agreedUnitPrice,
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.consignmentsOutgoing });
      setDebtor(null);
      setNote('');
      setItems([{ ...EMPTY_ITEM }]);
      setError('');
      onClose();
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const canSubmit =
    debtor &&
    items.length > 0 &&
    items.every(
      (it) =>
        it.productName.trim() &&
        it.quantity &&
        it.agreedUnitPrice &&
        parseFloat(it.agreedUnitPrice) > 0
    );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="w-full max-w-lg rounded-2xl p-6 shadow-xl overflow-y-auto" style={{ background: 'var(--card)', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>{t.sendConsignment.title}</h2>
          <button onClick={onClose} style={{ color: 'var(--muted)' }}>✕</button>
        </div>

        <div className="space-y-4">
          <UserSearchInput label={t.sendConsignment.debtor} value={debtor} onChange={setDebtor} placeholder={t.userSearch.placeholder} />

          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{t.sendConsignment.note}</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.sendConsignment.notePlaceholder}
              className="input"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{t.sendConsignment.items}</label>
              <button type="button" onClick={addItem} className="text-xs font-medium" style={{ color: 'var(--primary)' }}>
                {t.sendConsignment.addItem}
              </button>
            </div>
            <div className="space-y-3">
              {items.map((item, i) => {
                const suggestions = getFilteredProducts(item.productName);
                const showDrop = focusedItemIndex === i && item.productName.trim().length > 0 && suggestions.length > 0;
                return (
                  <div key={i} className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                    {/* Row 1: product autocomplete, qty, remove */}
                    <div className="flex gap-2 items-start mb-2">
                      <div style={{ flex: 2 }}>
                        <input
                          value={item.productName}
                          onChange={(e) => { setProductName(i, e.target.value); setFocusedItemIndex(i); }}
                          onFocus={() => setFocusedItemIndex(i)}
                          onBlur={() => setTimeout(() => setFocusedItemIndex(null), 150)}
                          placeholder={t.sendConsignment.productNamePlaceholder}
                          className="input w-full"
                        />
                        {showDrop && (
                          <div
                            className="rounded-xl border mt-1 overflow-hidden"
                            style={{ borderColor: 'var(--border)', background: 'var(--card)', maxHeight: '180px', overflowY: 'auto' }}
                          >
                            {suggestions.map((p) => (
                              <div
                                key={p.productName}
                                onMouseDown={(e) => { e.preventDefault(); selectProduct(i, p); }}
                                className="px-3 py-2 cursor-pointer border-b last:border-b-0"
                                style={{ borderColor: 'var(--border)' }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--card)')}
                              >
                                <div className="text-sm font-medium capitalize" style={{ color: 'var(--foreground)' }}>
                                  {p.productName}
                                </div>
                                <div className="text-xs" style={{ color: 'var(--muted)' }}>
                                  ${p.latestUnitCost} cost · {p.totalAvailable} {t.sendConsignment.inStock}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <input
                        value={item.quantity}
                        onChange={setStringField(i, 'quantity')}
                        placeholder={t.sendConsignment.qtyPlaceholder}
                        type="number"
                        min="1"
                        className="input"
                        style={{ flex: 1 }}
                      />
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(i)}
                          className="px-2 py-2 rounded-xl text-sm flex-shrink-0"
                          style={{ color: 'var(--danger)' }}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Mode toggle */}
                    <div className="flex gap-1 mb-2">
                      <button
                        type="button"
                        onClick={() => setMode(i, 'manual')}
                        className="text-xs px-3 py-1 rounded-full font-medium transition-colors"
                        style={{
                          background: item.priceMode === 'manual' ? 'var(--primary)' : 'var(--card)',
                          color: item.priceMode === 'manual' ? '#fff' : 'var(--muted)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {t.sendConsignment.manual}
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode(i, 'pct')}
                        className="text-xs px-3 py-1 rounded-full font-medium transition-colors"
                        style={{
                          background: item.priceMode === 'pct' ? 'var(--primary)' : 'var(--card)',
                          color: item.priceMode === 'pct' ? '#fff' : 'var(--muted)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {t.sendConsignment.pctMarkup}
                      </button>
                    </div>

                    {/* Manual mode */}
                    {item.priceMode === 'manual' && (
                      <input
                        value={item.agreedUnitPrice}
                        onChange={setStringField(i, 'agreedUnitPrice')}
                        placeholder={t.sendConsignment.pricePlaceholder}
                        type="number"
                        min="0"
                        step="0.01"
                        className="input w-full"
                      />
                    )}

                    {/* Pct markup mode */}
                    {item.priceMode === 'pct' && (
                      <div className="space-y-2">
                        <input
                          value={item.unitCost}
                          onChange={(e) => handleUnitCostChange(i, e.target.value)}
                          placeholder={t.sendConsignment.unitCost}
                          type="number"
                          min="0"
                          step="0.01"
                          className="input w-full"
                        />
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs" style={{ color: 'var(--muted)' }}>{t.sendConsignment.markup}</span>
                            <span className="text-xs font-bold" style={{ color: 'var(--primary)' }}>{item.markupPct}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={item.markupPct}
                            onChange={(e) => handleMarkupChange(i, parseInt(e.target.value, 10))}
                            className="w-full"
                            style={{ accentColor: 'var(--primary)' }}
                          />
                          <div className="flex justify-between text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                            <span>0%</span>
                            <span>100%</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>
                            {t.sendConsignment.sellingPrice}
                          </label>
                          <input
                            value={item.agreedUnitPrice}
                            onChange={setStringField(i, 'agreedUnitPrice')}
                            placeholder={t.sendConsignment.pricePlaceholder}
                            type="number"
                            min="0"
                            step="0.01"
                            className="input w-full"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn btn-secondary flex-1">{t.common.cancel}</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !canSubmit}
            className="btn btn-primary flex-1"
          >
            {mutation.isPending ? t.sendConsignment.submitting : t.sendConsignment.submit}
          </button>
        </div>
      </div>
    </div>
  );
}
