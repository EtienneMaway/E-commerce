'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { currencyApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { formatMoney } from '../../lib/currency';
import { useCurrencyStore, type DisplayCurrency } from '../../store/currency.store';
import { openPrintWindow } from '../../lib/print';
import { useT } from '../../lib/i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with a formatCurrency function bound to the chosen currency. Return HTML string. */
  buildHtml: (formatCurrency: (v: string | number) => string) => string;
}

export function PrintDialog({ open, onClose, buildHtml }: Props) {
  const t = useT();
  const { displayCurrency } = useCurrencyStore();
  const [currency, setCurrency] = useState<DisplayCurrency>(displayCurrency);

  const { data: rateData } = useQuery({
    queryKey: QK.exchangeRate,
    queryFn: currencyApi.getRate,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const rate = rateData?.usdToFcRate ?? '1';
  const canUseFC = parseFloat(rate) > 1;

  if (!open) return null;

  function handlePrint() {
    const fmt = (v: string | number) => formatMoney(v, currency, rate);
    const html = buildHtml(fmt);
    openPrintWindow(html);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-xs rounded-t-2xl sm:rounded-2xl p-6 shadow-xl"
        style={{ background: 'var(--card)' }}
      >
        <h2
          className="text-base font-bold mb-4"
          style={{ color: 'var(--foreground)' }}
        >
          {t.print.printBtn}
        </h2>

        <div className="mb-4">
          <label
            className="block text-xs font-semibold mb-2 uppercase tracking-wide"
            style={{ color: 'var(--muted)' }}
          >
            {t.print.chooseCurrency}
          </label>
          <div
            className="flex rounded-lg overflow-hidden border"
            style={{ borderColor: 'var(--border)' }}
          >
            {(['USD', 'FC'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  if (c === 'FC' && !canUseFC) return;
                  setCurrency(c);
                }}
                className="flex-1 px-4 py-2.5 text-sm font-semibold transition-colors"
                style={{
                  background:
                    currency === c
                      ? c === 'FC'
                        ? 'var(--warning)'
                        : 'var(--primary)'
                      : 'var(--surface)',
                  color: currency === c ? '#fff' : 'var(--foreground)',
                  opacity: c === 'FC' && !canUseFC ? 0.4 : 1,
                  cursor: c === 'FC' && !canUseFC ? 'not-allowed' : 'pointer',
                }}
              >
                {c === 'USD' ? '$ USD' : 'FC'}
              </button>
            ))}
          </div>
          {currency === 'FC' && canUseFC && (
            <p
              className="text-xs mt-1.5 tabular-nums"
              style={{ color: 'var(--warning)' }}
            >
              1$ = {new Intl.NumberFormat('en-US').format(parseFloat(rate))} FC
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="btn btn-secondary flex-1">
            {t.common.cancel}
          </button>
          <button onClick={handlePrint} className="btn btn-primary flex-1">
            🖨️ {t.print.printBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
