'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AvailableWithdrawal,
  Withdrawal,
  WithdrawalCurrency,
  dashboardApi,
  withdrawalsApi,
} from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { formatDate, getErrorMessage } from '../../../lib/utils';
import { useFormatCurrency } from '../../../lib/currency';
import { useT } from '../../../lib/i18n';
import { KpiCard } from '../../../components/ui/KpiCard';
import { useOwnerOnlyPage } from '../../../hooks/use-owner-only';

interface CashPosition {
  totalCashReceived: string;
  totalWithdrawn: string;
  availableBusinessCash: string;
}

export default function WithdrawalsPage() {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const qc = useQueryClient();
  const isOwner = useOwnerOnlyPage();

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<WithdrawalCurrency>('USD');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const { data: availableData, isLoading: availableLoading } = useQuery({
    queryKey: QK.withdrawalAvailable,
    queryFn: () => withdrawalsApi.available(),
    enabled: isOwner,
  });
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: QK.withdrawals,
    queryFn: () => withdrawalsApi.list(),
    enabled: isOwner,
  });
  const { data: cashPositionData } = useQuery({
    queryKey: QK.cashPosition,
    queryFn: () => dashboardApi.cashPosition(),
    enabled: isOwner,
  });

  const avail = availableData as AvailableWithdrawal | undefined;
  const cp = cashPositionData as CashPosition | undefined;
  const history = (historyData as Withdrawal[] | undefined) ?? [];
  const latestId = history[0]?.id;

  const createMutation = useMutation({
    mutationFn: () =>
      withdrawalsApi.create({
        amount,
        currency,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.withdrawals });
      qc.invalidateQueries({ queryKey: QK.withdrawalAvailable });
      qc.invalidateQueries({ queryKey: QK.cashPosition });
      setAmount('');
      setNote('');
      setError('');
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => withdrawalsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.withdrawals });
      qc.invalidateQueries({ queryKey: QK.withdrawalAvailable });
      qc.invalidateQueries({ queryKey: QK.cashPosition });
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!amount || parseFloat(amount) <= 0) {
      setError('Amount must be greater than zero');
      return;
    }
    createMutation.mutate();
  }

  const labelCls = 'block text-xs font-medium mb-1';
  const labelStyle = { color: 'var(--muted-foreground)' } as const;
  const inputCls = 'w-full px-3 py-2 rounded-lg text-sm border outline-none';
  const inputStyle = {
    background: 'var(--input)',
    borderColor: 'var(--border)',
    color: 'var(--foreground)',
  } as const;

  if (!isOwner) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.withdrawals.title}</h1>
          <p className="page-sub">{t.withdrawals.sub}</p>
        </div>
      </div>

      <div className="page-content space-y-6">
        {/* ── Top KPIs ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <KpiCard
            label={t.dashboard.totalCashReceived}
            value={formatCurrency(cp?.totalCashReceived ?? '0')}
            icon="🪙"
            color="primary"
            sub={t.dashboard.totalCashReceivedSub}
          />
          <KpiCard
            label={t.dashboard.totalWithdrawn}
            value={formatCurrency(cp?.totalWithdrawn ?? '0')}
            icon="💸"
            color="warning"
            sub={t.dashboard.totalWithdrawnSub}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Available & form ─────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Available card */}
          <div
            className="card"
            style={{
              padding: '24px',
              background: 'var(--primary-light)',
              borderColor: 'rgba(var(--primary-rgb), 0.2)',
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--primary)' }}>
              {t.dashboard.availableBusinessCash}
            </p>
            <p className="text-3xl font-bold tracking-tight mt-2" style={{ color: 'var(--primary)' }}>
              {cp ? formatCurrency(cp.availableBusinessCash) : '…'}
            </p>
            <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>
              {t.dashboard.availableBusinessCashSub}
            </p>
          </div>

          {/* Breakdown */}
          {avail && (
            <div className="card" style={{ padding: '20px 24px' }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
                {t.withdrawals.breakdownTitle}
              </p>
              <div className="space-y-2 text-sm">
                <Row label={t.withdrawals.directSales} value={formatCurrency(avail.incomeBreakdown.directSales)} />
                <Row label={t.withdrawals.debtorPayments} value={formatCurrency(avail.incomeBreakdown.debtorPayments)} />
                <Row label={t.withdrawals.externalPaymentIn} value={formatCurrency(avail.incomeBreakdown.externalPaymentIn)} />
                <Row label={t.withdrawals.expensesInPeriod} value={`− ${formatCurrency(avail.periodExpenses)}`} color="var(--danger)" />
                <Row label={t.withdrawals.leftoverCarried} value={`+ ${formatCurrency(avail.leftoverCarried)}`} color="var(--success)" />
                <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                <Row
                  label={t.withdrawals.lastWithdrawalAt}
                  value={avail.lastWithdrawalAt ? formatDate(avail.lastWithdrawalAt) : t.withdrawals.neverWithdrawn}
                  muted
                />
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="card space-y-3" style={{ padding: '24px' }}>
            <div>
              <label className={labelCls} style={labelStyle}>{t.withdrawals.amount}</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={`${inputCls} flex-1`}
                  style={inputStyle}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
                <select
                  className={inputCls}
                  style={{ ...inputStyle, maxWidth: 96 }}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as WithdrawalCurrency)}
                >
                  <option value="USD">USD</option>
                  <option value="FC">FC</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>{t.withdrawals.note}</label>
              <textarea
                className={inputCls}
                style={inputStyle}
                rows={2}
                placeholder={t.withdrawals.notePlaceholder}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            {error && (
              <div className="text-xs" style={{ color: 'var(--danger)' }}>{error}</div>
            )}
            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={createMutation.isPending || availableLoading}
            >
              {createMutation.isPending ? t.withdrawals.submitting : t.withdrawals.submit}
            </button>
          </form>
        </div>

        {/* ── History ──────────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <div>
                <h2 className="font-bold text-sm tracking-tight" style={{ color: 'var(--foreground)' }}>
                  {t.withdrawals.historyTitle}
                </h2>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-sm" style={{ minWidth: 600 }}>
                <thead>
                  <tr className="data-table-head-row">
                    <th className="data-table-head-cell">{t.withdrawals.colDate}</th>
                    <th className="data-table-head-cell">{t.withdrawals.colAmount}</th>
                    <th className="data-table-head-cell">{t.withdrawals.colLeftover}</th>
                    <th className="data-table-head-cell">{t.withdrawals.colNote}</th>
                    <th className="data-table-head-cell" />
                  </tr>
                </thead>
                <tbody>
                  {historyLoading && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
                        {t.common.loading}
                      </td>
                    </tr>
                  )}
                  {!historyLoading && history.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
                        <div className="text-2xl mb-2">💸</div>
                        {t.withdrawals.historyEmpty}
                      </td>
                    </tr>
                  )}
                  {history.map((row, i) => (
                    <tr
                      key={row.id}
                      className="data-table-row"
                      style={{ background: i % 2 === 0 ? 'var(--card)' : 'var(--surface)' }}
                    >
                      <td className="data-table-cell" style={{ color: 'var(--muted)', fontSize: 12 }}>
                        {formatDate(row.withdrawnAt)}
                      </td>
                      <td className="data-table-cell">
                        <div className="font-semibold">{formatCurrency(row.amountUsd)}</div>
                        {row.currency === 'FC' && (
                          <div className="text-xs" style={{ color: 'var(--muted)' }}>{row.amount} FC</div>
                        )}
                      </td>
                      <td className="data-table-cell" style={{ color: 'var(--muted)' }}>
                        {formatCurrency(row.leftoverOut)}
                      </td>
                      <td className="data-table-cell" style={{ color: 'var(--muted)' }}>
                        {row.note ?? '—'}
                      </td>
                      <td className="data-table-cell text-right">
                        {row.id === latestId && (
                          <button
                            onClick={() => {
                              if (confirm(t.withdrawals.deleteConfirm)) deleteMutation.mutate(row.id);
                            }}
                            className="text-xs font-semibold"
                            style={{ color: 'var(--danger)' }}
                            disabled={deleteMutation.isPending}
                          >
                            {t.withdrawals.delete}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  color,
  muted,
}: {
  label: string;
  value: string;
  color?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span
        className="font-semibold"
        style={{
          color: color ?? (muted ? 'var(--muted)' : 'var(--foreground)'),
          fontWeight: muted ? 500 : 600,
          fontSize: muted ? 12 : 14,
        }}
      >
        {value}
      </span>
    </div>
  );
}
