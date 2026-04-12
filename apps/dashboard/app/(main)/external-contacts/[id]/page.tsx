'use client';

import { use, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { externalContactsApi, inventoryApi } from '../../../../lib/api';
import { QK } from '../../../../lib/query-keys';
import { useFormatCurrency } from '../../../../lib/currency';
import { useT } from '../../../../lib/i18n';
import { singleExternalTxHtml } from '../../../../lib/print-templates';
import { PrintDialog } from '../../../../components/ui/PrintDialog';

type TxType = 'PRODUCT_OUT' | 'PAYMENT_IN' | 'PRODUCT_IN' | 'PAYMENT_OUT';
type Role = 'DEBTOR' | 'SUPPLIER' | 'BOTH';
type Modal = 'product-out' | 'payment-in' | 'product-in' | 'payment-out' | null;

interface ExternalTransaction {
  id: string;
  type: TxType;
  productName: string | null;
  quantity: number | null;
  unitPrice: string | null;
  unitCostUsed: string | null;
  amount: string;
  profit: string | null;
  isLoss: boolean | null;
  notes: string | null;
  createdAt: string;
}

interface Contact {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  role: Role;
  debtorBalance: string;
  supplierBalance: string;
  transactions: ExternalTransaction[];
}

function txBadgeColor(type: TxType): string {
  switch (type) {
    case 'PRODUCT_OUT': return 'var(--success)';
    case 'PAYMENT_IN': return 'var(--primary)';
    case 'PRODUCT_IN': return 'var(--warning)';
    case 'PAYMENT_OUT': return 'var(--danger)';
  }
}

function txLabel(type: TxType, productName: string | null, quantity: number | null): string {
  switch (type) {
    case 'PRODUCT_OUT': return `Gave ${quantity}× ${productName}`;
    case 'PAYMENT_IN': return 'Payment received';
    case 'PRODUCT_IN': return `Received ${quantity}× ${productName}`;
    case 'PAYMENT_OUT': return 'Payment made';
  }
}

interface ProductSummary {
  productName: string;
  latestUnitCost: string;
  latestSellingPrice: string;
  latestCartonPrice: string | null;
  piecesPerCarton: number | null;
  totalAvailable: number;
}

interface ProductOutItem {
  productName: string;
  quantity: string;
  extraPieces: string;
  showExtraPieces: boolean;
  unitPrice: string;
  cartonPrice: string;
  unitCost: string;
  piecesPerCarton: number | null;
  selectedStock: number | null;
}

const EMPTY_PO_ITEM: ProductOutItem = {
  productName: '',
  quantity: '',
  extraPieces: '',
  showExtraPieces: false,
  unitPrice: '',
  cartonPrice: '',
  unitCost: '',
  piecesPerCarton: null,
  selectedStock: null,
};

function getPoTotalPieces(cartonQty: number, ppc: number | null, extraPieces: string): number {
  const extra = parseInt(extraPieces, 10) || 0;
  if (ppc && !isNaN(cartonQty)) return cartonQty * ppc + extra;
  return cartonQty;
}

function ActionModal({ modal, contactId, onClose }: { modal: Modal; contactId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const [form, setForm] = useState({ productName: '', quantity: '', unitPrice: '', unitCost: '', sellingPrice: '', category: '', amount: '', notes: '' });
  const [poItems, setPoItems] = useState<ProductOutItem[]>([{ ...EMPTY_PO_ITEM }]);
  const [focusedItemIndex, setFocusedItemIndex] = useState<number | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Fetch products for autocomplete (only for product-out)
  const { data: products } = useQuery({
    queryKey: QK.inventoryProducts,
    queryFn: inventoryApi.listProducts,
    staleTime: 60_000,
    enabled: modal === 'product-out',
  });

  const getFilteredProducts = (query: string): ProductSummary[] =>
    (products as ProductSummary[] | undefined)?.filter((p) =>
      p.productName.includes(query.toLowerCase().trim())
    ) ?? [];

  const deriveCartonPrice = (unitPrice: string, ppc: number | null): string => {
    const up = parseFloat(unitPrice);
    return !isNaN(up) && up > 0 && ppc ? (up * ppc).toFixed(2) : '';
  };

  const selectPoProduct = (i: number, p: ProductSummary) => {
    setPoItems((prev) =>
      prev.map((row, idx) => {
        if (idx !== i) return row;
        const ppc = p.piecesPerCarton;
        const unitPrice = p.latestSellingPrice;
        const cartonPrice = deriveCartonPrice(unitPrice, ppc);
        return { ...row, productName: p.productName, unitPrice, cartonPrice, unitCost: p.latestUnitCost, piecesPerCarton: ppc, selectedStock: p.totalAvailable };
      })
    );
    setFocusedItemIndex(null);
  };

  const setPoProductName = (i: number, value: string) => {
    setPoItems((prev) =>
      prev.map((row, idx) => (idx === i ? { ...row, productName: value, selectedStock: null } : row))
    );
  };

  const handlePoUnitPriceChange = (i: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPoItems((prev) =>
      prev.map((row, idx) => {
        if (idx !== i) return row;
        return { ...row, unitPrice: value, cartonPrice: deriveCartonPrice(value, row.piecesPerCarton) };
      })
    );
  };

  const handlePoCartonPriceChange = (i: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPoItems((prev) =>
      prev.map((row, idx) => {
        if (idx !== i || !row.piecesPerCarton) return row;
        const cp = parseFloat(value);
        const unitPrice = !isNaN(cp) ? (cp / row.piecesPerCarton).toFixed(2) : row.unitPrice;
        return { ...row, cartonPrice: value, unitPrice };
      })
    );
  };

  const setPoQuantity = (i: number) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPoItems((prev) => prev.map((row, idx) => (idx === i ? { ...row, quantity: e.target.value } : row)));

  const setPoExtraPieces = (i: number) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPoItems((prev) => prev.map((row, idx) => (idx === i ? { ...row, extraPieces: e.target.value } : row)));

  const togglePoExtraPieces = (i: number) =>
    setPoItems((prev) => prev.map((row, idx) => (idx === i ? { ...row, showExtraPieces: !row.showExtraPieces, extraPieces: row.showExtraPieces ? '' : row.extraPieces } : row)));

  const addPoItem = () => setPoItems((prev) => [...prev, { ...EMPTY_PO_ITEM }]);
  const removePoItem = (i: number) => setPoItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const isPoItemBelowCost = (it: ProductOutItem): boolean => {
    const cost = parseFloat(it.unitCost);
    const sell = parseFloat(it.unitPrice);
    return !isNaN(cost) && cost > 0 && !isNaN(sell) && sell > 0 && sell <= cost;
  };

  const hasPoItemBelowCost = poItems.some(isPoItemBelowCost);

  // Reset form when modal changes
  useEffect(() => {
    setForm({ productName: '', quantity: '', unitPrice: '', unitCost: '', sellingPrice: '', category: '', amount: '', notes: '' });
    setPoItems([{ ...EMPTY_PO_ITEM }]);
    setFocusedItemIndex(null);
  }, [modal]);

  const onSuccess = () => {
    qc.invalidateQueries({ queryKey: QK.externalContactDetail(contactId) });
    qc.invalidateQueries({ queryKey: QK.externalContacts });
    qc.invalidateQueries({ queryKey: QK.inventoryProducts });
    onClose();
  };

  const mut = useMutation({
    mutationFn: async () => {
      if (modal === 'product-out') {
        for (const item of poItems) {
          const totalPieces = getPoTotalPieces(parseInt(item.quantity, 10), item.piecesPerCarton, item.extraPieces);
          await externalContactsApi.recordProductOut(contactId, {
            productName: item.productName, quantity: totalPieces,
            unitPrice: item.unitPrice, notes: form.notes || undefined,
          });
        }
        return;
      }
      if (modal === 'payment-in') {
        return externalContactsApi.recordPaymentIn(contactId, { amount: form.amount, notes: form.notes || undefined });
      }
      if (modal === 'product-in') {
        return externalContactsApi.recordProductIn(contactId, {
          productName: form.productName, quantity: parseInt(form.quantity, 10),
          unitCost: form.unitCost, sellingPrice: form.sellingPrice,
          category: form.category || undefined, notes: form.notes || undefined,
        });
      }
      return externalContactsApi.recordPaymentOut(contactId, { amount: form.amount, notes: form.notes || undefined });
    },
    onSuccess,
  });

  const titles: Record<NonNullable<Modal>, string> = {
    'product-out': 'Give Products',
    'payment-in': 'Receive Payment',
    'product-in': 'Receive Products',
    'payment-out': 'Make Payment',
  };

  if (!modal) return null;

  const hasInvalidExtraPieces = poItems.some((it) => {
    const extra = parseInt(it.extraPieces, 10) || 0;
    return it.piecesPerCarton && extra >= it.piecesPerCarton;
  });

  const canSubmitProductOut =
    poItems.length > 0 &&
    !hasPoItemBelowCost &&
    !hasInvalidExtraPieces &&
    poItems.every((it) => {
      const totalPcs = getPoTotalPieces(parseInt(it.quantity, 10), it.piecesPerCarton, it.extraPieces);
      return it.productName.trim() &&
        totalPcs > 0 &&
        it.unitPrice &&
        parseFloat(it.unitPrice) > 0;
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>{titles[modal]}</h2>
          {modal === 'product-out' && (
            <button type="button" onClick={addPoItem} className="text-xs font-medium" style={{ color: 'var(--primary)' }}>
              + Add item
            </button>
          )}
        </div>
        <div className="space-y-3">
          {modal === 'product-out' && (
            <>
              {poItems.map((item, i) => {
                const suggestions = getFilteredProducts(item.productName);
                const showDrop = focusedItemIndex === i && item.productName.trim().length > 0 && suggestions.length > 0;
                const ppc = item.piecesPerCarton;
                const cartonQty = parseInt(item.quantity, 10);
                const extraPcs = parseInt(item.extraPieces, 10) || 0;
                const totalPieces = getPoTotalPieces(cartonQty, ppc, item.extraPieces);
                const extraPiecesInvalid = ppc && extraPcs >= ppc;
                const overStock = item.selectedStock != null && !isNaN(totalPieces) && totalPieces > item.selectedStock;
                const stockInCartons = item.selectedStock != null && ppc ? Math.floor(item.selectedStock / ppc) : null;
                const belowCost = isPoItemBelowCost(item);

                return (
                  <div key={i} className="rounded-xl border p-3" style={{ borderColor: belowCost ? 'var(--danger)' : 'var(--border)', background: 'var(--input)' }}>
                    {/* Row 1: product autocomplete, qty, remove */}
                    <div className="flex gap-2 items-start mb-2">
                      <div className="flex-[2] relative">
                        <input
                          value={item.productName}
                          onChange={(e) => { setPoProductName(i, e.target.value); setFocusedItemIndex(i); }}
                          onFocus={() => setFocusedItemIndex(i)}
                          onBlur={() => setTimeout(() => setFocusedItemIndex(null), 150)}
                          placeholder="Product name..."
                          className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                          style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                        />
                        {showDrop && (
                          <div
                            className="absolute z-10 left-0 right-0 mt-1 rounded-lg border max-h-48 overflow-y-auto"
                            style={{ background: 'var(--card)', borderColor: 'var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
                          >
                            {suggestions.map((p) => {
                              const sPpc = p.piecesPerCarton;
                              const cartonSell = sPpc ? (parseFloat(p.latestSellingPrice) * sPpc).toFixed(2) : null;
                              const sCartons = sPpc ? Math.floor(p.totalAvailable / sPpc) : null;
                              return (
                                <div
                                  key={p.productName}
                                  onMouseDown={(e) => { e.preventDefault(); selectPoProduct(i, p); }}
                                  className="px-3 py-2 cursor-pointer border-b last:border-b-0 text-sm"
                                  style={{ borderColor: 'var(--border)' }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--input)')}
                                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--card)')}
                                >
                                  <span className="font-medium capitalize" style={{ color: 'var(--foreground)' }}>
                                    {p.productName}
                                    {sPpc && <span className="text-xs font-normal ml-1" style={{ color: 'var(--muted-foreground)' }}>({sPpc} pcs/carton)</span>}
                                  </span>
                                  <span className="flex justify-between mt-0.5 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                                    <span>
                                      {formatCurrency(p.latestUnitCost)} cost
                                      {cartonSell ? <> · {formatCurrency(cartonSell)}/carton</> : null}
                                    </span>
                                    <span>
                                      {sCartons != null
                                        ? <>{sCartons} cartons ({p.totalAvailable} pcs)</>
                                        : <>{p.totalAvailable} pcs</>
                                      }
                                    </span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <input
                          value={item.quantity}
                          onChange={setPoQuantity(i)}
                          placeholder={ppc ? 'Cartons' : 'Qty'}
                          type="number"
                          min={ppc && item.showExtraPieces ? '0' : '1'}
                          className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                          style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                        />
                        {ppc && (
                          <div className="mt-0.5">
                            {!item.showExtraPieces ? (
                              <button type="button" onClick={() => togglePoExtraPieces(i)} className="text-xs" style={{ color: 'var(--primary)' }}>
                                + loose pieces
                              </button>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>+</span>
                                <input
                                  value={item.extraPieces}
                                  onChange={setPoExtraPieces(i)}
                                  placeholder="pcs"
                                  type="number"
                                  min="0"
                                  max={ppc - 1}
                                  className="w-16 px-2 py-0.5 rounded-lg text-xs border outline-none"
                                  style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                                />
                                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>pcs</span>
                                <button type="button" onClick={() => togglePoExtraPieces(i)} className="text-xs ml-1" style={{ color: 'var(--danger)' }}>✕</button>
                              </div>
                            )}
                            {extraPiecesInvalid && (
                              <p className="text-xs mt-0.5" style={{ color: 'var(--danger)' }}>
                                Max {ppc - 1} loose pcs (a full carton is {ppc})
                              </p>
                            )}
                            {!isNaN(totalPieces) && totalPieces > 0 && (
                              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                                = {totalPieces} pcs total
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      {poItems.length > 1 && (
                        <button type="button" onClick={() => removePoItem(i)} className="px-2 py-2 text-sm flex-shrink-0" style={{ color: 'var(--danger)' }}>
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Stock info */}
                    {item.selectedStock != null && (
                      <p className="text-xs mb-2" style={{ color: 'var(--muted-foreground)' }}>
                        Available: {stockInCartons != null ? (
                          <><span className="font-semibold" style={{ color: 'var(--foreground)' }}>{stockInCartons} cartons</span> ({item.selectedStock} pcs)</>
                        ) : (
                          <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{item.selectedStock} pcs</span>
                        )}
                        {overStock && <span style={{ color: 'var(--danger)' }}> — exceeds stock</span>}
                      </p>
                    )}

                    {/* Prices */}
                    {ppc ? (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>
                            Carton price ({ppc} pcs)
                          </label>
                          <input
                            value={item.cartonPrice}
                            onChange={handlePoCartonPriceChange(i)}
                            placeholder="Carton price"
                            type="number" min="0" step="0.01"
                            className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                            style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Unit price per piece</label>
                          <input
                            value={item.unitPrice}
                            onChange={handlePoUnitPriceChange(i)}
                            placeholder="28.00"
                            type="number" min="0" step="0.01"
                            className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                            style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Unit Price</label>
                        <input
                          value={item.unitPrice}
                          onChange={handlePoUnitPriceChange(i)}
                          placeholder="28.00"
                          type="number" min="0" step="0.01"
                          className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                          style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                        />
                      </div>
                    )}

                    {/* Below-cost warning */}
                    {belowCost && (
                      <div className="rounded-lg px-3 py-2 mt-2 text-xs font-medium" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
                        Selling price ({formatCurrency(item.unitPrice)}/pc) is at or below cost ({formatCurrency(item.unitCost)}/pc). You will make a loss.
                      </div>
                    )}

                    {/* Line total */}
                    {parseFloat(item.unitPrice) > 0 && !isNaN(totalPieces) && totalPieces > 0 && (
                      <div className="rounded-lg px-3 py-2 mt-2 text-xs" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--muted-foreground)' }}>
                            Total ({ppc ? <>{cartonQty > 0 ? `${cartonQty} carton${cartonQty > 1 ? 's' : ''}` : ''}{extraPcs > 0 ? `${cartonQty > 0 ? ' + ' : ''}${extraPcs} pcs` : ''} · {totalPieces} pcs</> : <>{totalPieces} pcs</>})
                          </span>
                          <span className="font-bold" style={{ color: belowCost ? 'var(--danger)' : 'var(--success)' }}>
                            {formatCurrency((parseFloat(item.unitPrice) * totalPieces).toFixed(2))}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Grand total for multi-item */}
              {poItems.length > 1 && poItems.some((it) => parseFloat(it.unitPrice) > 0 && getPoTotalPieces(parseInt(it.quantity, 10), it.piecesPerCarton, it.extraPieces) > 0) && (
                <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--input)' }}>
                  <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--muted-foreground)' }}>Summary</div>
                  {poItems.map((it, i) => {
                    const q = parseInt(it.quantity, 10);
                    const price = parseFloat(it.unitPrice);
                    const ppc = it.piecesPerCarton;
                    const pieces = getPoTotalPieces(q, ppc, it.extraPieces);
                    if (isNaN(pieces) || pieces <= 0 || isNaN(price) || price <= 0) return null;
                    const extra = parseInt(it.extraPieces, 10) || 0;
                    return (
                      <div key={i} className="flex justify-between text-xs py-0.5">
                        <span style={{ color: 'var(--foreground)' }}>
                          <span className="capitalize">{it.productName}</span>{' '}
                          <span style={{ color: 'var(--muted-foreground)' }}>
                            {ppc ? <>{q > 0 ? `${q} carton${q > 1 ? 's' : ''}` : ''}{extra > 0 ? `${q > 0 ? ' + ' : ''}${extra} pcs` : ''} ({pieces} pcs)</> : <>{pieces} pcs</>}
                          </span>
                        </span>
                        <span className="font-medium" style={{ color: 'var(--foreground)' }}>{formatCurrency((price * pieces).toFixed(2))}</span>
                      </div>
                    );
                  })}
                  <div className="flex justify-between text-sm font-bold pt-1.5 mt-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
                    <span style={{ color: 'var(--foreground)' }}>Grand Total</span>
                    <span style={{ color: hasPoItemBelowCost ? 'var(--danger)' : 'var(--success)' }}>
                      {formatCurrency(
                        poItems.reduce((s, it) => {
                          const q = parseInt(it.quantity, 10);
                          const price = parseFloat(it.unitPrice);
                          const pieces = getPoTotalPieces(q, it.piecesPerCarton, it.extraPieces);
                          if (isNaN(pieces) || pieces <= 0 || isNaN(price) || price <= 0) return s;
                          return s + price * pieces;
                        }, 0).toFixed(2)
                      )}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
          {modal === 'product-in' && (
            <>
              <Field label="Product Name" value={form.productName} onChange={set('productName')} placeholder="e.g. Rice 50kg" />
              <Field label="Quantity" value={form.quantity} onChange={set('quantity')} placeholder="10" type="number" />
              <Field label="Unit Cost (you owe per unit)" value={form.unitCost} onChange={set('unitCost')} placeholder="22.00" type="number" />
              <Field label="Your Selling Price" value={form.sellingPrice} onChange={set('sellingPrice')} placeholder="30.00" type="number" />
              <Field label="Category (optional)" value={form.category} onChange={set('category')} placeholder="Grains" />
            </>
          )}
          {(modal === 'payment-in' || modal === 'payment-out') && (
            <Field label="Amount" value={form.amount} onChange={set('amount')} placeholder="0.00" type="number" />
          )}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={2}
              className="w-full px-3 py-2 rounded-lg text-sm border outline-none resize-none"
              style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
            />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm font-medium border"
            style={{ color: 'var(--muted-foreground)', borderColor: 'var(--border)' }}
          >
            Cancel
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || (modal === 'product-out' && !canSubmitProductOut)}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: modal === 'product-out' && !canSubmitProductOut ? 'var(--muted-foreground)' : 'var(--primary)' }}
          >
            {mut.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
        {mut.isError && (
          <p className="text-xs mt-2 text-center" style={{ color: 'var(--danger)' }}>
            {(mut.error as Error)?.message ?? 'An error occurred'}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>{label}</label>
      <input
        value={value} onChange={onChange} placeholder={placeholder} type={type}
        className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
        style={{ background: 'var(--input)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
      />
    </div>
  );
}

export default function ExternalContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const t = useT();
  const [openModal, setOpenModal] = useState<Modal>(null);
  const [printTx, setPrintTx] = useState<ExternalTransaction | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: QK.externalContactDetail(id),
    queryFn: () => externalContactsApi.detail(id),
    enabled: !!id,
  });

  const contact = data as Contact | undefined;

  const deleteTxMutation = useMutation({
    mutationFn: (txId: string) => externalContactsApi.deleteTransaction(id, txId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.externalContactDetail(id) });
      qc.invalidateQueries({ queryKey: QK.externalContacts });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: () => externalContactsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.externalContacts });
      router.push('/external-contacts');
    },
  });

  if (isLoading || !contact) {
    return <div className="p-6 text-center" style={{ color: 'var(--muted-foreground)' }}>Loading...</div>;
  }

  const isDebtor = contact.role === 'DEBTOR' || contact.role === 'BOTH';
  const isSupplier = contact.role === 'SUPPLIER' || contact.role === 'BOTH';

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <div className="mb-4 text-sm" style={{ color: 'var(--muted-foreground)' }}>
        <Link href="/external-contacts" className="hover:underline" style={{ color: 'var(--primary)' }}>
          {t.nav.externalContacts}
        </Link>
        {' / '}{contact.name}
      </div>

      {/* Contact card */}
      <div className="rounded-2xl p-5 mb-5 border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>{contact.name}</h1>
            {contact.phone && <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{contact.phone}</p>}
            {contact.notes && <p className="text-xs mt-1 italic" style={{ color: 'var(--muted-foreground)' }}>{contact.notes}</p>}
          </div>
          <button
            onClick={() => { if (confirm('Delete this contact and all transactions?')) deleteContactMutation.mutate(); }}
            className="text-xs px-3 py-1.5 rounded-lg border"
            style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
          >
            Delete
          </button>
        </div>

        {/* Balances */}
        <div className="flex gap-6 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          {isDebtor && (
            <div>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Owes You</p>
              <p className="text-xl font-bold" style={{ color: 'var(--success)' }}>{formatCurrency(contact.debtorBalance)}</p>
            </div>
          )}
          {isSupplier && (
            <div>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>You Owe</p>
              <p className="text-xl font-bold" style={{ color: 'var(--danger)' }}>{formatCurrency(contact.supplierBalance)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mb-5">
        {isDebtor && (
          <>
            <button onClick={() => setOpenModal('product-out')} className="px-4 py-2 rounded-xl text-sm font-medium border transition-all" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              📦 Give Products
            </button>
            <button onClick={() => setOpenModal('payment-in')} className="px-4 py-2 rounded-xl text-sm font-medium border transition-all" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              💵 Receive Payment
            </button>
          </>
        )}
        {isSupplier && (
          <>
            <button onClick={() => setOpenModal('product-in')} className="px-4 py-2 rounded-xl text-sm font-medium border transition-all" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              📥 Receive Products
            </button>
            <button onClick={() => setOpenModal('payment-out')} className="px-4 py-2 rounded-xl text-sm font-medium border transition-all" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              💸 Make Payment
            </button>
          </>
        )}
      </div>

      {/* Transaction history */}
      <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--foreground)' }}>
        Transaction History ({contact.transactions.length})
      </h2>
      {contact.transactions.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          <div className="text-4xl mb-2">📋</div>
          <p className="font-medium" style={{ color: 'var(--foreground)' }}>No transactions yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>Use the buttons above to record a transaction.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {contact.transactions.map((tx) => (
            <div key={tx.id} className="rounded-xl px-4 py-3 border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                    {txLabel(tx.type, tx.productName, tx.quantity)}
                  </p>
                  {tx.type === 'PRODUCT_OUT' && tx.unitPrice && tx.unitCostUsed && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                      Cost {formatCurrency(tx.unitCostUsed)} · Sell {formatCurrency(tx.unitPrice)} per unit
                    </p>
                  )}
                  {tx.notes && <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{tx.notes}</p>}
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                    {new Date(tx.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-start gap-3 ml-4">
                  <div className="text-right">
                    <p className="font-bold text-sm" style={{ color: txBadgeColor(tx.type) }}>
                      {formatCurrency(tx.amount)}
                    </p>
                    {tx.profit != null && (
                      <p className="text-xs font-medium mt-0.5" style={{ color: tx.isLoss ? 'var(--danger)' : 'var(--success)' }}>
                        {tx.isLoss ? '▼' : '▲'} {formatCurrency(Math.abs(parseFloat(tx.profit)).toFixed(2))} profit
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setPrintTx(tx)}
                    className="text-xs px-2 py-1 rounded border mt-0.5"
                    style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }}
                    title={t.print.printBtn}
                  >
                    🖨️
                  </button>
                  <button
                    onClick={() => { if (confirm('Delete this transaction? Balance will be corrected but inventory changes are not reversed.')) deleteTxMutation.mutate(tx.id); }}
                    className="text-xs px-2 py-1 rounded border mt-0.5"
                    style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action modals */}
      <ActionModal modal={openModal} contactId={id} onClose={() => setOpenModal(null)} />
      {contact && (
        <PrintDialog
          open={!!printTx}
          onClose={() => setPrintTx(null)}
          buildHtml={(fmt) => {
            const tx = printTx!;
            const isProductOut = tx.type === 'PRODUCT_OUT';
            const isProductIn = tx.type === 'PRODUCT_IN';
            const isPaymentIn = tx.type === 'PAYMENT_IN';
            const title = isProductOut
              ? t.print.deliveryNote
              : isProductIn
              ? t.print.goodsReceivedNote
              : t.print.paymentReceipt;
            const balance = (isProductOut || isPaymentIn)
              ? contact.debtorBalance
              : contact.supplierBalance;
            return singleExternalTxHtml({
              contactName: contact.name,
              contactPhone: contact.phone,
              tx: { type: tx.type, productName: tx.productName, quantity: tx.quantity, unitPrice: tx.unitPrice, amount: tx.amount, createdAt: tx.createdAt, notes: tx.notes },
              balance,
              formatCurrency: fmt,
              t: { title, contact: t.print.contact, phone: t.print.phone, date: t.print.date, product: t.print.product, qty: t.print.qty, unitPrice: t.print.unitPrice, total: t.print.total, balance: t.print.balance },
            });
          }}
        />
      )}
    </div>
  );
}
