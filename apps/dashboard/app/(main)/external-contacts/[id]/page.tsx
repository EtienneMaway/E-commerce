'use client';

import { use, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { externalContactsApi, inventoryApi } from '../../../../lib/api';
import { QK } from '../../../../lib/query-keys';
import { useFormatCurrency } from '../../../../lib/currency';
import { useT } from '../../../../lib/i18n';
import { singleExternalTxHtml, externalBatchHtml } from '../../../../lib/print-templates';
import { PrintDialog } from '../../../../components/ui/PrintDialog';
import { ActorPill } from '../../../../components/ui/ActorPill';
import { useConfirm } from '../../../../components/ui/ConfirmDialog';
import { useAuthStore } from '../../../../store/auth.store';

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
  actor?: { id: string; username: string } | null;
  originalUnitPrice?: string | null;
  discountReason?: string | null;
  batchId?: string | null;
}

interface BatchGroup {
  batchId: string;
  type: 'PRODUCT_OUT' | 'PRODUCT_IN';
  items: ExternalTransaction[];
  /** Earliest createdAt across the batch's items — used as the batch date for display + print. */
  createdAt: string;
  totalAmount: number;
  note: string | null;
  actor: { id: string; username: string } | null;
}

type HistoryNode =
  | { kind: 'single'; tx: ExternalTransaction }
  | { kind: 'batch'; batch: BatchGroup };

/**
 * Groups consecutive PRODUCT_OUT / PRODUCT_IN rows that share a batch_id into
 * one node. Single rows (no batch_id, payments) become 'single' nodes. Ordering
 * is preserved by the most recent timestamp in each node.
 */
function buildHistory(transactions: ExternalTransaction[]): HistoryNode[] {
  const batchMap = new Map<string, BatchGroup>();
  const singles: ExternalTransaction[] = [];

  for (const tx of transactions) {
    if (
      tx.batchId &&
      (tx.type === 'PRODUCT_OUT' || tx.type === 'PRODUCT_IN')
    ) {
      const group = batchMap.get(tx.batchId);
      if (group) {
        group.items.push(tx);
        group.totalAmount += parseFloat(tx.amount);
        if (new Date(tx.createdAt) < new Date(group.createdAt)) {
          group.createdAt = tx.createdAt;
        }
      } else {
        batchMap.set(tx.batchId, {
          batchId: tx.batchId,
          type: tx.type,
          items: [tx],
          createdAt: tx.createdAt,
          totalAmount: parseFloat(tx.amount),
          note: tx.notes,
          actor: tx.actor ?? null,
        });
      }
    } else {
      singles.push(tx);
    }
  }

  const nodes: HistoryNode[] = [
    ...singles.map((tx): HistoryNode => ({ kind: 'single', tx })),
    ...Array.from(batchMap.values()).map((batch): HistoryNode => ({ kind: 'batch', batch })),
  ];

  // Sort newest first by the node's representative timestamp.
  return nodes.sort((a, b) => {
    const ta = a.kind === 'single' ? a.tx.createdAt : a.batch.createdAt;
    const tb = b.kind === 'single' ? b.tx.createdAt : b.batch.createdAt;
    return new Date(tb).getTime() - new Date(ta).getTime();
  });
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

function txLabel(
  t: ReturnType<typeof useT>,
  type: TxType,
  productName: string | null,
  quantity: number | null,
): string {
  switch (type) {
    case 'PRODUCT_OUT': return t.externalContacts.gave(quantity, productName);
    case 'PAYMENT_IN': return t.externalContacts.paymentReceived;
    case 'PRODUCT_IN': return t.externalContacts.received(quantity, productName);
    case 'PAYMENT_OUT': return t.externalContacts.paymentMade;
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
  const t = useT();
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
        const items = poItems.map((item) => ({
          productName: item.productName,
          quantity: getPoTotalPieces(parseInt(item.quantity, 10), item.piecesPerCarton, item.extraPieces),
          unitPrice: item.unitPrice,
        }));
        return externalContactsApi.recordProductOutBatch(contactId, {
          items,
          notes: form.notes || undefined,
        });
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
    'product-out': t.externalContacts.titleGiveProducts,
    'payment-in': t.externalContacts.titleReceivePayment,
    'product-in': t.externalContacts.titleReceiveProducts,
    'payment-out': t.externalContacts.titleMakePayment,
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
              {t.externalContacts.addItem}
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
                          placeholder={t.externalContacts.placeholderProductName}
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
                          placeholder={ppc ? t.externalContacts.cartons : t.externalContacts.qty}
                          type="number"
                          min={ppc && item.showExtraPieces ? '0' : '1'}
                          className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                          style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                        />
                        {ppc && (
                          <div className="mt-0.5">
                            {!item.showExtraPieces ? (
                              <button type="button" onClick={() => togglePoExtraPieces(i)} className="text-xs" style={{ color: 'var(--primary)' }}>
                                {t.externalContacts.addLoosePieces}
                              </button>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>+</span>
                                <input
                                  value={item.extraPieces}
                                  onChange={setPoExtraPieces(i)}
                                  placeholder={t.externalContacts.pcs}
                                  type="number"
                                  min="0"
                                  max={ppc - 1}
                                  className="w-16 px-2 py-0.5 rounded-lg text-xs border outline-none"
                                  style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                                />
                                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{t.externalContacts.pcs}</span>
                                <button type="button" onClick={() => togglePoExtraPieces(i)} className="text-xs ml-1" style={{ color: 'var(--danger)' }}>✕</button>
                              </div>
                            )}
                            {extraPiecesInvalid && (
                              <p className="text-xs mt-0.5" style={{ color: 'var(--danger)' }}>
                                {t.externalContacts.maxLoosePcs(ppc - 1, ppc)}
                              </p>
                            )}
                            {!isNaN(totalPieces) && totalPieces > 0 && (
                              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                                {t.externalContacts.pcsTotal(totalPieces)}
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
                        {t.externalContacts.availableLabel}: {stockInCartons != null ? (
                          <><span className="font-semibold" style={{ color: 'var(--foreground)' }}>{t.externalContacts.cartonsCount(stockInCartons)}</span> ({t.externalContacts.piecesOnly(item.selectedStock)})</>
                        ) : (
                          <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{t.externalContacts.piecesOnly(item.selectedStock)}</span>
                        )}
                        {overStock && <span style={{ color: 'var(--danger)' }}>{t.externalContacts.exceedsStock}</span>}
                      </p>
                    )}

                    {/* Prices */}
                    {ppc ? (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>
                            {t.externalContacts.cartonPriceWithPpc(ppc)}
                          </label>
                          <input
                            value={item.cartonPrice}
                            onChange={handlePoCartonPriceChange(i)}
                            placeholder={t.externalContacts.cartonPricePlaceholder}
                            type="number" min="0" step="0.01"
                            className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                            style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>{t.externalContacts.unitPricePerPiece}</label>
                          <input
                            value={item.unitPrice}
                            onChange={handlePoUnitPriceChange(i)}
                            placeholder={t.externalContacts.placeholderUnitPrice}
                            type="number" min="0" step="0.01"
                            className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                            style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>{t.externalContacts.unitPrice}</label>
                        <input
                          value={item.unitPrice}
                          onChange={handlePoUnitPriceChange(i)}
                          placeholder={t.externalContacts.placeholderUnitPrice}
                          type="number" min="0" step="0.01"
                          className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                          style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                        />
                      </div>
                    )}

                    {/* Below-cost warning */}
                    {belowCost && (
                      <div className="rounded-lg px-3 py-2 mt-2 text-xs font-medium" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
                        {t.externalContacts.belowCostWarning(formatCurrency(item.unitPrice), formatCurrency(item.unitCost))}
                      </div>
                    )}

                    {/* Line total */}
                    {parseFloat(item.unitPrice) > 0 && !isNaN(totalPieces) && totalPieces > 0 && (
                      <div className="rounded-lg px-3 py-2 mt-2 text-xs" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--muted-foreground)' }}>
                            {t.externalContacts.totalLabel} ({ppc ? <>{cartonQty > 0 ? t.externalContacts.cartonsCount(cartonQty) : ''}{extraPcs > 0 ? `${cartonQty > 0 ? ' + ' : ''}${t.externalContacts.piecesOnly(extraPcs)}` : ''} · {t.externalContacts.piecesOnly(totalPieces)}</> : <>{t.externalContacts.piecesOnly(totalPieces)}</>})
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
                  <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--muted-foreground)' }}>{t.externalContacts.summary}</div>
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
                            {ppc ? <>{q > 0 ? t.externalContacts.cartonsCount(q) : ''}{extra > 0 ? `${q > 0 ? ' + ' : ''}${t.externalContacts.piecesOnly(extra)}` : ''} ({t.externalContacts.piecesOnly(pieces)})</> : <>{t.externalContacts.piecesOnly(pieces)}</>}
                          </span>
                        </span>
                        <span className="font-medium" style={{ color: 'var(--foreground)' }}>{formatCurrency((price * pieces).toFixed(2))}</span>
                      </div>
                    );
                  })}
                  <div className="flex justify-between text-sm font-bold pt-1.5 mt-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
                    <span style={{ color: 'var(--foreground)' }}>{t.externalContacts.grandTotal}</span>
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
              <Field label={t.externalContacts.fieldProductName} value={form.productName} onChange={set('productName')} placeholder={t.externalContacts.placeholderProductName2} />
              <Field label={t.externalContacts.fieldQuantity} value={form.quantity} onChange={set('quantity')} placeholder={t.externalContacts.placeholderQuantity} type="number" />
              <Field label={t.externalContacts.fieldUnitCost} value={form.unitCost} onChange={set('unitCost')} placeholder={t.externalContacts.placeholderUnitCost} type="number" />
              <Field label={t.externalContacts.fieldSellingPrice} value={form.sellingPrice} onChange={set('sellingPrice')} placeholder={t.externalContacts.placeholderSellingPrice} type="number" />
              <Field label={t.externalContacts.fieldCategoryOptional} value={form.category} onChange={set('category')} placeholder={t.externalContacts.placeholderCategory} />
            </>
          )}
          {(modal === 'payment-in' || modal === 'payment-out') && (
            <Field label={t.externalContacts.fieldAmount} value={form.amount} onChange={set('amount')} placeholder={t.externalContacts.placeholderAmount} type="number" />
          )}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>{t.externalContacts.notesOptional}</label>
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
            {t.externalContacts.cancel}
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || (modal === 'product-out' && !canSubmitProductOut)}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: modal === 'product-out' && !canSubmitProductOut ? 'var(--muted-foreground)' : 'var(--primary)' }}
          >
            {mut.isPending ? t.externalContacts.saving : t.externalContacts.save}
          </button>
        </div>
        {mut.isError && (
          <p className="text-xs mt-2 text-center" style={{ color: 'var(--danger)' }}>
            {(mut.error as Error)?.message ?? t.externalContacts.anErrorOccurred}
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
  const { user } = useAuthStore();
  const confirm = useConfirm();
  const [openModal, setOpenModal] = useState<Modal>(null);
  const [printTx, setPrintTx] = useState<ExternalTransaction | null>(null);
  const [printBatch, setPrintBatch] = useState<BatchGroup | null>(null);
  const { data: productsData } = useQuery<{ productName: string; piecesPerCarton: number | null }[]>({
    queryKey: QK.inventoryProducts,
    queryFn: () => inventoryApi.listProducts(),
    staleTime: 60_000,
  });
  const ppcMap = new Map((productsData ?? []).map((p) => [p.productName, p.piecesPerCarton]));

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
    return <div className="p-6 text-center" style={{ color: 'var(--muted-foreground)' }}>{t.externalContacts.loading}</div>;
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
            onClick={async () => {
              const ok = await confirm({
                title: t.confirm.deleteContactTitle(contact.name),
                description: t.confirm.deleteContactDesc,
                confirmLabel: t.confirm.delete,
                variant: 'danger',
              });
              if (ok) deleteContactMutation.mutate();
            }}
            className="text-xs px-3 py-1.5 rounded-lg border"
            style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
          >
            {t.externalContacts.deleteBtn}
          </button>
        </div>

        {/* Balances */}
        <div className="flex gap-6 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          {isDebtor && (
            <div>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{t.externalContacts.colOwesYou}</p>
              <p className="text-xl font-bold" style={{ color: 'var(--success)' }}>{formatCurrency(contact.debtorBalance)}</p>
            </div>
          )}
          {isSupplier && (
            <div>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{t.externalContacts.colYouOwe}</p>
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
              {t.externalContacts.giveProducts}
            </button>
            <button onClick={() => setOpenModal('payment-in')} className="px-4 py-2 rounded-xl text-sm font-medium border transition-all" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              {t.externalContacts.receivePayment}
            </button>
          </>
        )}
        {isSupplier && (
          <>
            <button onClick={() => setOpenModal('product-in')} className="px-4 py-2 rounded-xl text-sm font-medium border transition-all" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              {t.externalContacts.receiveProducts}
            </button>
            <button onClick={() => setOpenModal('payment-out')} className="px-4 py-2 rounded-xl text-sm font-medium border transition-all" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              {t.externalContacts.makePayment}
            </button>
          </>
        )}
      </div>

      {/* Transaction history */}
      <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--foreground)' }}>
        {t.externalContacts.txHistoryWithCount(contact.transactions.length)}
      </h2>
      {contact.transactions.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          <div className="text-4xl mb-2">📋</div>
          <p className="font-medium" style={{ color: 'var(--foreground)' }}>{t.externalContacts.noTransactionsTitle}</p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>{t.externalContacts.noTransactionsDesc}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {buildHistory(contact.transactions).map((node) => {
            if (node.kind === 'batch') {
              const b = node.batch;
              const direction = b.type === 'PRODUCT_OUT' ? 'out' : 'in';
              const label = direction === 'out'
                ? t.externalContacts.gaveNProducts(b.items.length)
                : t.externalContacts.receivedNProducts(b.items.length);
              return (
                <div key={b.batchId} className="rounded-xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  <div className="flex items-start justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex-1">
                      <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                        {label}
                      </p>
                      {b.note && <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{b.note}</p>}
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                        {new Date(b.createdAt).toLocaleDateString()}
                      </p>
                      <div className="mt-1">
                        <ActorPill actor={b.actor} viewerId={user?.id} />
                      </div>
                    </div>
                    <div className="flex items-start gap-3 ml-4">
                      <div className="text-right">
                        <p className="font-bold text-sm" style={{ color: txBadgeColor(b.type) }}>
                          {formatCurrency(b.totalAmount.toFixed(2))}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                          {t.externalContacts.itemsCount(b.items.length)}
                        </p>
                      </div>
                      <button
                        onClick={() => setPrintBatch(b)}
                        className="text-xs px-2 py-1 rounded border mt-0.5"
                        style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }}
                        title={t.print.printBtn}
                      >
                        🖨️
                      </button>
                    </div>
                  </div>
                  <div className="px-4 py-2">
                    {b.items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between py-1 text-xs">
                        <span style={{ color: 'var(--foreground)' }} className="capitalize">
                          {it.productName} ×{it.quantity}
                          {it.unitPrice && (
                            <span className="ml-2" style={{ color: 'var(--muted-foreground)' }}>
                              @ {formatCurrency(it.unitPrice)}
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-2">
                          <span style={{ color: 'var(--muted-foreground)' }}>{formatCurrency(it.amount)}</span>
                          <button
                            onClick={async () => {
                              const ok = await confirm({
                                title: t.confirm.deleteLineItemTitle,
                                description: t.confirm.deleteLineItemDesc,
                                confirmLabel: t.confirm.delete,
                                variant: 'danger',
                              });
                              if (ok) deleteTxMutation.mutate(it.id);
                            }}
                            className="text-[10px] px-1.5 py-0.5 rounded border"
                            style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            const tx = node.tx;
            return (
              <div key={tx.id} className="rounded-xl px-4 py-3 border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                      {txLabel(t, tx.type, tx.productName, tx.quantity)}
                    </p>
                    {tx.type === 'PRODUCT_OUT' && tx.unitPrice && tx.unitCostUsed && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                        {t.externalContacts.costSellPerUnit(formatCurrency(tx.unitCostUsed), formatCurrency(tx.unitPrice))}
                      </p>
                    )}
                    {tx.notes && <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{tx.notes}</p>}
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </p>
                    <div className="mt-1">
                      <ActorPill
                        actor={tx.actor ?? null}
                        viewerId={user?.id}
                        discount={{
                          originalUnitPrice: tx.originalUnitPrice ?? null,
                          discountReason: tx.discountReason ?? null,
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-start gap-3 ml-4">
                    <div className="text-right">
                      <p className="font-bold text-sm" style={{ color: txBadgeColor(tx.type) }}>
                        {formatCurrency(tx.amount)}
                      </p>
                      {tx.profit != null && (
                        <p className="text-xs font-medium mt-0.5" style={{ color: tx.isLoss ? 'var(--danger)' : 'var(--success)' }}>
                          {tx.isLoss ? '▼' : '▲'} {formatCurrency(Math.abs(parseFloat(tx.profit)).toFixed(2))} {t.externalContacts.profit}
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
                      onClick={async () => {
                        const ok = await confirm({
                          title: t.confirm.deleteTxTitle,
                          description: t.confirm.deleteTxDesc,
                          confirmLabel: t.confirm.delete,
                          variant: 'danger',
                        });
                        if (ok) deleteTxMutation.mutate(tx.id);
                      }}
                      className="text-xs px-2 py-1 rounded border mt-0.5"
                      style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                    >
                      {t.externalContacts.deleteBtn}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action modals */}
      <ActionModal modal={openModal} contactId={id} onClose={() => setOpenModal(null)} />
      {contact && (
        <PrintDialog
          open={!!printBatch}
          onClose={() => setPrintBatch(null)}
          buildHtml={(fmt) => {
            const b = printBatch!;
            const direction: 'out' | 'in' = b.type === 'PRODUCT_OUT' ? 'out' : 'in';
            const title = direction === 'out' ? t.print.deliveryNote : t.print.goodsReceivedNote;
            const balance = direction === 'out' ? contact.debtorBalance : contact.supplierBalance;
            return externalBatchHtml({
              contactName: contact.name,
              contactPhone: contact.phone,
              direction,
              createdAt: b.createdAt,
              items: b.items.map((it) => ({
                productName: it.productName ?? '—',
                quantity: it.quantity ?? 0,
                unitPrice: it.unitPrice ?? '0',
                amount: it.amount,
                piecesPerCarton: it.productName ? ppcMap.get(it.productName) ?? null : null,
              })),
              note: b.note,
              balance,
              formatCurrency: fmt,
              t: {
                title,
                contact: t.print.contact,
                phone: t.print.phone,
                date: t.print.date,
                note: t.print.note,
                product: t.print.product,
                qty: t.print.qty,
                unitPrice: t.print.unitPrice,
                total: t.print.total,
                grandTotal: t.print.grandTotal,
                balance: t.print.balance,
                cartonPrice: t.print.cartonPrice,
                pcsPerCarton: t.print.pcsPerCarton,
              },
            });
          }}
        />
      )}
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
              tx: { type: tx.type, productName: tx.productName, quantity: tx.quantity, unitPrice: tx.unitPrice, piecesPerCarton: tx.productName ? ppcMap.get(tx.productName) ?? null : null, amount: tx.amount, createdAt: tx.createdAt, notes: tx.notes },
              balance,
              formatCurrency: fmt,
              t: { title, contact: t.print.contact, phone: t.print.phone, date: t.print.date, product: t.print.product, qty: t.print.qty, unitPrice: t.print.unitPrice, total: t.print.total, balance: t.print.balance, cartonPrice: t.print.cartonPrice, pcsPerCarton: t.print.pcsPerCarton },
            });
          }}
        />
      )}
    </div>
  );
}
