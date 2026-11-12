'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { branchTransfersApi, currencyApi, type BranchBalance, type BranchPaymentCurrency } from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { getErrorMessage } from '../../../lib/utils';
import { useFormatCurrency } from '../../../lib/currency';
import { useToast } from '../../../components/ui/Toast';
import { useT } from '../../../lib/i18n';

interface Props {
  /** A balance where the current branch is the debtor. */
  balance: BranchBalance;
  isOwner: boolean;
  onClose: () => void;
}

export default function PayBranchDialog({ balance, isOwner, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const fmt = useFormatCurrency();
  const [currency, setCurrency] = useState<BranchPaymentCurrency>('FC');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const { data: rate } = useQuery({ queryKey: QK.exchangeRate, queryFn: currencyApi.getRate });
  // A pre-check only, for a friendly message before the round trip. The API
  // re-checks with decimal arithmetic and is the one that decides.
  const systemRate = rate?.usdToFcRate ? parseFloat(rate.usdToFcRate) : null;
  const outstanding = parseFloat(balance.outstanding);
  // What the API will book: USD as typed, FC at the System Rate.
  const maxInCurrency =
    currency === 'USD' ? outstanding : systemRate ? Math.floor(outstanding * systemRate) : null;

  const creditor = balance.creditorShop.name;
  const pay = useMutation({
    mutationFn: () =>
      branchTransfersApi.pay({
        toShopId: balance.creditorShopId,
        amount: amount.trim(),
        currency,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: QK.branchTransfersAll });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast({
        variant: 'success',
        title: t.branchTransfers.toastPaidTitle,
        description:
          p.status === 'CONFIRMED'
            ? t.branchTransfers.toastPaidConfirmedBody(creditor)
            : t.branchTransfers.toastPaidPendingBody(creditor),
      });
      onClose();
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const submit = (): void => {
    const value = parseFloat(amount.trim());
    if (!Number.isFinite(value) || value <= 0) return setError(t.branchTransfers.payInvalid);
    const asUsd = currency === 'USD' ? value : systemRate ? value / systemRate : null;
    // Compared at 4dp, the precision the ledger keeps.
    if (asUsd !== null && Math.round(asUsd * 1e4) > Math.round(outstanding * 1e4)) {
      return setError(t.branchTransfers.payExceeds);
    }
    setError('');
    pay.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-6 shadow-xl border"
        style={{ background: 'var(--card)', borderColor: 'rgba(127,127,127,0.2)' }}
      >
        <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
          {t.branchTransfers.payTitle(creditor)}
        </h2>
        <p className="text-xs mt-0.5 mb-5" style={{ color: 'var(--danger)' }}>
          {t.branchTransfers.paySub(fmt(balance.outstanding))}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
              {t.branchTransfers.payCurrency}
            </label>
            <div className="flex gap-1">
              {(['FC', 'USD'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCurrency(c);
                    setAmount('');
                  }}
                  className="px-4 py-1.5 text-sm rounded-lg"
                  style={
                    currency === c
                      ? { background: 'rgba(var(--primary-rgb), 0.12)', color: 'var(--primary)' }
                      : { color: 'var(--muted)' }
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold" style={{ color: 'var(--foreground)' }}>
                {t.branchTransfers.payAmount} ({currency})
              </label>
              {maxInCurrency !== null && maxInCurrency > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(currency === 'USD' ? balance.outstanding : String(maxInCurrency))}
                  className="text-xs font-bold px-2 py-0.5 rounded-md"
                  style={{ background: 'rgba(var(--primary-rgb), 0.12)', color: 'var(--primary)' }}
                >
                  Max
                </button>
              )}
            </div>
            <input
              type="number"
              min="0"
              step={currency === 'USD' ? '0.01' : '1'}
              className="input tabular-nums"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (error) setError('');
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
              {t.branchTransfers.payNote}
            </label>
            <input
              className="input"
              maxLength={255}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.branchTransfers.payNotePlaceholder}
            />
          </div>

          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {isOwner ? t.branchTransfers.payOwnerHint : t.branchTransfers.payCustodianHint}
          </p>

          {error && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="btn btn-secondary flex-1">
              {t.common.cancel}
            </button>
            <button onClick={submit} disabled={pay.isPending} className="btn btn-primary flex-1">
              {pay.isPending ? t.branchTransfers.paying : t.branchTransfers.paySubmit}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
