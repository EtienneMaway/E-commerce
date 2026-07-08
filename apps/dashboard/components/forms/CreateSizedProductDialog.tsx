'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryApi, productGroupsApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { getErrorMessage } from '../../lib/utils';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import type { GroupStockTarget } from './AddGroupStockDialog';

// Same category list simple products use (AddPersonalProductDialog).
const CATEGORIES = [
  'Food & Beverages', 'Groceries', 'Snacks & Confectionery', 'Beverages',
  'Dairy & Eggs', 'Meat & Poultry', 'Bakery', 'Fruits & Vegetables', 'Frozen Foods',
  'Household Cleaning', 'Laundry & Detergents', 'Personal Care', 'Health & Beauty',
  'Baby Products', 'Pet Supplies', 'Kitchen & Dining', 'Stationery', 'Electronics',
  'Mobile Accessories', 'Clothing & Apparel', 'Footwear', 'Tools & Hardware',
  'Toys & Games', 'Other',
] as const;

interface SizeForm {
  label: string;
  sellingPrice: string;
}

/** Shape of a sized product row from GET /inventory/products (used for restock detection). */
interface GroupRow {
  productName: string;
  category: string | null;
  kind?: 'simple' | 'group';
  groupId?: string;
  variants?: { variantId: string; label: string; piecesPerCarton: number }[];
}

const EMPTY_SIZE: SizeForm = { label: '', sellingPrice: '' };

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called when the typed name matches an existing sized product — the parent
   *  opens the Add-stock dialog for it instead of creating a duplicate. */
  onRestock?: (group: GroupStockTarget) => void;
}

export function CreateSizedProductDialog({ open, onClose, onRestock }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const formatCurrency = useFormatCurrency();

  const [name, setName] = useState('');
  const [nameFocused, setNameFocused] = useState(false);
  const [category, setCategory] = useState('');
  const [cartonPrice, setCartonPrice] = useState('');
  const [cartonCost, setCartonCost] = useState('');
  const [cartons, setCartons] = useState('');
  const [sizes, setSizes] = useState<SizeForm[]>([{ ...EMPTY_SIZE }]);
  const [error, setError] = useState<string | null>(null);

  // Existing sized products, for name autocomplete + restock detection.
  const { data: productsData } = useQuery({
    queryKey: QK.inventoryProducts,
    queryFn: () => inventoryApi.listProducts(),
    staleTime: 60_000,
    enabled: open,
  });
  const existingGroups = ((productsData as GroupRow[] | undefined) ?? []).filter(
    (p) => p.kind === 'group' && p.groupId,
  );
  const nameQuery = name.trim().toLowerCase();
  const matchingGroups = nameQuery
    ? existingGroups.filter((g) => g.productName.toLowerCase().includes(nameQuery))
    : [];
  const exactMatch = existingGroups.find((g) => g.productName.toLowerCase() === nameQuery) ?? null;

  const toTarget = (g: GroupRow): GroupStockTarget => ({
    id: g.groupId!,
    name: g.productName,
    variants: (g.variants ?? []).map((v) => ({
      variantId: v.variantId,
      label: v.label,
      piecesPerCarton: v.piecesPerCarton,
    })),
  });
  const pickExisting = (g: GroupRow) => {
    setNameFocused(false);
    onRestock?.(toTarget(g));
  };

  function reset() {
    setName('');
    setCategory('');
    setCartonPrice('');
    setCartonCost('');
    setCartons('');
    setSizes([{ ...EMPTY_SIZE }]);
    setError(null);
  }

  function updateSize(i: number, patch: Partial<SizeForm>) {
    setSizes((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  const validSizes = sizes.filter((s) => s.label.trim() && parseFloat(s.sellingPrice) > 0);

  // A carton holds one of each size (pieces-per-carton = 1), so the combined
  // standalone value of one carton is just the sum of the size prices.
  const combined = useMemo(
    () => validSizes.reduce((sum, s) => sum + parseFloat(s.sellingPrice), 0),
    [validSizes],
  );
  const cartonNum = parseFloat(cartonPrice);
  const hasCarton = cartonPrice.trim() !== '' && cartonNum > 0;
  const costNum = parseFloat(cartonCost);
  const hasCost = cartonCost.trim() !== '' && costNum > 0;
  const saving = hasCarton ? combined - cartonNum : 0;
  // The carton must sell for more than it costs.
  const sellBelowBuy = hasCarton && hasCost && cartonNum <= costNum;

  const canSubmit = name.trim().length >= 2 && validSizes.length > 0 && !sellBelowBuy;

  const mutation = useMutation({
    mutationFn: async () => {
      const created = (await productGroupsApi.create({
        name: name.trim(),
        ...(category.trim() ? { category: category.trim() } : {}),
        ...(hasCarton ? { cartonSellingPrice: cartonNum.toFixed(4) } : {}),
        ...(hasCost ? { cartonBuyingPrice: costNum.toFixed(4) } : {}),
        variants: validSizes.map((s, i) => ({
          label: s.label.trim(),
          sellingPrice: parseFloat(s.sellingPrice).toFixed(4),
          // One of each size per carton for now (the pcs/carton field is hidden).
          piecesPerCarton: 1,
          sortOrder: i,
        })),
      })) as { id: string; variants?: { id: string; piecesPerCarton: number }[] };

      // Seed initial stock: N cartons → N × each size's pieces-per-carton.
      const n = parseInt(cartons, 10);
      if (Number.isFinite(n) && n > 0 && created.variants?.length) {
        const items = created.variants
          .filter((v) => v.piecesPerCarton > 0)
          .map((v) => ({ variantId: v.id, quantity: n * v.piecesPerCarton }));
        if (items.length) await productGroupsApi.addStock(created.id, { items });
      }
      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: QK.productGroups });
      reset();
      onClose();
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-xl flex flex-col"
        style={{ background: 'var(--card)', maxHeight: '90vh' }}
      >
        <div
          className="flex items-center justify-between px-6 py-5 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
            {t.sizedProducts.createTitle}
          </h2>
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            style={{ color: 'var(--muted)' }}
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          <div>
            <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
              {t.sizedProducts.nameLabel} *
            </label>
            <div className="relative">
              <input
                className="input mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setTimeout(() => setNameFocused(false), 150)}
                placeholder={t.sizedProducts.namePlaceholder}
                autoComplete="off"
              />
              {nameFocused && matchingGroups.length > 0 && (
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
                  {matchingGroups.map((g) => (
                    <button
                      type="button"
                      key={g.groupId}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickExisting(g);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface)] transition-colors"
                      style={{ color: 'var(--foreground)' }}
                    >
                      <div className="font-medium capitalize">{g.productName}</div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>
                        {g.category ?? '—'} · {(g.variants ?? []).length} {t.sizedProducts.expandHint}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {exactMatch && (
              <p className="text-xs mt-1" style={{ color: 'var(--primary)' }}>
                {t.sizedProducts.restockHint}
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
              {t.sizedProducts.categoryLabel}
            </label>
            <select
              className="input mt-1"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">{t.addProduct.categorySelect}</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {category && !CATEGORIES.includes(category as (typeof CATEGORIES)[number]) && (
                <option value={category}>{category}</option>
              )}
            </select>
          </div>

          {/* Carton buying + selling price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                {t.sizedProducts.cartonBuyingLabel}
              </label>
              <input
                className="input mt-1"
                inputMode="decimal"
                value={cartonCost}
                onChange={(e) => setCartonCost(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                {t.sizedProducts.cartonPriceLabel}
              </label>
              <input
                className="input mt-1"
                inputMode="decimal"
                value={cartonPrice}
                onChange={(e) => setCartonPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {t.sizedProducts.cartonPriceHint}
          </p>
          {sellBelowBuy && (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>
              {t.sizedProducts.sellAboveBuyError}
            </p>
          )}

          {/* How many cartons in stock now */}
          <div>
            <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
              {t.sizedProducts.cartonsInStockLabel}
            </label>
            <input
              className="input mt-1"
              inputMode="numeric"
              value={cartons}
              onChange={(e) => setCartons(e.target.value)}
              placeholder="0"
            />
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              {t.sizedProducts.cartonsInStockHint}
            </p>
          </div>

          {/* Sizes */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                {t.sizedProducts.sizesLabel}
              </span>
            </div>
            <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
              {t.sizedProducts.sizesHint}
            </p>
            <div className="space-y-2">
              {sizes.map((s, i) => (
                <div
                  key={i}
                  className="rounded-xl border p-3"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
                >
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="text-[11px]" style={{ color: 'var(--muted)' }}>
                        {t.sizedProducts.sizeNameLabel}
                      </label>
                      <input
                        className="input mt-0.5"
                        value={s.label}
                        onChange={(e) => updateSize(i, { label: e.target.value })}
                        placeholder={t.sizedProducts.sizeLabelPlaceholder}
                      />
                    </div>
                    <div style={{ width: '7rem' }}>
                      <label className="text-[11px]" style={{ color: 'var(--muted)' }}>
                        {t.sizedProducts.priceLabel}
                      </label>
                      <input
                        className="input mt-0.5"
                        inputMode="decimal"
                        value={s.sellingPrice}
                        onChange={(e) => updateSize(i, { sellingPrice: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    {sizes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setSizes((prev) => prev.filter((_, idx) => idx !== i))}
                        className="text-xs pb-2.5"
                        style={{ color: 'var(--danger)' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSizes((prev) => [...prev, { ...EMPTY_SIZE }])}
              className="mt-2 text-sm font-medium"
              style={{ color: 'var(--primary)' }}
            >
              {t.sizedProducts.addSizeBtn}
            </button>
          </div>

          {/* Carton math preview */}
          {validSizes.length > 0 && (
            <div
              className="rounded-xl border p-3 space-y-1.5"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              {hasCost && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--muted)' }}>{t.sizedProducts.cartonBuyingShort}</span>
                  <span className="font-semibold tabular-nums" style={{ color: 'var(--foreground)' }}>
                    {formatCurrency(costNum.toFixed(4))}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--muted)' }}>{t.sizedProducts.combinedLabel}</span>
                <span className="font-semibold tabular-nums" style={{ color: 'var(--foreground)' }}>
                  {formatCurrency(combined.toFixed(4))}
                </span>
              </div>
              {hasCarton && (
                <>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--muted)' }}>{t.sizedProducts.cartonPriceLabelShort}</span>
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--foreground)' }}>
                      {formatCurrency(cartonNum.toFixed(4))}
                    </span>
                  </div>
                  <div
                    className="flex justify-between text-sm pt-1.5 border-t"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <span style={{ color: 'var(--muted)' }}>{t.sizedProducts.discountLabel}</span>
                    <span
                      className="font-bold tabular-nums"
                      style={{ color: saving >= 0 ? 'var(--success)' : 'var(--danger)' }}
                    >
                      {formatCurrency(saving.toFixed(4))}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t flex gap-2" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            className="btn btn-secondary flex-1"
          >
            {t.common.cancel}
          </button>
          <button
            onClick={() => {
              setError(null);
              // Typed name matches an existing sized product → restock it instead
              // of creating a duplicate (the API would reject the duplicate name).
              if (exactMatch && onRestock) {
                onRestock(toTarget(exactMatch));
                return;
              }
              if (!canSubmit) {
                setError(t.sizedProducts.needOneSize);
                return;
              }
              mutation.mutate();
            }}
            disabled={mutation.isPending || (!exactMatch && !canSubmit)}
            className="btn btn-primary flex-1"
          >
            {exactMatch
              ? t.sizedProducts.restockBtn
              : mutation.isPending
                ? t.sizedProducts.createSubmitting
                : t.sizedProducts.createSubmit}
          </button>
        </div>
      </div>
    </div>
  );
}
