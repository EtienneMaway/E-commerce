'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { currencyApi } from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { formatDate } from '../../../lib/utils';
import { useT } from '../../../lib/i18n';
import { useCurrencyStore } from '../../../store/currency.store';
import { formatMoney } from '../../../lib/currency';
import { useOwnerOnlyPage } from '../../../hooks/use-owner-only';
import { usePrinterStore } from '../../../store/printer.store';
import {
  isWebBluetoothSupported,
  requestPrinter,
  testPrint,
} from '../../../lib/bluetooth-printer';

export default function SettingsPage() {
  const t = useT();
  const qc = useQueryClient();
  const { displayCurrency, toggle } = useCurrencyStore();
  const isOwner = useOwnerOnlyPage();

  const { data: rateData, isLoading } = useQuery({
    queryKey: QK.exchangeRate,
    queryFn: currencyApi.getRate,
    retry: false,
    enabled: isOwner,
  });

  const [rateInput, setRateInput] = useState('');
  const [sellingRateInput, setSellingRateInput] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [sellingRateSavedMsg, setSellingRateSavedMsg] = useState('');
  const [error, setError] = useState('');
  const [sellingRateError, setSellingRateError] = useState('');

  useEffect(() => {
    if (rateData?.usdToFcRate) setRateInput(rateData.usdToFcRate);
    if (rateData?.sellingRate) setSellingRateInput(rateData.sellingRate);
  }, [rateData]);

  // ── Global rate mutation ──────────────────────────────────────────────────
  const rateMutation = useMutation({
    mutationFn: (rate: string) => currencyApi.setRate({ usdToFcRate: rate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.exchangeRate });
      setSavedMsg(t.settings.rateSaved);
      setError('');
      setTimeout(() => setSavedMsg(''), 3000);
    },
    onError: () => { setError(t.settings.rateError); setSavedMsg(''); },
  });

  const handleRateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseFloat(rateInput);
    if (isNaN(n) || n <= 0) { setError(t.settings.rateInvalid); return; }
    setError('');
    rateMutation.mutate(rateInput);
  };

  // ── Selling rate mutation ─────────────────────────────────────────────────
  const sellingRateMutation = useMutation({
    mutationFn: (rate: string) =>
      currencyApi.setRate({ usdToFcRate: rateData?.usdToFcRate ?? rateInput, sellingRate: rate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.exchangeRate });
      setSellingRateSavedMsg(t.settings.sellingRateSaved);
      setSellingRateError('');
      setTimeout(() => setSellingRateSavedMsg(''), 3000);
    },
    onError: () => { setSellingRateError(t.settings.rateError); setSellingRateSavedMsg(''); },
  });

  const handleSellingRateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseFloat(sellingRateInput);
    if (isNaN(n) || n <= 0) { setSellingRateError(t.settings.rateInvalid); return; }
    setSellingRateError('');
    sellingRateMutation.mutate(sellingRateInput);
  };

  const previewUsd = '100.00';

  // Inverted-rate detection: warn when Current Market Rate > System Selling Rate.
  // Compare against typed inputs (so the warning reacts live) but only when
  // both are valid positive numbers.
  const sysNum = parseFloat(rateInput);
  const buyNum = parseFloat(sellingRateInput);
  const ratesInverted =
    !isNaN(sysNum) && sysNum > 0 &&
    !isNaN(buyNum) && buyNum > 0 &&
    sysNum < buyNum;

  if (!isOwner) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.settings.title}</h1>
          <p className="page-sub">{t.settings.sub}</p>
        </div>
      </div>

      <div className="page-content space-y-6" style={{ maxWidth: '560px' }}>

        {/* ── Inverted-rate warning ───────────────────────────────────── */}
        {ratesInverted && (
          <div
            className="rounded-2xl flex gap-3 items-start anim-fade-up"
            style={{
              padding: '16px 20px',
              background: 'var(--danger-light)',
              border: '1px solid rgba(var(--danger-rgb), 0.35)',
            }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
              style={{ background: 'rgba(var(--danger-rgb), 0.18)' }}
              aria-hidden
            >
              ⚠️
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm" style={{ color: 'var(--danger)' }}>
                {t.settings.invertedTitle}
              </p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--danger)', opacity: 0.85 }}>
                {t.settings.invertedBody(sysNum.toString(), buyNum.toString())}
              </p>
            </div>
          </div>
        )}

        {/* ── Currency display toggle ─────────────────────────────────── */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 className="font-bold text-sm mb-1" style={{ color: 'var(--foreground)' }}>
            {t.settings.displayCurrency}
          </h2>
          <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
            {t.settings.displayCurrencySub}
          </p>
          <div className="flex gap-2">
            {(['USD', 'FC'] as const).map((c) => (
              <button
                key={c}
                onClick={() => displayCurrency !== c && toggle()}
                className="btn"
                style={{
                  fontSize: '13px',
                  padding: '7px 20px',
                  fontWeight: displayCurrency === c ? 700 : 400,
                  background: displayCurrency === c ? 'var(--primary)' : 'var(--surface)',
                  color: displayCurrency === c ? '#fff' : 'var(--foreground)',
                  border: `1px solid ${displayCurrency === c ? 'var(--primary)' : 'var(--border)'}`,
                }}
              >
                {c === 'USD' ? '$ USD' : 'FC'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Global exchange rate ────────────────────────────────────── */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 className="font-bold text-sm mb-1" style={{ color: 'var(--foreground)' }}>
            {t.settings.exchangeRate}
          </h2>
          <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
            {t.settings.exchangeRateSub}
          </p>

          {isLoading ? (
            <div className="loading-state"><div className="spinner" /></div>
          ) : (
            <form onSubmit={handleRateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--foreground)' }}>
                  {t.settings.rateLabel}
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>$1 =</span>
                  <input
                    type="number"
                    min="0.0001"
                    step="any"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    placeholder="e.g. 2700"
                    className="input flex-1"
                    style={{ maxWidth: '160px' }}
                  />
                  <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>FC</span>
                </div>
              </div>

              {rateInput && !isNaN(parseFloat(rateInput)) && parseFloat(rateInput) > 0 && (
                <div
                  className="rounded-xl px-4 py-3 text-xs"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <span style={{ color: 'var(--muted)' }}>{t.settings.preview}: </span>
                  <span className="font-semibold" style={{ color: 'var(--foreground)' }}>
                    {formatMoney(previewUsd, 'USD', rateInput)} = {formatMoney(previewUsd, 'FC', rateInput)}
                  </span>
                </div>
              )}

              {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
              {savedMsg && <p className="text-xs font-semibold" style={{ color: 'var(--success)' }}>{savedMsg}</p>}

              <div className="flex items-center gap-3">
                <button type="submit" disabled={rateMutation.isPending} className="btn btn-primary">
                  {rateMutation.isPending ? t.settings.rateSaving : t.settings.rateSave}
                </button>
                {rateData?.updatedAt && (
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {t.settings.rateLastUpdated}: {formatDate(rateData.updatedAt)}
                  </span>
                )}
              </div>
            </form>
          )}
        </div>

        {/* ── Selling rate (distinct color) ───────────────────────────── */}
        <div
          className="rounded-2xl shadow-sm"
          style={{
            padding: '24px',
            background: 'var(--card)',
            border: '2px solid var(--warning)',
            boxShadow: '0 0 16px rgba(var(--warning-rgb), 0.12)',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <div
              className="rounded-full"
              style={{ width: 8, height: 8, background: 'var(--warning)', flexShrink: 0 }}
            />
            <h2 className="font-bold text-sm" style={{ color: 'var(--warning)' }}>
              {t.settings.sellingRate}
            </h2>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
            {t.settings.sellingRateSub}
          </p>

          {isLoading ? (
            <div className="loading-state"><div className="spinner" /></div>
          ) : (
            <form onSubmit={handleSellingRateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--warning)' }}>
                  {t.settings.sellingRateLabel}
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>$1 =</span>
                  <input
                    type="number"
                    min="0.0001"
                    step="any"
                    value={sellingRateInput}
                    onChange={(e) => setSellingRateInput(e.target.value)}
                    placeholder="e.g. 2750"
                    className="input flex-1"
                    style={{ maxWidth: '160px', borderColor: 'rgba(var(--warning-rgb), 0.4)' }}
                  />
                  <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>FC</span>
                </div>
              </div>

              {sellingRateInput && !isNaN(parseFloat(sellingRateInput)) && parseFloat(sellingRateInput) > 0 && (
                <div
                  className="rounded-xl px-4 py-3 text-xs"
                  style={{ background: 'var(--warning-light)', border: '1px solid rgba(var(--warning-rgb), 0.2)' }}
                >
                  <span style={{ color: 'var(--muted)' }}>{t.settings.preview}: </span>
                  <span className="font-semibold" style={{ color: 'var(--foreground)' }}>
                    {formatMoney(previewUsd, 'USD', sellingRateInput)} = {formatMoney(previewUsd, 'FC', sellingRateInput)}
                  </span>
                </div>
              )}

              {sellingRateError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{sellingRateError}</p>}
              {sellingRateSavedMsg && <p className="text-xs font-semibold" style={{ color: 'var(--success)' }}>{sellingRateSavedMsg}</p>}

              <button
                type="submit"
                disabled={sellingRateMutation.isPending}
                className="btn"
                style={{
                  background: 'var(--warning)',
                  color: '#fff',
                  boxShadow: '0 2px 8px rgba(var(--warning-rgb), 0.35)',
                }}
              >
                {sellingRateMutation.isPending ? t.settings.rateSaving : t.settings.rateSave}
              </button>
            </form>
          )}
        </div>

        <ThermalPrinterCard />
      </div>
    </div>
  );
}

function ThermalPrinterCard() {
  const t = useT();
  const { printer, setPrinter } = usePrinterStore();
  const [pairState, setPairState] = useState<'idle' | 'pairing'>('idle');
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const supported = typeof window !== 'undefined' && isWebBluetoothSupported();

  async function handlePair() {
    setErrorMsg('');
    setPairState('pairing');
    try {
      const p = await requestPrinter();
      if (p) setPrinter(p);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setPairState('idle');
    }
  }

  async function handleTest() {
    if (!printer) return;
    setErrorMsg('');
    setTestState('testing');
    try {
      await testPrint(printer);
      setTestState('ok');
      setTimeout(() => setTestState('idle'), 2500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setTestState('error');
    }
  }

  return (
    <div className="card" style={{ padding: '24px' }}>
      <h2 className="font-bold text-sm mb-1" style={{ color: 'var(--foreground)' }}>
        {t.settings.printerSection}
      </h2>
      <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
        {t.settings.printerSectionSub}
      </p>

      {!supported ? (
        <div
          className="rounded-xl px-4 py-3 text-xs"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
        >
          {t.settings.printerNotSupported}
        </div>
      ) : (
        <>
          {printer ? (
            <div className="space-y-3">
              <div
                className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="min-w-0">
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>{t.settings.printerPaired}</p>
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--foreground)' }}>
                    🖨️ {printer.name}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={handleTest}
                  disabled={testState === 'testing'}
                  className="btn btn-secondary"
                  style={{ opacity: testState === 'testing' ? 0.6 : 1 }}
                >
                  {testState === 'testing' ? t.settings.printerTesting : t.settings.printerTest}
                </button>
                <button onClick={() => setPrinter(null)} className="btn btn-ghost">
                  {t.settings.printerForget}
                </button>
              </div>
              {testState === 'ok' && (
                <p className="text-xs" style={{ color: 'var(--success)' }}>
                  ✓ {t.settings.printerTestOk}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div
                className="rounded-xl px-4 py-3 text-xs"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
              >
                {t.settings.printerNoneTitle}
              </div>
              <button
                onClick={handlePair}
                disabled={pairState === 'pairing'}
                className="btn btn-primary"
                style={{ opacity: pairState === 'pairing' ? 0.6 : 1 }}
              >
                {pairState === 'pairing' ? t.settings.printerPairing : t.settings.printerPairBtn}
              </button>
            </div>
          )}

          {errorMsg && (
            <p className="text-xs mt-3" style={{ color: 'var(--danger)' }}>
              {errorMsg}
            </p>
          )}
        </>
      )}
    </div>
  );
}
