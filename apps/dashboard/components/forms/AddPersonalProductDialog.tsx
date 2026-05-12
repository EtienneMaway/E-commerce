'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryApi, currencyApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';

type EntryCurrency = 'USD' | 'FC';

interface Props {
  open: boolean;
  onClose: () => void;
}

const EMPTY = {
  productName: '',
  numberOfCartons: '',
  cartonPrice: '',
  piecesPerCarton: '',
  category: '',
};

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
}

export function AddPersonalProductDialog({ open, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [entryCurrency, setEntryCurrency] = useState<EntryCurrency>('USD');
  const [markup, setMarkup] = useState(0);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxPercent, setTaxPercent] = useState(0);
  const [transportEnabled, setTransportEnabled] = useState(false);
  const [transportPercent, setTransportPercent] = useState(0);
  const [inputMode, setInputMode] = useState<'drag' | 'manual'>('drag');
  const [error, setError] = useState('');
  const [selectedExisting, setSelectedExisting] = useState<ExistingProduct | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Fetch selling rate for FC conversion
  const { data: rateData } = useQuery({
    queryKey: QK.exchangeRate,
    queryFn: currencyApi.getRate,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Fetch existing products for autocomplete
  const { data: existingProducts } = useQuery<ExistingProduct[]>({
    queryKey: QK.inventoryProducts,
    queryFn: () => inventoryApi.listProducts(),
    staleTime: 30_000,
    enabled: open,
  });

  const matchingProducts = useMemo(() => {
    const q = form.productName.trim().toLowerCase();
    if (!q || !existingProducts) return [];
    return existingProducts
      .filter((p) => p.productName.toLowerCase().includes(q))
      .slice(0, 6);
  }, [form.productName, existingProducts]);

  // Close suggestions when clicking outside
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function pickExisting(p: ExistingProduct) {
    setSelectedExisting(p);
    setForm((f) => ({
      ...f,
      productName: p.productName,
      cartonPrice: p.latestCartonPrice
        ? p.latestCartonPrice
        : p.piecesPerCarton
        ? (parseFloat(p.latestUnitCost) * p.piecesPerCarton).toFixed(2)
        : '',
      piecesPerCarton: p.piecesPerCarton ? String(p.piecesPerCarton) : '',
      category: p.category ?? '',
    }));
    setShowSuggestions(false);
  }

  const sellingRate = rateData?.sellingRate ? parseFloat(rateData.sellingRate) : null;
  const isFC = entryCurrency === 'FC';
  const canUseFC = sellingRate !== null && sellingRate > 0;

  const fmtPrice = useCallback(
    (value: string) => {
      const n = parseFloat(value);
      if (isNaN(n)) return isFC ? '0fc' : '$0.00';
      if (isFC) return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n) + 'fc';
      return '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    },
    [isFC],
  );

  const totalPercent = markup + (taxEnabled ? taxPercent : 0) + (transportEnabled ? transportPercent : 0);

  const computed = useMemo(() => {
    const cpRaw = parseFloat(form.cartonPrice);
    const ppc = parseInt(form.piecesPerCarton, 10);
    const cartons = parseInt(form.numberOfCartons, 10);

    if (!cpRaw || cpRaw <= 0 || !ppc || ppc <= 0) return null;

    // All display values stay in the entry currency
    const unitCost = cpRaw / ppc;
    const cartonSelling = cpRaw * (1 + totalPercent / 100);
    const unitSelling = cartonSelling / ppc;
    const totalPieces = cartons > 0 ? cartons * ppc : null;

    return {
      unitCost: unitCost.toFixed(2),
      cartonSelling: cartonSelling.toFixed(2),
      unitSelling: unitSelling.toFixed(2),
      totalPieces,
    };
  }, [form.cartonPrice, form.piecesPerCarton, form.numberOfCartons, totalPercent]);

  // Convert a value from entry currency to USD for the backend
  const toUsd = useCallback(
    (value: string): string => {
      if (!isFC || !sellingRate) return value;
      return (parseFloat(value) / sellingRate).toFixed(2);
    },
    [isFC, sellingRate],
  );

  const canSubmit =
    form.productName.trim() &&
    form.numberOfCartons &&
    parseInt(form.numberOfCartons, 10) > 0 &&
    computed?.unitCost &&
    computed?.unitSelling &&
    (!isFC || canUseFC);

  const mutation = useMutation({
    mutationFn: () => {
      const ppc = Number(form.piecesPerCarton);
      const cartons = Number(form.numberOfCartons);
      return inventoryApi.addPersonal({
        productName: form.productName.trim(),
        unitCost: toUsd(computed!.unitCost),
        sellingPrice: toUsd(computed!.unitSelling),
        cartonPrice: toUsd(form.cartonPrice),
        quantity: cartons * ppc,
        piecesPerCarton: ppc,
        ...(form.category.trim() ? { category: form.category.trim() } : {}),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      resetForm();
      onClose();
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const resetForm = useCallback(() => {
    setForm(EMPTY);
    setEntryCurrency('USD');
    setMarkup(0);
    setTaxEnabled(false);
    setTaxPercent(0);
    setTransportEnabled(false);
    setTransportPercent(0);
    setError('');
    setSelectedExisting(null);
    setShowSuggestions(false);
  }, []);

  const set =
    (k: keyof typeof EMPTY) =>
    (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="w-full max-w-md rounded-2xl p-6 shadow-xl overflow-y-auto" style={{ background: 'var(--card)', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>{t.addProduct.title}</h2>
          <button onClick={() => { resetForm(); onClose(); }} style={{ color: 'var(--muted)' }}>✕</button>
        </div>

        <div className="space-y-4">
          {/* Currency toggle */}
          <div className="flex items-center gap-3">
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
            <p className="text-xs" style={{ color: 'var(--warning)' }}>{t.addProduct.noSellingRate}</p>
          )}

          {/* Product name with autocomplete */}
          <Field label={t.addProduct.productName}>
            <div className="relative" ref={suggestionsRef}>
              <input
                value={form.productName}
                onChange={(e) => {
                  setForm((f) => ({ ...f, productName: e.target.value }));
                  setSelectedExisting(null);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder={t.addProduct.productNamePlaceholder}
                className="input"
                autoComplete="off"
              />
              {showSuggestions && matchingProducts.length > 0 && (
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
                      onClick={() => pickExisting(p)}
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
            {selectedExisting && (
              <p
                className="text-xs mt-1.5"
                style={{ color: 'var(--primary)' }}
              >
                ✓ {t.addProduct.existingProductHint}
              </p>
            )}
          </Field>

          {/* Number of cartons + Purchase price */}
          <div className="grid grid-cols-2 gap-4">
            <Field label={t.addProduct.numberOfCartons}>
              <input value={form.numberOfCartons} onChange={set('numberOfCartons')} placeholder={t.addProduct.cartonsPlaceholder} type="number" min="1" className="input" />
            </Field>
            <Field label={t.addProduct.cartonPrice}>
              <div className="relative">
                <input
                  value={form.cartonPrice}
                  onChange={set('cartonPrice')}
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
          <div className="grid grid-cols-2 gap-4">
            <Field label={t.addProduct.piecesPerCarton}>
              <input value={form.piecesPerCarton} onChange={set('piecesPerCarton')} placeholder={t.addProduct.piecesPerCartonPlaceholder} type="number" min="1" className="input" />
            </Field>
            <Field label={t.addProduct.category}>
              <select value={form.category} onChange={set('category')} className="input">
                <option value="">{t.addProduct.categorySelect}</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                {form.category && !CATEGORIES.includes(form.category as typeof CATEGORIES[number]) && (
                  <option value={form.category}>{form.category}</option>
                )}
              </select>
            </Field>
          </div>

          {/* Input mode switch — flips all three percentage rows between drag and manual entry */}
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
                  aria-selected={inputMode === m}
                  onClick={() => {
                    if (m === inputMode) return;
                    setInputMode(m);
                    // Reset all three to 0 when flipping mode, per the requested behaviour.
                    setMarkup(0);
                    setTaxPercent(0);
                    setTransportPercent(0);
                  }}
                  className="px-3 py-1.5 transition-colors"
                  style={{
                    background: inputMode === m ? 'var(--primary)' : 'var(--surface)',
                    color: inputMode === m ? '#fff' : 'var(--foreground)',
                  }}
                >
                  {m === 'drag' ? t.addProduct.inputModeDrag : t.addProduct.inputModeManual}
                </button>
              ))}
            </div>
          </div>

          {/* Markup */}
          <PercentSlider mode={inputMode} label={t.addProduct.markup} value={markup} onChange={setMarkup} />

          {/* Tax toggle + slider */}
          <ToggleSlider
            mode={inputMode}
            label={t.addProduct.tax}
            toggleLabel={t.addProduct.includeTax}
            enabled={taxEnabled}
            onToggle={setTaxEnabled}
            value={taxPercent}
            onChange={setTaxPercent}
          />

          {/* Transport toggle + slider */}
          <ToggleSlider
            mode={inputMode}
            label={t.addProduct.transport}
            toggleLabel={t.addProduct.includeTransport}
            enabled={transportEnabled}
            onToggle={setTransportEnabled}
            value={transportPercent}
            onChange={setTransportPercent}
          />

          {/* Computed price breakdown */}
          {computed && (
            <div
              className="rounded-xl p-3 space-y-1.5 border"
              style={{
                background: isFC ? 'var(--warning-light)' : 'var(--surface)',
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

        {error && <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={() => { resetForm(); onClose(); }} className="btn btn-secondary flex-1">{t.common.cancel}</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !canSubmit}
            className="btn btn-primary flex-1"
          >
            {mutation.isPending ? t.addProduct.submitting : t.addProduct.submit}
          </button>
        </div>
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
