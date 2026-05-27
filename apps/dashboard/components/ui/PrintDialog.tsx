'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { currencyApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { formatMoney } from '../../lib/currency';
import { useCurrencyStore, type DisplayCurrency } from '../../store/currency.store';
import { openPrintWindow } from '../../lib/print';
import { useT } from '../../lib/i18n';
import { usePrinterStore } from '../../store/printer.store';
import {
  isWebBluetoothSupported,
  printReceiptToBluetooth,
} from '../../lib/bluetooth-printer';
import { buildThermalReceiptHtml, type ReceiptData } from '../../lib/thermal-receipt';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Standard wider HTML for browser/system print. */
  buildHtml: (formatCurrency: (v: string | number) => string) => string;
  /**
   * Optional thermal receipt data builder. When provided, the dialog shows
   * a second "🖨 Thermal" action that routes to either:
   *   - the paired Bluetooth printer (sends ESC/POS bytes directly), or
   *   - a 80mm system-print fallback window if no printer is paired (or
   *     the browser doesn't support Web Bluetooth).
   * The mobile app uses the same data + encoder, so the printout matches.
   */
  buildReceiptData?: (rate: string) => ReceiptData;
}

export function PrintDialog({ open, onClose, buildHtml, buildReceiptData }: Props) {
  const t = useT();
  const { displayCurrency } = useCurrencyStore();
  const [currency, setCurrency] = useState<DisplayCurrency>(displayCurrency);
  const [thermalState, setThermalState] = useState<'idle' | 'printing' | 'error'>('idle');
  const [thermalError, setThermalError] = useState('');
  const pairedPrinter = usePrinterStore((s) => s.printer);

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
    const printDp = currency === 'FC' ? 0 : 4;
    const fmt = (v: string | number) => formatMoney(v, currency, rate, printDp);
    const html = buildHtml(fmt);
    openPrintWindow(html);
    onClose();
  }

  async function handleThermalPrint() {
    if (!buildReceiptData) return;
    const data = buildReceiptData(rate);
    // No paired printer (or Web Bluetooth not supported) → fall back to
    // opening the same 80mm HTML in a print window. The output matches the
    // mobile app's expo-print fallback.
    if (!pairedPrinter || !isWebBluetoothSupported()) {
      openPrintWindow(buildThermalReceiptHtml(data));
      onClose();
      return;
    }
    setThermalState('printing');
    setThermalError('');
    try {
      await printReceiptToBluetooth(pairedPrinter, data);
      setThermalState('idle');
      onClose();
    } catch (err) {
      setThermalState('error');
      setThermalError(err instanceof Error ? err.message : 'Print failed');
    }
  }

  const showThermal = !!buildReceiptData;

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

        {showThermal && (
          <div
            className="rounded-lg px-3 py-2 mb-3 text-xs"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
          >
            {pairedPrinter
              ? `${t.print.thermalReady} @ ${pairedPrinter.name}`
              : t.print.thermalNoPrinter}
          </div>
        )}

        {thermalError && (
          <p className="text-xs mb-2" style={{ color: 'var(--danger)' }}>
            {thermalError}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {showThermal && (
            <button
              onClick={handleThermalPrint}
              disabled={thermalState === 'printing'}
              className="btn btn-primary w-full"
              style={{
                opacity: thermalState === 'printing' ? 0.6 : 1,
                cursor: thermalState === 'printing' ? 'wait' : 'pointer',
              }}
            >
              🖨️ {thermalState === 'printing' ? t.print.printing : t.print.thermalBtn}
            </button>
          )}
          <button onClick={handlePrint} className="btn btn-secondary w-full">
            {showThermal ? t.print.browserBtn : t.print.printBtn}
          </button>
          <button onClick={onClose} className="btn btn-ghost w-full">
            {t.common.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
