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
  extraPieces: string;
  showExtraPieces: boolean;
  agreedUnitPrice: string;
  cartonPrice: string;
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
  extraPieces: '',
  showExtraPieces: false,
  agreedUnitPrice: '',
  cartonPrice: '',
  priceMode: 'manual',
  unitCost: '',
  markupPct: 25,
  piecesPerCarton: null,
};

/** Compute total pieces from cartons + optional extra loose pieces */
function getTotalPieces(cartonQty: number, ppc: number | null, extraPieces: string): number {
  const extra = parseInt(extraPieces, 10) || 0;
  if (ppc && !isNaN(cartonQty)) return cartonQty * ppc + extra;
  return cartonQty;
}

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

  const deriveCartonPrice = (unitPrice: string, ppc: number | null): string => {
    const up = parseFloat(unitPrice);
    return !isNaN(up) && up > 0 && ppc ? (up * ppc).toFixed(2) : '';
  };

  const selectProduct = (i: number, p: ProductSummary) => {
    setItems((prev) =>
      prev.map((row, idx) => {
        if (idx !== i) return row;
        const unitCost = p.latestUnitCost;
        const agreedUnitPrice =
          row.priceMode === 'pct' && parseFloat(unitCost) > 0
            ? (parseFloat(unitCost) * (1 + row.markupPct / 100)).toFixed(2)
            : p.latestSellingPrice;
        const ppc = p.piecesPerCarton;
        const cartonPrice = deriveCartonPrice(agreedUnitPrice, ppc);
        return { ...row, productName: p.productName, unitCost, agreedUnitPrice, cartonPrice, piecesPerCarton: ppc };
      })
    );
    setFocusedItemIndex(null);
  };

  const setProductName = (i: number, value: string) => {
    setItems((prev) =>
      prev.map((row, idx) => (idx === i ? { ...row, productName: value } : row))
    );
  };

  const setQuantity = (i: number) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setItems((prev) => prev.map((row, idx) => (idx === i ? { ...row, quantity: e.target.value } : row)));

  const setExtraPieces = (i: number) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setItems((prev) => prev.map((row, idx) => (idx === i ? { ...row, extraPieces: e.target.value } : row)));

  const toggleExtraPieces = (i: number) =>
    setItems((prev) => prev.map((row, idx) => (idx === i ? { ...row, showExtraPieces: !row.showExtraPieces, extraPieces: row.showExtraPieces ? '' : row.extraPieces } : row)));

  const handleUnitPriceChange = (i: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setItems((prev) =>
      prev.map((row, idx) => {
        if (idx !== i) return row;
        return { ...row, agreedUnitPrice: value, cartonPrice: deriveCartonPrice(value, row.piecesPerCarton) };
      })
    );
  };

  const handleCartonPriceChange = (i: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setItems((prev) =>
      prev.map((row, idx) => {
        if (idx !== i || !row.piecesPerCarton) return row;
        const cp = parseFloat(value);
        const agreedUnitPrice = !isNaN(cp) ? (cp / row.piecesPerCarton).toFixed(2) : row.agreedUnitPrice;
        return { ...row, cartonPrice: value, agreedUnitPrice };
      })
    );
  };

  const handleUnitCostChange = (i: number, value: string) => {
    setItems((prev) =>
      prev.map((row, idx) => {
        if (idx !== i) return row;
        const cost = parseFloat(value);
        const agreedUnitPrice =
          row.priceMode === 'pct' && !isNaN(cost) && cost > 0
            ? (cost * (1 + row.markupPct / 100)).toFixed(2)
            : row.agreedUnitPrice;
        return { ...row, unitCost: value, agreedUnitPrice, cartonPrice: deriveCartonPrice(agreedUnitPrice, row.piecesPerCarton) };
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
        return { ...row, priceMode: mode, agreedUnitPrice, cartonPrice: deriveCartonPrice(agreedUnitPrice, row.piecesPerCarton) };
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
        return { ...row, markupPct: pct, agreedUnitPrice, cartonPrice: deriveCartonPrice(agreedUnitPrice, row.piecesPerCarton) };
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
          quantity: getTotalPieces(Number(it.quantity), it.piecesPerCarton, it.extraPieces),
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

  const isBelowCost = (it: ItemRow): boolean => {
    const cost = parseFloat(it.unitCost);
    const sell = parseFloat(it.agreedUnitPrice);
    return !isNaN(cost) && cost > 0 && !isNaN(sell) && sell > 0 && sell <= cost;
  };

  const hasBelowCost = items.some(isBelowCost);

  const hasInvalidExtraPieces = items.some((it) => {
    const extra = parseInt(it.extraPieces, 10) || 0;
    return it.piecesPerCarton && extra >= it.piecesPerCarton;
  });

  const canSubmit =
    debtor &&
    items.length > 0 &&
    !hasBelowCost &&
    !hasInvalidExtraPieces &&
    items.every((it) => {
      const totalPcs = getTotalPieces(parseInt(it.quantity, 10), it.piecesPerCarton, it.extraPieces);
      return it.productName.trim() &&
        totalPcs > 0 &&
        it.agreedUnitPrice &&
        parseFloat(it.agreedUnitPrice) > 0;
    });

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
                const extraPcs = parseInt(item.extraPieces, 10) || 0;
                const totalPieces = getTotalPieces(cartonQty, ppc, item.extraPieces);
                const extraPiecesInvalid = ppc && extraPcs >= ppc;
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
                          onChange={setQuantity(i)}
                          placeholder={ppc ? 'Cartons' : t.sendConsignment.qtyPlaceholder}
                          type="number"
                          min={ppc && item.showExtraPieces ? '0' : '1'}
                          className="input w-full"
                        />
                        {ppc && (
                          <div className="mt-0.5">
                            {!item.showExtraPieces ? (
                              <button type="button" onClick={() => toggleExtraPieces(i)} className="text-xs" style={{ color: 'var(--primary)' }}>
                                + loose pieces
                              </button>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="text-xs" style={{ color: 'var(--muted)' }}>+</span>
                                <input
                                  value={item.extraPieces}
                                  onChange={setExtraPieces(i)}
                                  placeholder="pcs"
                                  type="number"
                                  min="0"
                                  max={ppc - 1}
                                  className="input w-16 text-xs"
                                  style={{ padding: '2px 6px' }}
                                />
                                <span className="text-xs" style={{ color: 'var(--muted)' }}>pcs</span>
                                <button type="button" onClick={() => toggleExtraPieces(i)} className="text-xs ml-1" style={{ color: 'var(--danger)' }}>✕</button>
                              </div>
                            )}
                            {extraPiecesInvalid && (
                              <p className="text-xs mt-0.5" style={{ color: 'var(--danger)' }}>
                                Max {ppc - 1} loose pcs (a full carton is {ppc})
                              </p>
                            )}
                            {!isNaN(totalPieces) && totalPieces > 0 && (
                              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                                = {totalPieces} pcs total
                              </p>
                            )}
                          </div>
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
                      <div className="space-y-2">
                        {ppc && (
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>
                              Carton price ({ppc} pcs)
                            </label>
                            <input
                              value={item.cartonPrice}
                              onChange={handleCartonPriceChange(i)}
                              placeholder="Carton price"
                              type="number"
                              min="0"
                              step="0.01"
                              className="input w-full"
                            />
                          </div>
                        )}
                        <div>
                          {ppc && <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Unit price per piece</label>}
                          <input
                            value={item.agreedUnitPrice}
                            onChange={handleUnitPriceChange(i)}
                            placeholder={t.sendConsignment.pricePlaceholder}
                            type="number"
                            min="0"
                            step="0.01"
                            className="input w-full"
                          />
                        </div>
                      </div>
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
                            max="300"
                            step="1"
                            value={item.markupPct}
                            onChange={(e) => handleMarkupChange(i, parseInt(e.target.value, 10))}
                            className="w-full"
                            style={{ accentColor: 'var(--primary)' }}
                          />
                          <div className="flex justify-between text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                            <span>0%</span>
                            <span>300%</span>
                          </div>
                        </div>
                        {ppc && (
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>
                              Carton price ({ppc} pcs)
                            </label>
                            <input
                              value={item.cartonPrice}
                              onChange={handleCartonPriceChange(i)}
                              placeholder="Carton price"
                              type="number"
                              min="0"
                              step="0.01"
                              className="input w-full"
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>
                            {ppc ? `${t.sendConsignment.sellingPrice} (per piece)` : t.sendConsignment.sellingPrice}
                          </label>
                          <input
                            value={item.agreedUnitPrice}
                            onChange={handleUnitPriceChange(i)}
                            placeholder={t.sendConsignment.pricePlaceholder}
                            type="number"
                            min="0"
                            step="0.01"
                            className="input w-full"
                          />
                        </div>
                      </div>
                    )}

                    {/* Below-cost warning */}
                    {isBelowCost(item) && (
                      <div className="rounded-lg px-3 py-2 mt-2 text-xs font-medium" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
                        Selling price ({formatCurrency(item.agreedUnitPrice)}/pc) is at or below cost ({formatCurrency(item.unitCost)}/pc). You will make a loss on this item.
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
                        {!isNaN(totalPieces) && totalPieces > 0 && (
                          <div className="flex justify-between mt-1 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                            <span style={{ color: 'var(--muted)' }}>
                              Total ({ppc
                                ? <>{cartonQty > 0 ? `${cartonQty} carton${cartonQty > 1 ? 's' : ''}` : ''}{extraPcs > 0 ? `${cartonQty > 0 ? ' + ' : ''}${extraPcs} pcs` : ''} · {totalPieces} pcs</>
                                : <>{totalPieces} pcs</>
                              })
                            </span>
                            <span className="font-bold" style={{ color: isBelowCost(item) ? 'var(--danger)' : 'var(--success)' }}>
                              {formatCurrency((parseFloat(item.agreedUnitPrice) * totalPieces).toFixed(2))}
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
              if (isNaN(price) || price <= 0) return null;
              const ppc = it.piecesPerCarton;
              const pieces = getTotalPieces(q, ppc, it.extraPieces);
              if (isNaN(pieces) || pieces <= 0) return null;
              const extra = parseInt(it.extraPieces, 10) || 0;
              const lineTotal = price * pieces;
              return (
                <div key={i} className="flex justify-between text-xs py-0.5">
                  <span style={{ color: 'var(--foreground)' }}>
                    <span className="capitalize">{it.productName}</span>
                    {' '}
                    <span style={{ color: 'var(--muted)' }}>
                      {ppc ? <>{q > 0 ? `${q} carton${q > 1 ? 's' : ''}` : ''}{extra > 0 ? `${q > 0 ? ' + ' : ''}${extra} pcs` : ''} ({pieces} pcs)</> : <>{pieces} pcs</>}
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
                    return s + getTotalPieces(q, it.piecesPerCarton, it.extraPieces);
                  }, 0)} pcs)
                </span>
              </span>
              <span style={{ color: 'var(--success)' }}>
                {formatCurrency(
                  items.reduce((s, it) => {
                    const q = parseInt(it.quantity, 10);
                    const price = parseFloat(it.agreedUnitPrice);
                    const pieces = getTotalPieces(q, it.piecesPerCarton, it.extraPieces);
                    if (isNaN(pieces) || pieces <= 0 || isNaN(price) || price <= 0) return s;
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
