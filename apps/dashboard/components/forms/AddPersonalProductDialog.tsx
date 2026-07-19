'use client';

import { useState, useMemo, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryApi, currencyApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useToast } from '../ui/Toast';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';

type EntryCurrency = 'USD' | 'FC';

interface Props {
  open: boolean;
  onClose: () => void;
}

const CATEGORIES = [
  'Food & Beverages',
  'Groceries',
  'Snacks & Confectionery',
  'Beverages',
  'Dairy & Eggs',
  'Meat & Poultry',
  'Bakery',
  'Fruits & Vegetables',
  'Frozen Foods',
  'Household Cleaning',
  'Laundry & Detergents',
  'Personal Care',
  'Health & Beauty',
  'Baby Products',
  'Pet Supplies',
  'Kitchen & Dining',
  'Stationery',
  'Electronics',
  'Mobile Accessories',
  'Clothing & Apparel',
  'Footwear',
  'Tools & Hardware',
  'Toys & Games',
  'Other',
] as const;

interface ExistingProduct {
  productName: string;
  category: string | null;
  piecesPerCarton: number | null;
  latestCartonPrice: string | null;
  latestUnitCost: string;
  latestSellingPrice: string;
  /** 'group' = a sized/composite product — excluded from the simple-product picker. */
  kind?: 'simple' | 'group';
}

interface ItemForm {
  productName: string;
  numberOfCartons: string;
  cartonPrice: string;
  piecesPerCarton: string;
  category: string;
  markup: number;
  taxEnabled: boolean;
  taxPercent: number;
  transportEnabled: boolean;
  transportPercent: number;
  inputMode: 'drag' | 'manual';
  selectedExisting: ExistingProduct | null;
}

const EMPTY_ITEM: ItemForm = {
  productName: '',
  numberOfCartons: '',
  cartonPrice: '',
  piecesPerCarton: '',
  category: '',
  markup: 0,
  taxEnabled: false,
  taxPercent: 0,
  transportEnabled: false,
  transportPercent: 0,
  inputMode: 'drag',
  selectedExisting: null,
};

interface ComputedItem {
  unitCost: string;
  cartonSelling: string;
  unitSelling: string;
  totalPieces: number | null;
  totalCost: number;
  totalPercent: number;
}

function computeItem(item: ItemForm): ComputedItem | null {
  const cpRaw = parseFloat(item.cartonPrice);
  const ppc = parseInt(item.piecesPerCarton, 10);
  const cartons = parseInt(item.numberOfCartons, 10);
  if (!cpRaw || cpRaw <= 0 || !ppc || ppc <= 0) return null;

  const totalPercent =
    item.markup +
    (item.taxEnabled ? item.taxPercent : 0) +
    (item.transportEnabled ? item.transportPercent : 0);

  const unitCost = cpRaw / ppc;
  const cartonSelling = cpRaw * (1 + totalPercent / 100);
  const unitSelling = cartonSelling / ppc;
  const totalPieces = cartons > 0 ? cartons * ppc : null;
  const totalCost = cartons > 0 ? cpRaw * cartons : 0;

  return {
    unitCost: unitCost.toFixed(4),
    cartonSelling: cartonSelling.toFixed(4),
    unitSelling: unitSelling.toFixed(4),
    totalPieces,
    totalCost,
    totalPercent,
  };
}

export function AddPersonalProductDialog({ open, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [items, setItems] = useState<ItemForm[]>([{ ...EMPTY_ITEM }]);
  const [entryCurrency, setEntryCurrency] = useState<EntryCurrency>('USD');
  const [focusedItemIndex, setFocusedItemIndex] = useState<number | null>(null);
  const [error, setError] = useState('');

  const { data: rateData } = useQuery({
    queryKey: QK.exchangeRate,
    queryFn: currencyApi.getRate,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const { data: existingProducts } = useQuery<ExistingProduct[]>({
    queryKey: QK.inventoryProducts,
    queryFn: () => inventoryApi.listProducts(),
    staleTime: 30_000,
    enabled: open,
  });

  const sellingRate = rateData?.sellingRate ? parseFloat(rateData.sellingRate) : null;
  const isFC = entryCurrency === 'FC';
  const canUseFC = sellingRate !== null && sellingRate > 0;

  const fmtPrice = useCallback(
    (value: string) => {
      const n = parseFloat(value);
      if (isNaN(n)) return isFC ? '0.0000fc' : '$0.0000';
      if (isFC) return new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n) + 'fc';
      return '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n);
    },
    [isFC],
  );

  const toUsd = useCallback(
    (value: string): string => {
      if (!isFC || !sellingRate) return value;
      return (parseFloat(value) / sellingRate).toFixed(4);
    },
    [isFC, sellingRate],
  );

  const updateItem = useCallback((i: number, patch: Partial<ItemForm>) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }, []);

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  }, []);

  const removeItem = useCallback((i: number) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }, []);

  const pickExisting = useCallback((i: number, p: ExistingProduct) => {
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== i) return it;
        return {
          ...it,
          selectedExisting: p,
          productName: p.productName,
          cartonPrice: p.latestCartonPrice
            ? p.latestCartonPrice
            : p.piecesPerCarton
            ? (parseFloat(p.latestUnitCost) * p.piecesPerCarton).toFixed(4)
            : '',
          piecesPerCarton: p.piecesPerCarton ? String(p.piecesPerCarton) : '',
          category: p.category ?? '',
        };
      }),
    );
    setFocusedItemIndex(null);
  }, []);

  const grandTotal = useMemo(() => {
    let cost = 0;
    let pieces = 0;
    let anyValid = false;
    for (const item of items) {
      const c = computeItem(item);
      if (!c) continue;
      anyValid = true;
      cost += c.totalCost;
      pieces += c.totalPieces ?? 0;
    }
    return anyValid ? { cost: cost.toFixed(4), pieces } : null;
  }, [items]);

  const canSubmit =
    (!isFC || canUseFC) &&
    items.every((item) => {
      const c = computeItem(item);
      return (
        item.productName.trim().length > 0 &&
        item.numberOfCartons.trim().length > 0 &&
        parseInt(item.numberOfCartons, 10) > 0 &&
        c !== null &&
        c.unitCost &&
        c.unitSelling
      );
    });

  const mutation = useMutation({
    mutationFn: () => {
      const payload = items.map((item) => {
        const c = computeItem(item)!;
        const ppc = Number(item.piecesPerCarton);
        const cartons = Number(item.numberOfCartons);
        return {
          productName: item.productName.trim(),
          unitCost: toUsd(c.unitCost),
          sellingPrice: toUsd(c.unitSelling),
          cartonPrice: toUsd(item.cartonPrice),
          quantity: cartons * ppc,
          piecesPerCarton: ppc,
          ...(item.category.trim() ? { category: item.category.trim() } : {}),
        };
      });
      return inventoryApi.addPersonalBulk({ items: payload });
    },
    onSuccess: () => {
      const count = items.length;
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      // Buying stock with owner cash moves the cash position and the inventory
      // valuation the dashboard reports — without this those figures stay stale.
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      resetForm();
      onClose();
      toast({ variant: 'success', title: t.toasts.stockAdded, description: t.toasts.stockAddedBody(count) });
    },
    onError: (err) => {
      const message = getErrorMessage(err);
      setError(message);
      toast({ variant: 'error', title: t.toasts.errorTitle, description: message });
    },
  });

  const resetForm = useCallback(() => {
    setItems([{ ...EMPTY_ITEM }]);
    setEntryCurrency('USD');
    setError('');
    setFocusedItemIndex(null);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="w-full max-w-lg rounded-2xl shadow-xl flex flex-col" style={{ background: 'var(--card)', maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>{t.addProduct.title}</h2>
          <button onClick={() => { resetForm(); onClose(); }} style={{ color: 'var(--muted)' }}>✕</button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {/* Currency toggle (global) */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              {t.addProduct.enterIn}
            </span>
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
              {(['USD', 'FC'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    if (c === 'FC' && !canUseFC) return;
                    setEntryCurrency(c);
                  }}
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
            {isFC && sellingRate && (
              <span className="text-xs tabular-nums" style={{ color: 'var(--warning)' }}>
                1$ = {new Intl.NumberFormat('en-US').format(sellingRate)}fc
              </span>
            )}
          </div>

          {!canUseFC && entryCurrency === 'USD' && !sellingRate && rateData && (
            <p className="text-xs mb-3" style={{ color: 'var(--warning)' }}>{t.addProduct.noSellingRate}</p>
          )}

          {/* Items */}
          <div className="space-y-4">
            {items.map((item, i) => (
              <ItemCard
                key={i}
                index={i}
                item={item}
                isFC={isFC}
                showRemove={items.length > 1}
                onUpdate={(patch) => updateItem(i, patch)}
                onRemove={() => removeItem(i)}
                existingProducts={(existingProducts ?? []).filter((p) => p.kind !== 'group')}
                focused={focusedItemIndex === i}
                onFocus={() => setFocusedItemIndex(i)}
                onBlur={() => setTimeout(() => {
                  setFocusedItemIndex((cur) => (cur === i ? null : cur));
                }, 150)}
                onPickExisting={(p) => pickExisting(i, p)}
                fmtPrice={fmtPrice}
                t={t}
              />
            ))}
          </div>

          {/* Add another product */}
          <button
            type="button"
            onClick={addItem}
            className="mt-3 text-sm font-medium"
            style={{ color: 'var(--primary)' }}
          >
            {t.addProduct.addAnother}
          </button>

          {/* Grand total */}
          {grandTotal && items.length > 1 && (
            <div className="rounded-xl border p-3 mt-4 space-y-1.5" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--muted)' }}>{t.addProduct.grandTotalPieces}</span>
                <span className="font-semibold tabular-nums" style={{ color: 'var(--foreground)' }}>{grandTotal.pieces}</span>
              </div>
              <div className="flex justify-between text-sm pt-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
                <span style={{ color: 'var(--muted)' }}>{t.addProduct.grandTotalCost}</span>
                <span className="font-bold tabular-nums" style={{ color: 'var(--foreground)' }}>{fmtPrice(grandTotal.cost)}</span>
              </div>
            </div>
          )}

          {error && <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex gap-2" style={{ borderColor: 'var(--border)' }}>
          <button onClick={() => { resetForm(); onClose(); }} className="btn btn-secondary flex-1">{t.common.cancel}</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !canSubmit}
            className="btn btn-primary flex-1"
          >
            {mutation.isPending ? t.addProduct.submitting : t.addProduct.submit(items.length)}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Per-item card ────────────────────────────────────────────────────────── */

interface ItemCardProps {
  index: number;
  item: ItemForm;
  isFC: boolean;
  showRemove: boolean;
  onUpdate: (patch: Partial<ItemForm>) => void;
  onRemove: () => void;
  existingProducts: ExistingProduct[];
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onPickExisting: (p: ExistingProduct) => void;
  fmtPrice: (value: string) => string;
  t: ReturnType<typeof useT>;
}

function ItemCard({
  index,
  item,
  isFC,
  showRemove,
  onUpdate,
  onRemove,
  existingProducts,
  focused,
  onFocus,
  onBlur,
  onPickExisting,
  fmtPrice,
  t,
}: ItemCardProps) {
  const matchingProducts = useMemo(() => {
    const q = item.productName.trim().toLowerCase();
    if (!q) return [];
    return existingProducts
      .filter((p) => p.productName.toLowerCase().includes(q))
      .slice(0, 6);
  }, [item.productName, existingProducts]);

  const computed = useMemo(() => computeItem(item), [item]);

  const showSuggestions = focused && matchingProducts.length > 0;

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      {/* Card header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          {t.addProduct.itemLabel(index + 1)}
        </span>
        {showRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs font-medium"
            style={{ color: 'var(--danger)' }}
            aria-label={t.addProduct.removeItem}
          >
            ✕ {t.addProduct.removeItem}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {/* Product name with autocomplete */}
        <Field label={t.addProduct.productName}>
          <div className="relative">
            <input
              value={item.productName}
              onChange={(e) => {
                onUpdate({ productName: e.target.value, selectedExisting: null });
                onFocus();
              }}
              onFocus={onFocus}
              onBlur={onBlur}
              placeholder={t.addProduct.productNamePlaceholder}
              className="input"
              autoComplete="off"
            />
            {showSuggestions && (
              <div
                className="absolute z-10 left-0 right-0 mt-1 rounded-lg border shadow-lg overflow-hidden"
                style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
              >
                <div
                  className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--muted)', background: 'var(--surface)' }}
                >
                  {t.addProduct.suggestionsTitle}
                </div>
                {matchingProducts.map((p) => (
                  <button
                    type="button"
                    key={p.productName}
                    onMouseDown={(e) => { e.preventDefault(); onPickExisting(p); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface)] transition-colors"
                    style={{ color: 'var(--foreground)' }}
                  >
                    <div className="font-medium">
                      {p.productName.charAt(0).toUpperCase() + p.productName.slice(1)}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>
                      {p.category ?? '—'}
                      {p.piecesPerCarton ? ` · ${p.piecesPerCarton} pcs/ctn` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {item.selectedExisting && (
            <p className="text-xs mt-1.5" style={{ color: 'var(--primary)' }}>
              ✓ {t.addProduct.existingProductHint}
            </p>
          )}
        </Field>

        {/* Number of cartons + Purchase price */}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.addProduct.numberOfCartons}>
            <input
              value={item.numberOfCartons}
              onChange={(e) => onUpdate({ numberOfCartons: e.target.value })}
              placeholder={t.addProduct.cartonsPlaceholder}
              type="number"
              min="1"
              className="input"
            />
          </Field>
          <Field label={t.addProduct.cartonPrice}>
            <div className="relative">
              <input
                value={item.cartonPrice}
                onChange={(e) => onUpdate({ cartonPrice: e.target.value })}
                placeholder={t.addProduct.pricePlaceholder}
                type="number"
                min="0"
                step="0.01"
                className="input"
                style={{ paddingRight: '36px' }}
              />
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold"
                style={{ color: isFC ? 'var(--warning)' : 'var(--primary)' }}
              >
                {isFC ? 'fc' : '$'}
              </span>
            </div>
          </Field>
        </div>

        {/* Pieces per carton + Category */}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.addProduct.piecesPerCarton}>
            <input
              value={item.piecesPerCarton}
              onChange={(e) => onUpdate({ piecesPerCarton: e.target.value })}
              placeholder={t.addProduct.piecesPerCartonPlaceholder}
              type="number"
              min="1"
              className="input"
            />
          </Field>
          <Field label={t.addProduct.category}>
            <select
              value={item.category}
              onChange={(e) => onUpdate({ category: e.target.value })}
              className="input"
            >
              <option value="">{t.addProduct.categorySelect}</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              {item.category && !CATEGORIES.includes(item.category as typeof CATEGORIES[number]) && (
                <option value={item.category}>{item.category}</option>
              )}
            </select>
          </Field>
        </div>

        {/* Input mode switch */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
            {t.addProduct.inputModeLabel}
          </span>
          <div
            className="flex rounded-lg overflow-hidden border text-xs font-medium"
            style={{ borderColor: 'var(--border)' }}
            role="tablist"
          >
            {(['drag', 'manual'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={item.inputMode === m}
                onClick={() => {
                  if (m === item.inputMode) return;
                  // Reset percentages when flipping mode (matches original behaviour).
                  onUpdate({ inputMode: m, markup: 0, taxPercent: 0, transportPercent: 0 });
                }}
                className="px-3 py-1.5 transition-colors"
                style={{
                  background: item.inputMode === m ? 'var(--primary)' : 'var(--surface)',
                  color: item.inputMode === m ? '#fff' : 'var(--foreground)',
                }}
              >
                {m === 'drag' ? t.addProduct.inputModeDrag : t.addProduct.inputModeManual}
              </button>
            ))}
          </div>
        </div>

        {/* Markup */}
        <PercentSlider
          mode={item.inputMode}
          label={t.addProduct.markup}
          value={item.markup}
          onChange={(v) => onUpdate({ markup: v })}
        />

        {/* Tax toggle + slider */}
        <ToggleSlider
          mode={item.inputMode}
          label={t.addProduct.tax}
          toggleLabel={t.addProduct.includeTax}
          enabled={item.taxEnabled}
          onToggle={(v) => onUpdate({ taxEnabled: v })}
          value={item.taxPercent}
          onChange={(v) => onUpdate({ taxPercent: v })}
        />

        {/* Transport toggle + slider */}
        <ToggleSlider
          mode={item.inputMode}
          label={t.addProduct.transport}
          toggleLabel={t.addProduct.includeTransport}
          enabled={item.transportEnabled}
          onToggle={(v) => onUpdate({ transportEnabled: v })}
          value={item.transportPercent}
          onChange={(v) => onUpdate({ transportPercent: v })}
        />

        {/* Computed price breakdown */}
        {computed && (
          <div
            className="rounded-xl p-3 space-y-1.5 border"
            style={{
              background: isFC ? 'var(--warning-light)' : 'var(--card)',
              borderColor: isFC ? 'rgba(var(--warning-rgb), 0.25)' : 'var(--border)',
            }}
          >
            {computed.totalPieces && (
              <ComputedRow label={t.addProduct.totalPieces} value={`${computed.totalPieces}`} />
            )}
            <ComputedRow label={t.addProduct.computedUnitCost} value={fmtPrice(computed.unitCost)} />
            <ComputedRow label={t.addProduct.computedCartonSelling} value={fmtPrice(computed.cartonSelling)} />
            <ComputedRow label={t.addProduct.computedUnitSelling} value={fmtPrice(computed.unitSelling)} highlight />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Percent slider ──────────────────────────────────────────────────────── */

function PercentSlider({
  label,
  value,
  onChange,
  mode = 'drag',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  mode?: 'drag' | 'manual';
}) {
  const handleManualChange = (raw: string) => {
    if (raw === '') {
      onChange(0);
      return;
    }
    const n = Math.max(0, Math.min(100, Number(raw)));
    if (!Number.isNaN(n)) onChange(n);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</span>
        {mode === 'drag' && (
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--primary)' }}>{value}%</span>
        )}
      </div>
      {mode === 'drag' ? (
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="percent-slider"
        />
      ) : (
        <div className="relative">
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={value === 0 ? '' : value}
            placeholder="0"
            onChange={(e) => handleManualChange(e.target.value)}
            className="w-full px-3 py-2 pr-8 rounded-lg text-sm border outline-none tabular-nums"
            style={{
              background: 'var(--input)',
              borderColor: 'var(--border)',
              color: 'var(--foreground)',
            }}
          />
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold pointer-events-none"
            style={{ color: 'var(--muted)' }}
          >
            %
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Toggle + slider combo ───────────────────────────────────────────────── */

interface ToggleSliderProps {
  label: string;
  toggleLabel: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  value: number;
  onChange: (v: number) => void;
  mode?: 'drag' | 'manual';
}

function ToggleSlider({ label, toggleLabel, enabled, onToggle, value, onChange, mode = 'drag' }: ToggleSliderProps) {
  return (
    <div
      className="rounded-xl p-3 border transition-colors"
      style={{
        borderColor: enabled ? 'var(--primary)' : 'var(--border)',
        background: enabled ? 'rgba(var(--primary-rgb), 0.04)' : 'transparent',
      }}
    >
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onToggle(!enabled)}
          className="toggle-switch"
          data-on={enabled || undefined}
        >
          <span className="toggle-thumb" />
        </button>
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{toggleLabel}</span>
      </label>
      {enabled && (
        <div className="mt-3">
          <PercentSlider label={label} value={value} onChange={onChange} mode={mode} />
        </div>
      )}
    </div>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</label>
      {children}
    </div>
  );
}

function ComputedRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ color: highlight ? 'var(--foreground)' : 'var(--muted)', fontWeight: highlight ? 600 : 400 }}>{value}</span>
    </div>
  );
}
