'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SalaryPayment,
  SalaryPaymentStatus,
  salaryPaymentsApi,
} from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { useAuthStore } from '../../../store/auth.store';
import { formatCurrency, formatDate, getErrorMessage } from '../../../lib/utils';

const STATUS_LABELS: Record<SalaryPaymentStatus, string> = {
  PENDING_CONFIRMATION: 'Awaiting your confirmation',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled by employer',
};

const STATUS_COLORS: Record<SalaryPaymentStatus, { bg: string; fg: string }> = {
  PENDING_CONFIRMATION: { bg: 'rgba(245,158,11,0.15)', fg: '#F59E0B' },
  CONFIRMED: { bg: 'rgba(16,185,129,0.15)', fg: '#10B981' },
  REJECTED: { bg: 'rgba(239,68,68,0.15)', fg: '#EF4444' },
  CANCELLED: { bg: 'rgba(107,114,128,0.15)', fg: '#9CA3AF' },
};

function formatPeriodMonth(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(y, m - 1, 1),
  );
}

function currentPeriodMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function SummaryCard({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent?: string;
  hint?: string;
}) {
  return (
    <div className="p-3 rounded-lg border" style={{ borderColor: 'rgba(127,127,127,0.15)' }}>
      <div className="text-xs opacity-60 mb-1">{label}</div>
      <div className="text-lg font-semibold" style={{ color: accent }}>
        {value}
      </div>
      {hint && (
        <div className="text-[10px] mt-0.5 opacity-70">{hint}</div>
      )}
    </div>
  );
}

export default function MySalaryPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [period, setPeriod] = useState<string>(currentPeriodMonth());
  const employmentId = user?.activeEmployment?.id;

  const { data: summary } = useQuery({
    queryKey: QK.salarySummary(employmentId ?? '', period),
    queryFn: () => salaryPaymentsApi.summary(employmentId!, period),
    enabled: !!employmentId,
    staleTime: 15_000,
  });

  const { data: pending, isLoading: loadingPending } = useQuery({
    queryKey: QK.salaryPaymentsPending,
    queryFn: salaryPaymentsApi.pending,
    staleTime: 15_000,
  });

  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: QK.salaryPayments({ role: 'employee' }),
    queryFn: () => salaryPaymentsApi.list({ role: 'employee' }),
    staleTime: 15_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['salary-payments'] });

  const list = tab === 'pending' ? pending ?? [] : history ?? [];
  const loading = tab === 'pending' ? loadingPending : loadingHistory;

  // Group history by period for a quick monthly summary at the top.
  const periodSummary = useMemo(() => {
    if (tab !== 'history') return null;
    const byPeriod = new Map<string, { confirmed: number; pending: number }>();
    for (const p of history ?? []) {
      const entry = byPeriod.get(p.periodMonth) ?? { confirmed: 0, pending: 0 };
      const amt = parseFloat(p.amount);
      if (p.status === 'CONFIRMED') entry.confirmed += amt;
      else if (p.status === 'PENDING_CONFIRMATION') entry.pending += amt;
      byPeriod.set(p.periodMonth, entry);
    }
    return Array.from(byPeriod.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6);
  }, [history, tab]);

  if (!user) return null;
  if (!user.activeEmployment) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">My salary</h1>
        <p className="text-sm opacity-70">
          You're not currently employed by anyone — this page shows pending salary payments and your payment history once you have an active employment.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">My salary</h1>
        <p className="text-sm opacity-70 mt-1">
          Employer: <strong>@{user.activeEmployment.employer.username}</strong>
        </p>
      </div>

      {/* Current-month summary */}
      <div
        className="p-5 rounded-xl border mb-5"
        style={{ borderColor: 'rgba(127,127,127,0.15)', background: 'var(--card)' }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="font-semibold">{formatPeriodMonth(period)}</h2>
            <p className="text-xs opacity-60 mt-0.5">
              {summary?.monthlyPay
                ? `Monthly target set by your employer`
                : `Your employer hasn't set a monthly pay target yet.`}
            </p>
          </div>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value || currentPeriodMonth())}
            className="px-3 py-1.5 rounded-md border bg-transparent text-sm"
            style={{ borderColor: 'rgba(127,127,127,0.3)', colorScheme: 'dark' }}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            label="Monthly pay"
            value={summary?.monthlyPay ? formatCurrency(summary.monthlyPay) : '—'}
          />
          <SummaryCard
            label="Collected so far"
            value={formatCurrency(summary?.paidConfirmed ?? '0')}
            accent="#10B981"
          />
          <SummaryCard
            label="Pending"
            value={formatCurrency(summary?.pendingConfirmation ?? '0')}
            accent={summary && parseFloat(summary.pendingConfirmation) > 0 ? '#F59E0B' : undefined}
            hint={
              summary && parseFloat(summary.pendingConfirmation) > 0
                ? 'Confirm below to add to Collected'
                : undefined
            }
          />
          <SummaryCard
            label="Remaining"
            value={summary?.balanceRemaining ? formatCurrency(summary.balanceRemaining) : '—'}
            accent="#818CF8"
            hint={
              summary?.balanceRemaining && parseFloat(summary.balanceRemaining) === 0
                ? 'Fully paid for this month'
                : undefined
            }
          />
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b" style={{ borderColor: 'rgba(127,127,127,0.15)' }}>
        {(['pending', 'history'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              color: tab === k ? '#818CF8' : 'rgba(127,127,127,0.8)',
              borderBottom: tab === k ? '2px solid #818CF8' : '2px solid transparent',
            }}
          >
            {k === 'pending'
              ? `Pending${pending?.length ? ` (${pending.length})` : ''}`
              : 'History'}
          </button>
        ))}
      </div>

      {tab === 'history' && periodSummary && periodSummary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-5">
          {periodSummary.map(([period, totals]) => (
            <div
              key={period}
              className="p-3 rounded-lg border"
              style={{ borderColor: 'rgba(127,127,127,0.15)', background: 'var(--card)' }}
            >
              <div className="text-xs opacity-60 mb-0.5">{formatPeriodMonth(period)}</div>
              <div className="text-base font-semibold" style={{ color: '#10B981' }}>
                {formatCurrency(totals.confirmed.toFixed(2))}
              </div>
              {totals.pending > 0 && (
                <div className="text-[11px] mt-0.5" style={{ color: '#F59E0B' }}>
                  + {formatCurrency(totals.pending.toFixed(2))} pending
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-sm opacity-60 p-8 text-center">Loading…</div>
      ) : list.length === 0 ? (
        <div
          className="text-sm opacity-60 p-8 text-center rounded-xl border"
          style={{ borderColor: 'rgba(127,127,127,0.15)' }}
        >
          {tab === 'pending'
            ? "Nothing to confirm right now. When your employer records a salary payment, it'll appear here."
            : 'No salary payments yet.'}
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((p) => (
            <EmployeePaymentRow key={p.id} payment={p} onChange={invalidate} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeePaymentRow({
  payment,
  onChange,
}: {
  payment: SalaryPayment;
  onChange: () => void;
}) {
  const [showReject, setShowReject] = useState(false);
  const color = STATUS_COLORS[payment.status];
  const isPending = payment.status === 'PENDING_CONFIRMATION';

  const confirmM = useMutation({
    mutationFn: () => salaryPaymentsApi.confirm(payment.id),
    onSuccess: onChange,
  });

  return (
    <div
      className="p-4 rounded-xl border"
      style={{ borderColor: 'rgba(127,127,127,0.15)', background: 'var(--card)' }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl font-bold">{formatCurrency(payment.amount)}</span>
            <span className="text-xs opacity-60">· {formatPeriodMonth(payment.periodMonth)}</span>
            <span
              className="px-2 py-0.5 text-xs rounded-md font-medium"
              style={{ background: color.bg, color: color.fg }}
            >
              {STATUS_LABELS[payment.status]}
            </span>
          </div>
          <div className="text-xs opacity-60 mt-1">
            From <strong>@{payment.employer?.username ?? '—'}</strong> · Recorded{' '}
            {formatDate(payment.paidAt)}
            {payment.confirmedAt && ` · Confirmed ${formatDate(payment.confirmedAt)}`}
            {payment.rejectedAt && ` · Rejected ${formatDate(payment.rejectedAt)}`}
            {payment.cancelledAt && ` · Cancelled ${formatDate(payment.cancelledAt)}`}
          </div>
          {payment.note && (
            <div className="text-xs opacity-80 mt-1 italic">"{payment.note}"</div>
          )}
          {payment.rejectionReason && (
            <div className="text-xs mt-1" style={{ color: '#EF4444' }}>
              Reason: {payment.rejectionReason}
            </div>
          )}
        </div>
        {isPending && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => confirmM.mutate()}
              disabled={confirmM.isPending}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-50"
              style={{ background: '#10B981' }}
            >
              {confirmM.isPending ? 'Confirming…' : '✓ Confirm receipt'}
            </button>
            <button
              onClick={() => setShowReject(true)}
              className="px-3 py-1.5 rounded-md text-sm font-medium"
              style={{ border: '1px solid rgba(239,68,68,0.4)', color: '#F87171' }}
            >
              Dispute
            </button>
          </div>
        )}
      </div>

      {!!confirmM.error && (
        <div className="text-xs mt-3" style={{ color: '#EF4444' }}>
          {getErrorMessage(confirmM.error)}
        </div>
      )}

      {showReject && (
        <RejectModal
          paymentId={payment.id}
          onClose={() => setShowReject(false)}
          onSuccess={() => {
            setShowReject(false);
            onChange();
          }}
        />
      )}
    </div>
  );
}

function RejectModal({
  paymentId,
  onClose,
  onSuccess,
}: {
  paymentId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => salaryPaymentsApi.reject(paymentId, reason || undefined),
    onSuccess,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-md p-5 rounded-xl border"
        style={{ background: 'var(--card)', borderColor: 'rgba(127,127,127,0.2)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Dispute payment</h2>
          <button onClick={onClose} className="text-xl leading-none opacity-60 hover:opacity-100">
            ×
          </button>
        </div>
        <p className="text-xs opacity-70 mb-3">
          Only use this if the cash was never received. Your employer will see the dispute.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Reason (optional)"
          className="w-full px-3 py-2 rounded-md border bg-transparent text-sm"
          style={{ borderColor: 'rgba(127,127,127,0.3)' }}
        />
        {!!m.error && (
          <div className="text-xs mt-2" style={{ color: '#EF4444' }}>
            {getErrorMessage(m.error)}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-3">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm"
            style={{ border: '1px solid rgba(127,127,127,0.3)' }}
          >
            Cancel
          </button>
          <button
            onClick={() => m.mutate()}
            disabled={m.isPending}
            className="px-3 py-1.5 rounded-md text-sm text-white disabled:opacity-50"
            style={{ background: '#EF4444' }}
          >
            {m.isPending ? 'Submitting…' : 'Submit dispute'}
          </button>
        </div>
      </div>
    </div>
  );
}
