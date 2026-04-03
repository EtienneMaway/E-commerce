'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { consignmentsApi, inventoryApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { getErrorMessage } from '../../lib/utils';
import { UserSearchInput } from '../ui/UserSearchInput';
import { useT } from '../../lib/i18n';
import { useFormatCurrency } from '../../lib/currency';

interface UserOption {
  id: string;
  username: string;
}

interface ProductSummary {
  productName: string;
  latestUnitCost: string;
  latestSellingPrice: string;
  latestCartonPrice: string | null;
  piecesPerCarton: number | null;
  totalAvailable: number;
}

interface ItemRow {
  productName: string;
  quantity: string;
  agreedUnitPrice: string;
  priceMode: 'manual' | 'pct';
  unitCost: string;
  markupPct: number;
  piecesPerCarton: number | null;
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
  piecesPerCarton: null,
};

export function SendConsignmentDialog({ open, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const formatCurrency = useFormatCurrency();
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
            : p.latestSellingPrice;
        return { ...row, productName: p.productName, unitCost, agreedUnitPrice, piecesPerCarton: p.piecesPerCarton };
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
        items: items.map((it) => {
          const cartonQty = Number(it.quantity);
          const totalPieces = it.piecesPerCarton ? cartonQty * it.piecesPerCarton : cartonQty;
          return {
            productName: it.productName.trim(),
            quantity: totalPieces,
            agreedUnitPrice: it.agreedUnitPrice,
          };
        }),
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
                const ppc = item.piecesPerCarton;
                const cartonQty = parseInt(item.quantity, 10);
                const totalPieces = ppc && !isNaN(cartonQty) ? cartonQty * ppc : cartonQty;
                const matchedProduct = (products as ProductSummary[] | undefined)?.find((p) => p.productName === item.productName);
                const stockInCartons = matchedProduct && ppc ? Math.floor(matchedProduct.totalAvailable / ppc) : null;
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
                            {suggestions.map((p) => {
                              const sPpc = p.piecesPerCarton;
                              const sCartons = sPpc ? Math.floor(p.totalAvailable / sPpc) : null;
                              return (
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
                                    {sPpc && (
                                      <span className="text-xs font-normal ml-1" style={{ color: 'var(--muted)' }}>
                                        ({sPpc} pcs/carton)
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
                                    <span>
                                      {formatCurrency(p.latestUnitCost)} cost
                                      {sPpc ? <> · {formatCurrency((parseFloat(p.latestSellingPrice) * sPpc).toFixed(2))}/carton</> : null}
                                    </span>
                                    <span>
                                      {sCartons != null
                                        ? <>{sCartons} cartons ({p.totalAvailable} pcs)</>
                                        : <>{p.totalAvailable} {t.sendConsignment.inStock}</>
                                      }
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <input
                          value={item.quantity}
                          onChange={setStringField(i, 'quantity')}
                          placeholder={ppc ? 'Cartons' : t.sendConsignment.qtyPlaceholder}
                          type="number"
                          min="1"
                          className="input w-full"
                        />
                        {ppc && !isNaN(cartonQty) && cartonQty > 0 && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                            = {totalPieces} pcs
                          </p>
                        )}
                      </div>
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

                    {/* Stock info */}
                    {matchedProduct && ppc && (
                      <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
                        Available: <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{stockInCartons} cartons</span> ({matchedProduct.totalAvailable} pcs)
                        {!isNaN(totalPieces) && totalPieces > matchedProduct.totalAvailable && (
                          <span style={{ color: 'var(--danger)' }}> — exceeds stock</span>
                        )}
                      </p>
                    )}

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

                    {/* Price summary */}
                    {parseFloat(item.agreedUnitPrice) > 0 && (
                      <div className="rounded-lg px-3 py-2 mt-2 text-xs" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--muted)' }}>Per piece</span>
                          <span className="font-medium" style={{ color: 'var(--foreground)' }}>{formatCurrency(item.agreedUnitPrice)}</span>
                        </div>
                        {ppc && (
                          <div className="flex justify-between mt-1">
                            <span style={{ color: 'var(--muted)' }}>Per carton ({ppc} pcs)</span>
                            <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{formatCurrency((parseFloat(item.agreedUnitPrice) * ppc).toFixed(2))}</span>
                          </div>
                        )}
                        {!isNaN(cartonQty) && cartonQty > 0 && (
                          <div className="flex justify-between mt-1 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                            <span style={{ color: 'var(--muted)' }}>
                              Total ({ppc ? <>{cartonQty} carton{cartonQty > 1 ? 's' : ''} · {totalPieces} pcs</> : <>{cartonQty} pcs</>})
                            </span>
                            <span className="font-bold" style={{ color: 'var(--success)' }}>
                              {formatCurrency((parseFloat(item.agreedUnitPrice) * (ppc ? totalPieces : cartonQty)).toFixed(2))}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Grand total */}
        {items.some((it) => parseFloat(it.agreedUnitPrice) > 0 && parseInt(it.quantity, 10) > 0) && (
          <div className="rounded-xl border p-3 mt-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--muted)' }}>Summary</div>
            {items.map((it, i) => {
              const q = parseInt(it.quantity, 10);
              const price = parseFloat(it.agreedUnitPrice);
              if (isNaN(q) || q <= 0 || isNaN(price) || price <= 0) return null;
              const ppc = it.piecesPerCarton;
              const pieces = ppc ? q * ppc : q;
              const lineTotal = price * pieces;
              return (
                <div key={i} className="flex justify-between text-xs py-0.5">
                  <span style={{ color: 'var(--foreground)' }}>
                    <span className="capitalize">{it.productName}</span>
                    {' '}
                    <span style={{ color: 'var(--muted)' }}>
                      {ppc ? <>{q} carton{q > 1 ? 's' : ''} ({pieces} pcs)</> : <>{q} pcs</>}
                    </span>
                  </span>
                  <span className="font-medium" style={{ color: 'var(--foreground)' }}>{formatCurrency(lineTotal.toFixed(2))}</span>
                </div>
              );
            })}
            <div className="flex justify-between text-sm font-bold pt-1.5 mt-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--foreground)' }}>
                Grand Total
                <span className="font-normal text-xs ml-1" style={{ color: 'var(--muted)' }}>
                  ({items.reduce((s, it) => {
                    const q = parseInt(it.quantity, 10);
                    if (isNaN(q) || q <= 0) return s;
                    return s + (it.piecesPerCarton ? q * it.piecesPerCarton : q);
                  }, 0)} pcs
                  {items.some((it) => it.piecesPerCarton && parseInt(it.quantity, 10) > 0) && (
                    <> / {items.reduce((s, it) => { const q = parseInt(it.quantity, 10); return isNaN(q) || q <= 0 ? s : s + q; }, 0)} cartons</>
                  )})
                </span>
              </span>
              <span style={{ color: 'var(--success)' }}>
                {formatCurrency(
                  items.reduce((s, it) => {
                    const q = parseInt(it.quantity, 10);
                    const price = parseFloat(it.agreedUnitPrice);
                    if (isNaN(q) || q <= 0 || isNaN(price) || price <= 0) return s;
                    const pieces = it.piecesPerCarton ? q * it.piecesPerCarton : q;
                    return s + price * pieces;
                  }, 0).toFixed(2)
                )}
              </span>
            </div>
          </div>
        )}

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
