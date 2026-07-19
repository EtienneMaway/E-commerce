'use client';

import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { consignmentsApi, currencyApi, inventoryApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { getErrorMessage } from '../../lib/utils';
import { UserSearchInput } from '../ui/UserSearchInput';
import { useToast } from '../ui/Toast';
import { useT } from '../../lib/i18n';

type EntryCurrency = 'USD' | 'FC';

interface UserOption {
  id: string;
  username: string;
}

interface ProductVariant {
  variantId: string;
  label: string;
  unitCost: string;
  sellingPrice: string;
  piecesPerCarton: number;
  available: number;
}

interface ProductSummary {
  productName: string;
  latestUnitCost: string;
  latestSellingPrice: string;
  latestCartonPrice: string | null;
  piecesPerCarton: number | null;
  totalAvailable: number;
  kind?: 'simple' | 'group';
  groupId?: string;
  cartonSellingPrice?: string | null;
  variants?: ProductVariant[];
}

/** A pickable option — a simple product, or a whole sized-product carton (group). */
interface PickOption {
  key: string;
  productName: string;
  variantId: string | null;
  label: string;
  unitCost: string;
  sellingPrice: string;
  piecesPerCarton: number | null;
  available: number;
  // Whole-carton (group) options:
  isGroup?: boolean;
  groupId?: string;
  cartonSellingPrice?: string | null;
  groupVariants?: ProductVariant[];
}

interface ItemRow {
  productName: string;
  variantId: string | null;
  variantLabel: string | null;
  quantity: string;
  extraPieces: string;
  showExtraPieces: boolean;
  agreedUnitPrice: string;
  cartonPrice: string;
  priceMode: 'manual' | 'pct';
  unitCost: string;
  markupPct: number;
  piecesPerCarton: number | null;
  // Set when giving a whole carton of a sized product. `cartonPrice` holds the
  // per-carton price the mini owes; `quantity` holds the number of cartons.
  groupId: string | null;
  groupVariants: ProductVariant[] | null;
}

/** Full cartons assemblable from a group's per-size stock. */
function cartonsAvailableOf(variants: ProductVariant[]): number {
  const gating = variants.filter((v) => v.piecesPerCarton > 0);
  if (gating.length === 0) return 0;
  return Math.min(...gating.map((v) => Math.floor(v.available / v.piecesPerCarton)));
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** When set, the recipient is locked to this user (e.g. giving to a mini employee) and the search box is hidden. */
  fixedDebtor?: { id: string; username: string };
  /** Optional heading + submit label override (e.g. "Entrust products" for the mini-employee flow). */
  heading?: string;
  submitLabel?: string;
}

const EMPTY_ITEM: ItemRow = {
  productName: '',
  variantId: null,
  variantLabel: null,
  quantity: '',
  extraPieces: '',
  showExtraPieces: false,
  agreedUnitPrice: '',
  cartonPrice: '',
  priceMode: 'manual',
  unitCost: '',
  markupPct: 25,
  piecesPerCarton: null,
  groupId: null,
  groupVariants: null,
};

/** Compute total pieces from cartons + optional extra loose pieces */
function getTotalPieces(cartonQty: number, ppc: number | null, extraPieces: string): number {
  const extra = parseInt(extraPieces, 10) || 0;
  if (ppc && !isNaN(cartonQty)) return cartonQty * ppc + extra;
  return cartonQty;
}

export function SendConsignmentDialog({ open, onClose, fixedDebtor, heading, submitLabel }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [debtor, setDebtor] = useState<UserOption | null>(fixedDebtor ?? null);
  const [note, setNote] = useState('');
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);
  const [error, setError] = useState('');
  const [focusedItemIndex, setFocusedItemIndex] = useState<number | null>(null);
  const [entryCurrency, setEntryCurrency] = useState<EntryCurrency>('USD');

  const { data: products } = useQuery({
    queryKey: QK.inventoryProducts,
    queryFn: inventoryApi.listProducts,
    staleTime: 60_000,
    enabled: open,
  });

  const { data: rateData } = useQuery({
    queryKey: QK.exchangeRate,
    queryFn: currencyApi.getRate,
    staleTime: 5 * 60_000,
    retry: false,
    enabled: open,
  });

  // Outgoing prices use the System Selling Rate (usdToFcRate) so that FC values
  // typed here render back identically through useFormatCurrency later.
  const systemRate = rateData?.usdToFcRate ? parseFloat(rateData.usdToFcRate) : null;
  const isFC = entryCurrency === 'FC';
  const canUseFC = systemRate !== null && systemRate > 0;

  const toUsd = useCallback(
    (value: string): string => {
      if (!value) return value;
      const n = parseFloat(value);
      if (isNaN(n) || n <= 0) return value;
      // Always emit a 4-decimal string: the API's @IsDecimal({ decimal_digits:
      // '1,4' }) rejects whole numbers like "32" (zero decimal digits).
      const usd = isFC && systemRate ? n / systemRate : n;
      return usd.toFixed(4);
    },
    [isFC, systemRate],
  );

  const fromUsd = useCallback(
    (usdValue: string): string => {
      if (!usdValue) return usdValue;
      if (!isFC || !systemRate) return usdValue;
      const n = parseFloat(usdValue);
      if (isNaN(n) || n <= 0) return usdValue;
      return (n * systemRate).toFixed(4);
    },
    [isFC, systemRate],
  );

  const fmtPrice = useCallback(
    (value: string | number) => {
      const n = typeof value === 'string' ? parseFloat(value) : value;
      if (isNaN(n)) return isFC ? '0.0000 FC' : '$0.0000';
      // Truncate to 4dp (don't round) so the displayed figure never overstates the stored amount.
      const truncated = Math.trunc(n * 10000) / 10000;
      if (isFC) return new Intl.NumberFormat('fr-CD', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(truncated) + ' FC';
      return '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(truncated);
    },
    [isFC],
  );

  const switchCurrency = (next: EntryCurrency) => {
    if (next === entryCurrency) return;
    if (next === 'FC' && !canUseFC) return;
    if (!systemRate) {
      setEntryCurrency(next);
      return;
    }
    const factor = next === 'FC' ? systemRate : 1 / systemRate;
    setItems((prev) =>
      prev.map((row) => {
        const convert = (s: string) => {
          if (!s) return s;
          const n = parseFloat(s);
          if (isNaN(n) || n <= 0) return s;
          return (n * factor).toFixed(4);
        };
        return {
          ...row,
          agreedUnitPrice: convert(row.agreedUnitPrice),
          cartonPrice: convert(row.cartonPrice),
          unitCost: convert(row.unitCost),
        };
      }),
    );
    setEntryCurrency(next);
  };

  // Sized products are offered as a single "whole carton" option (all sizes
  // together); simple products stay a single option.
  const getFilteredProducts = (query: string): PickOption[] => {
    const q = query.toLowerCase().trim();
    const out: PickOption[] = [];
    for (const p of (products as ProductSummary[] | undefined) ?? []) {
      if (!p.productName.includes(q)) continue;
      if (p.kind === 'group' && p.variants?.length && p.groupId) {
        // A sized product is given as a WHOLE carton (all sizes together).
        out.push({
          key: 'g:' + p.groupId,
          productName: p.productName,
          variantId: null,
          label: p.productName,
          unitCost: p.latestUnitCost,
          sellingPrice: p.latestSellingPrice,
          piecesPerCarton: null,
          available: cartonsAvailableOf(p.variants),
          isGroup: true,
          groupId: p.groupId,
          cartonSellingPrice: p.cartonSellingPrice ?? null,
          groupVariants: p.variants,
        });
      } else {
        out.push({
          key: p.productName,
          productName: p.productName,
          variantId: null,
          label: p.productName,
          unitCost: p.latestUnitCost,
          sellingPrice: p.latestSellingPrice,
          piecesPerCarton: p.piecesPerCarton,
          available: p.totalAvailable,
        });
      }
    }
    return out;
  };

  const deriveCartonPrice = (unitPrice: string, ppc: number | null): string => {
    const up = parseFloat(unitPrice);
    return !isNaN(up) && up > 0 && ppc ? (up * ppc).toFixed(4) : '';
  };

  const selectProduct = (i: number, p: PickOption) => {
    setItems((prev) =>
      prev.map((row, idx) => {
        if (idx !== i) return row;
        // Whole-carton (sized) product: give all sizes together. cartonPrice
        // holds the per-carton price the mini owes (default = the group's carton
        // price, else the combined size value).
        if (p.isGroup) {
          const combinedUsd = (p.groupVariants ?? []).reduce(
            (s, v) => s + parseFloat(v.sellingPrice) * v.piecesPerCarton,
            0,
          );
          const defaultCartonUsd =
            p.cartonSellingPrice && parseFloat(p.cartonSellingPrice) > 0
              ? p.cartonSellingPrice
              : combinedUsd.toFixed(4);
          return {
            ...row,
            productName: p.productName,
            variantId: null,
            variantLabel: null,
            groupId: p.groupId ?? null,
            groupVariants: p.groupVariants ?? null,
            quantity: '',
            cartonPrice: fromUsd(defaultCartonUsd),
            agreedUnitPrice: '',
            unitCost: '',
            piecesPerCarton: null,
            priceMode: 'manual',
          };
        }
        // Backend values are USD; convert to active currency for editing.
        const unitCost = fromUsd(p.unitCost);
        const agreedUnitPrice =
          row.priceMode === 'pct' && parseFloat(unitCost) > 0
            ? (parseFloat(unitCost) * (1 + row.markupPct / 100)).toFixed(4)
            : fromUsd(p.sellingPrice);
        const ppc = p.piecesPerCarton;
        const cartonPrice = deriveCartonPrice(agreedUnitPrice, ppc);
        return {
          ...row,
          productName: p.productName,
          variantId: p.variantId,
          variantLabel: p.variantId ? p.label : null,
          groupId: null,
          groupVariants: null,
          unitCost,
          agreedUnitPrice,
          cartonPrice,
          piecesPerCarton: ppc,
        };
      })
    );
    setFocusedItemIndex(null);
  };

  const setGroupCartonPrice = (i: number) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setItems((prev) => prev.map((row, idx) => (idx === i ? { ...row, cartonPrice: e.target.value } : row)));

  const setProductName = (i: number, value: string) => {
    setItems((prev) =>
      prev.map((row, idx) =>
        idx === i
          ? { ...row, productName: value, variantId: null, variantLabel: null, groupId: null, groupVariants: null }
          : row,
      )
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
        const agreedUnitPrice = !isNaN(cp) ? (cp / row.piecesPerCarton).toFixed(4) : row.agreedUnitPrice;
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
            ? (cost * (1 + row.markupPct / 100)).toFixed(4)
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
            ? (cost * (1 + row.markupPct / 100)).toFixed(4)
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
            ? (cost * (1 + pct / 100)).toFixed(4)
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
        // A whole-carton (group) row expands to one item per size: quantity =
        // cartons × the size's pieces-per-carton, and the per-carton price the
        // mini owes is split across the sizes by their selling-price share.
        items: items.flatMap((it) => {
          if (it.groupId && it.groupVariants) {
            const cartons = parseInt(it.quantity, 10) || 0;
            const cartonUsd = parseFloat(toUsd(it.cartonPrice)) || 0;
            const totalStd = it.groupVariants.reduce(
              (s, v) => s + parseFloat(v.sellingPrice) * v.piecesPerCarton,
              0,
            );
            return it.groupVariants
              .filter((v) => v.piecesPerCarton > 0)
              .map((v) => ({
                productName: it.productName.trim(),
                variantId: v.variantId,
                quantity: cartons * v.piecesPerCarton,
                agreedUnitPrice: (totalStd > 0
                  ? (cartonUsd * parseFloat(v.sellingPrice)) / totalStd
                  : parseFloat(v.sellingPrice)
                ).toFixed(4),
              }));
          }
          return [
            {
              productName: it.productName.trim(),
              quantity: getTotalPieces(Number(it.quantity), it.piecesPerCarton, it.extraPieces),
              agreedUnitPrice: toUsd(it.agreedUnitPrice),
              ...(it.variantId ? { variantId: it.variantId } : {}),
            },
          ];
        }),
      }),
    onSuccess: () => {
      const sentTo = debtor?.username ?? '';
      const lineCount = items.length;

      // Invalidate everything this write touches. Previously only
      // consignmentsOutgoing was refreshed — so on the employee page, where the
      // mini-oversight panel reads miniActivity, NOTHING on screen changed after
      // a successful send. Combined with the silent close below, that made it
      // look like the action had failed, and the natural response was to send
      // the same goods again.
      qc.invalidateQueries({ queryKey: QK.consignmentsOutgoing });
      qc.invalidateQueries({ queryKey: QK.consignmentsIncoming });
      qc.invalidateQueries({ queryKey: ['mini-settlements'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });

      setDebtor(fixedDebtor ?? null);
      setNote('');
      setItems([{ ...EMPTY_ITEM }]);
      setError('');
      setEntryCurrency('USD');
      onClose();

      // Explicit confirmation. Stock does NOT move yet — it leaves your books
      // only when the recipient confirms — so say that, otherwise "sent" reads
      // as "already handed over".
      toast({
        variant: 'success',
        title: t.consignments.sentToastTitle(sentTo),
        description: t.consignments.sentToastBody(lineCount),
      });
    },
    onError: (err) => {
      const message = getErrorMessage(err);
      setError(message);
      // Also toast it: the dialog scrolls, and on a long item list the inline
      // error can sit off-screen where it is never seen.
      toast({ variant: 'error', title: t.consignments.sentErrorTitle, description: message });
    },
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
    (!isFC || canUseFC) &&
    items.every((it) => {
      if (it.groupId) {
        const cartons = parseInt(it.quantity, 10) || 0;
        return !!it.productName.trim() && cartons > 0 && parseFloat(it.cartonPrice) > 0;
      }
      const totalPcs = getTotalPieces(parseInt(it.quantity, 10), it.piecesPerCarton, it.extraPieces);
      return it.productName.trim() &&
        totalPcs > 0 &&
        it.agreedUnitPrice &&
        parseFloat(it.agreedUnitPrice) > 0;
    });

  // Grand-total helpers that treat a whole-carton (group) row and a simple row
  // uniformly (values in the active entry currency).
  const rowPieces = (it: ItemRow): number => {
    if (it.groupId && it.groupVariants) {
      const cartons = parseInt(it.quantity, 10) || 0;
      return cartons * it.groupVariants.reduce((s, v) => s + v.piecesPerCarton, 0);
    }
    return getTotalPieces(parseInt(it.quantity, 10), it.piecesPerCarton, it.extraPieces);
  };
  const rowTotal = (it: ItemRow): number => {
    if (it.groupId) {
      const cartons = parseInt(it.quantity, 10) || 0;
      return cartons * (parseFloat(it.cartonPrice) || 0);
    }
    const price = parseFloat(it.agreedUnitPrice) || 0;
    const pieces = getTotalPieces(parseInt(it.quantity, 10), it.piecesPerCarton, it.extraPieces);
    return price > 0 && pieces > 0 ? price * pieces : 0;
  };
  const rowHasValue = (it: ItemRow): boolean =>
    it.groupId
      ? parseInt(it.quantity, 10) > 0 && parseFloat(it.cartonPrice) > 0
      : parseFloat(it.agreedUnitPrice) > 0 && parseInt(it.quantity, 10) > 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="w-full max-w-lg rounded-2xl p-6 shadow-xl overflow-y-auto" style={{ background: 'var(--card)', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>{heading ?? t.sendConsignment.title}</h2>
          <button onClick={onClose} style={{ color: 'var(--muted)' }}>✕</button>
        </div>

        <div className="space-y-4">
          {/* Currency toggle (global to the dialog) */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              {t.sendConsignment.enterIn}
            </span>
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
              {(['USD', 'FC'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => switchCurrency(c)}
                  className="px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    background: entryCurrency === c ? (c === 'FC' ? 'var(--warning)' : 'var(--primary)') : 'var(--surface)',
                    color: entryCurrency === c ? '#fff' : 'var(--foreground)',
                    opacity: c === 'FC' && !canUseFC ? 0.4 : 1,
                    cursor: c === 'FC' && !canUseFC ? 'not-allowed' : 'pointer',
                  }}
                >
                  {c === 'USD' ? '$ USD' : 'FC'}
                </button>
              ))}
            </div>
            {isFC && systemRate && (
              <span className="text-xs tabular-nums" style={{ color: 'var(--warning)' }}>
                1$ = {new Intl.NumberFormat('en-US').format(systemRate)} FC
              </span>
            )}
          </div>

          {!canUseFC && isFC && (
            <p className="text-xs" style={{ color: 'var(--warning)' }}>{t.sendConsignment.noSystemRate}</p>
          )}

          {fixedDebtor ? (
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>{t.sendConsignment.debtor}</label>
              <div className="px-3 py-2 rounded-lg text-sm" style={{ background: 'rgba(127,127,127,0.1)', color: 'var(--foreground)' }}>@{fixedDebtor.username}</div>
            </div>
          ) : (
            <UserSearchInput label={t.sendConsignment.debtor} value={debtor} onChange={setDebtor} placeholder={t.userSearch.placeholder} />
          )}

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
                              const sCartons = sPpc ? Math.floor(p.available / sPpc) : null;
                              return (
                                <div
                                  key={p.key}
                                  onMouseDown={(e) => { e.preventDefault(); selectProduct(i, p); }}
                                  className="px-3 py-2 cursor-pointer border-b last:border-b-0"
                                  style={{ borderColor: 'var(--border)' }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--card)')}
                                >
                                  <div className="text-sm font-medium capitalize" style={{ color: 'var(--foreground)' }}>
                                    {p.label}
                                    {sPpc && (
                                      <span className="text-xs font-normal ml-1" style={{ color: 'var(--muted)' }}>
                                        ({sPpc} pcs/carton)
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
                                    <span>
                                      {fmtPrice(fromUsd(p.unitCost))} cost
                                      {sPpc ? <> · {fmtPrice(fromUsd((parseFloat(p.sellingPrice) * sPpc).toFixed(4)))}/carton</> : null}
                                    </span>
                                    <span>
                                      {p.isGroup
                                        ? <>{p.available} cartons</>
                                        : sCartons != null
                                        ? <>{sCartons} cartons ({p.available} pcs)</>
                                        : <>{p.available} {t.sendConsignment.inStock}</>
                                      }
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {item.variantLabel && (
                          <div className="text-xs mt-1 font-medium capitalize" style={{ color: 'var(--primary)' }}>
                            {item.variantLabel}
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <input
                          value={item.quantity}
                          onChange={setQuantity(i)}
                          placeholder={item.groupId || ppc ? 'Cartons' : t.sendConsignment.qtyPlaceholder}
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

                    {item.groupId && item.groupVariants ? (
                      (() => {
                        const gv = item.groupVariants;
                        const cAvail = cartonsAvailableOf(gv);
                        const cartons = parseInt(item.quantity, 10) || 0;
                        const cartonUsd = parseFloat(toUsd(item.cartonPrice)) || 0;
                        const totalStd = gv.reduce((s, v) => s + parseFloat(v.sellingPrice) * v.piecesPerCarton, 0);
                        const exceeds = cartons > cAvail;
                        return (
                          <div className="space-y-2">
                            <p className="text-xs" style={{ color: 'var(--muted)' }}>
                              Available: <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{cAvail} cartons</span>
                              {exceeds && <span style={{ color: 'var(--danger)' }}> — exceeds stock</span>}
                            </p>
                            <div>
                              <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>
                                Price the mini owes per carton
                              </label>
                              <input
                                value={item.cartonPrice}
                                onChange={setGroupCartonPrice(i)}
                                placeholder="0.00"
                                type="number"
                                min="0"
                                step="0.0001"
                                className="input w-full"
                              />
                            </div>
                            {cartons > 0 && (
                              <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                                {gv.map((v) => {
                                  const pieces = cartons * v.piecesPerCarton;
                                  const allocUsd = totalStd > 0 ? (cartonUsd * parseFloat(v.sellingPrice)) / totalStd : parseFloat(v.sellingPrice);
                                  return (
                                    <div key={v.variantId} className="flex justify-between py-0.5">
                                      <span className="capitalize" style={{ color: 'var(--foreground)' }}>
                                        {v.label}<span style={{ color: 'var(--muted)' }}> · {pieces} pcs</span>
                                      </span>
                                      <span style={{ color: 'var(--muted)' }}>owes {fmtPrice(fromUsd(allocUsd.toFixed(4)))}/pc</span>
                                    </div>
                                  );
                                })}
                                <div className="flex justify-between pt-1 mt-1 border-t font-semibold" style={{ borderColor: 'var(--border)' }}>
                                  <span style={{ color: 'var(--foreground)' }}>{cartons} carton{cartons > 1 ? 's' : ''}</span>
                                  <span style={{ color: 'var(--success)' }}>{fmtPrice(fromUsd((cartonUsd * cartons).toFixed(4)))}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <>
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
                              step="0.0001"
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
                            step="0.0001"
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
                          step="0.0001"
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
                              step="0.0001"
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
                            step="0.0001"
                            className="input w-full"
                          />
                        </div>
                      </div>
                    )}

                    {/* Below-cost warning */}
                    {isBelowCost(item) && (
                      <div className="rounded-lg px-3 py-2 mt-2 text-xs font-medium" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
                        Selling price ({fmtPrice(item.agreedUnitPrice)}/pc) is at or below cost ({fmtPrice(item.unitCost)}/pc). You will make a loss on this item.
                      </div>
                    )}

                    {/* Price summary */}
                    {parseFloat(item.agreedUnitPrice) > 0 && (
                      <div className="rounded-lg px-3 py-2 mt-2 text-xs" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--muted)' }}>Per piece</span>
                          <span className="font-medium" style={{ color: 'var(--foreground)' }}>{fmtPrice(item.agreedUnitPrice)}</span>
                        </div>
                        {ppc && (
                          <div className="flex justify-between mt-1">
                            <span style={{ color: 'var(--muted)' }}>Per carton ({ppc} pcs)</span>
                            <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{fmtPrice((parseFloat(item.agreedUnitPrice) * ppc).toFixed(4))}</span>
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
                              {fmtPrice((parseFloat(item.agreedUnitPrice) * totalPieces).toFixed(4))}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Grand total */}
        {items.some(rowHasValue) && (
          <div className="rounded-xl border p-3 mt-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--muted)' }}>Summary</div>
            {items.map((it, i) => {
              if (!rowHasValue(it)) return null;
              const pieces = rowPieces(it);
              const q = parseInt(it.quantity, 10);
              const extra = parseInt(it.extraPieces, 10) || 0;
              const cartonword = it.groupId
                ? `${q} carton${q > 1 ? 's' : ''} (${pieces} pcs)`
                : it.piecesPerCarton
                ? `${q > 0 ? `${q} carton${q > 1 ? 's' : ''}` : ''}${extra > 0 ? `${q > 0 ? ' + ' : ''}${extra} pcs` : ''} (${pieces} pcs)`
                : `${pieces} pcs`;
              return (
                <div key={i} className="flex justify-between text-xs py-0.5">
                  <span style={{ color: 'var(--foreground)' }}>
                    <span className="capitalize">{it.productName}</span>
                    {' '}
                    <span style={{ color: 'var(--muted)' }}>{cartonword}</span>
                  </span>
                  <span className="font-medium" style={{ color: 'var(--foreground)' }}>{fmtPrice(rowTotal(it).toFixed(4))}</span>
                </div>
              );
            })}
            <div className="flex justify-between text-sm font-bold pt-1.5 mt-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--foreground)' }}>
                Grand Total
                <span className="font-normal text-xs ml-1" style={{ color: 'var(--muted)' }}>
                  ({items.reduce((s, it) => s + rowPieces(it), 0)} pcs)
                </span>
              </span>
              <span style={{ color: 'var(--success)' }}>
                {fmtPrice(items.reduce((s, it) => s + rowTotal(it), 0).toFixed(4))}
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
            {mutation.isPending ? t.sendConsignment.submitting : (submitLabel ?? t.sendConsignment.submit)}
          </button>
        </div>
      </div>
    </div>
  );
}
