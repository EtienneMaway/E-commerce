'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { currencyApi } from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { formatDate } from '../../../lib/utils';
import { useT } from '../../../lib/i18n';
import { useCurrencyStore } from '../../../store/currency.store';
import { formatMoney } from '../../../lib/currency';

export default function SettingsPage() {
  const t = useT();
  const qc = useQueryClient();
  const { displayCurrency, toggle } = useCurrencyStore();

  const { data: rateData, isLoading } = useQuery({
    queryKey: QK.exchangeRate,
    queryFn: currencyApi.getRate,
    retry: false,
  });

  const [rateInput, setRateInput] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (rateData?.usdToFcRate) {
      setRateInput(rateData.usdToFcRate);
    }
  }, [rateData]);

  const mutation = useMutation({
    mutationFn: (rate: string) => currencyApi.setRate(rate),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.exchangeRate });
      setSavedMsg(t.settings.rateSaved);
      setError('');
      setTimeout(() => setSavedMsg(''), 3000);
    },
    onError: () => {
      setError(t.settings.rateError);
      setSavedMsg('');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseFloat(rateInput);
    if (isNaN(n) || n <= 0) {
      setError(t.settings.rateInvalid);
      return;
    }
    setError('');
    mutation.mutate(rateInput);
  };

  const currentRate = rateData?.usdToFcRate ?? '1';
  const previewUsd = '100.00';
  const previewFc = formatMoney(previewUsd, 'FC', currentRate);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.settings.title}</h1>
          <p className="page-sub">{t.settings.sub}</p>
        </div>
      </div>

      <div className="page-content space-y-6" style={{ maxWidth: '560px' }}>

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

        {/* ── Exchange rate ───────────────────────────────────────────── */}
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
            <form onSubmit={handleSubmit} className="space-y-4">
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

              {/* Preview */}
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

              {error && (
                <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>
              )}
              {savedMsg && (
                <p className="text-xs font-semibold" style={{ color: 'var(--success)' }}>{savedMsg}</p>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="btn btn-primary"
                >
                  {mutation.isPending ? t.settings.rateSaving : t.settings.rateSave}
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
      </div>
    </div>
  );
}
