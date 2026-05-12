'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Employment,
  EmploymentParty,
  SalaryPayment,
  SalaryPaymentStatus,
  employmentsApi,
  salaryPaymentsApi,
} from '../../../../lib/api';
import { QK } from '../../../../lib/query-keys';
import { useOwnerOnlyPage } from '../../../../hooks/use-owner-only';
import { useConfirm } from '../../../../components/ui/ConfirmDialog';
import { useT, type Translations } from '../../../../lib/i18n';
import { useLocaleStore } from '../../../../store/locale.store';
import { formatCurrency, formatDate, getErrorMessage } from '../../../../lib/utils';

const STATUS_COLORS: Record<SalaryPaymentStatus, { bg: string; fg: string }> = {
  PENDING_CONFIRMATION: { bg: 'rgba(245,158,11,0.15)', fg: '#F59E0B' },
  CONFIRMED: { bg: 'rgba(16,185,129,0.15)', fg: '#10B981' },
  REJECTED: { bg: 'rgba(239,68,68,0.15)', fg: '#EF4444' },
  CANCELLED: { bg: 'rgba(107,114,128,0.15)', fg: '#9CA3AF' },
};

function statusLabel(t: Translations, s: SalaryPaymentStatus): string {
  switch (s) {
    case 'PENDING_CONFIRMATION': return t.employees.awaitingConfirmation;
    case 'CONFIRMED': return t.employees.confirmed;
    case 'REJECTED': return t.employees.rejected;
    case 'CANCELLED': return t.employees.cancelled;
  }
}

function currentPeriodMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function useFormatPeriodMonth(): (period: string) => string {
  const locale = useLocaleStore((s) => s.locale);
  return (period: string) => {
    const [y, m] = period.split('-').map(Number);
    return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(y, m - 1, 1));
  };
}

export default function EmployeePayrollPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const isOwner = useOwnerOnlyPage();
  const t = useT();
  const formatPeriodMonth = useFormatPeriodMonth();
  const employmentId = params?.id ?? '';

  const [period, setPeriod] = useState<string>(currentPeriodMonth());
  const [periodFilter, setPeriodFilter] = useState<'current' | 'all'>('current');
  const [showRecord, setShowRecord] = useState(false);

  const { data: employment, isLoading: loadingEmp } = useQuery({
    queryKey: QK.employmentDetail(employmentId),
    queryFn: () => employmentsApi.get(employmentId),
    enabled: isOwner && !!employmentId,
  });

  const { data: summary } = useQuery({
    queryKey: QK.salarySummary(employmentId, period),
    queryFn: () => salaryPaymentsApi.summary(employmentId, period),
    enabled: isOwner && !!employmentId,
  });

  const { data: payments, isLoading: loadingPayments } = useQuery({
    queryKey: QK.salaryPayments({ employmentId, period: periodFilter === 'current' ? period : 'all' }),
    queryFn: () =>
      salaryPaymentsApi.list({
        role: 'employer',
        employmentId,
        periodMonth: periodFilter === 'current' ? period : undefined,
      }),
    enabled: isOwner && !!employmentId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['salary-payments'] });
    qc.invalidateQueries({ queryKey: QK.employmentDetail(employmentId) });
    qc.invalidateQueries({ queryKey: QK.employments() });
  };

  if (!isOwner) return null;

  if (loadingEmp) {
    return <div className="p-8 text-sm opacity-60">{t.employees.loading}</div>;
  }
  if (!employment) {
    return (
      <div className="p-8">
        <p className="text-sm opacity-70">{t.employees.notFound}</p>
        <Link href="/employees" className="text-sm" style={{ color: '#818CF8' }}>{t.employees.backToEmployees}</Link>
      </div>
    );
  }

  const employee = employment.employee;
  const isClosed =
    employment.status === 'TERMINATED' || employment.status === 'REJECTED';
  const isExternal = !!employee?.isExternalEmployee;
  const displayName = employee?.name?.trim() || employee?.username || t.employees.title.slice(0, -1);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-4">
        <button
          onClick={() => router.push('/employees')}
          className="text-sm opacity-70 hover:opacity-100"
          style={{ color: '#818CF8' }}
        >
          {t.employees.backToEmployees}
        </button>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold">{displayName}</h1>
          <p className="text-sm opacity-70 mt-1">
            {isExternal ? (
              <span className="font-medium" style={{ color: '#C084FC' }}>{t.employees.externalEmployeeLabel}</span>
            ) : (
              <>{employment.tier === 'FULL' ? t.employees.tierFULL : t.employees.miniDescription}</>
            )}
            {' · '}
            <span>
              {employment.status === 'PENDING' && t.employees.statusPENDING}
              {employment.status === 'ACTIVE' && t.employees.statusACTIVE}
              {employment.status === 'REJECTED' && t.employees.statusREJECTED}
              {employment.status === 'TERMINATION_REQUESTED' && t.employees.statusTERMINATION_REQUESTED}
              {employment.status === 'TERMINATED' && t.employees.statusTERMINATED}
            </span>
            {employment.acceptedAt && ` · ${t.employees.since} ${formatDate(employment.acceptedAt)}`}
          </p>
        </div>
        {!isClosed && (
          <div className="flex items-center gap-2 flex-wrap">
            <PayrollActiveToggle employment={employment} onChange={invalidate} />
            {isExternal && (
              <RemoveExternalButton
                employmentId={employment.id}
                displayName={displayName}
                onRemoved={() => router.push('/employees')}
              />
            )}
          </div>
        )}
      </div>

      <ProfilePanel
        employmentId={employment.id}
        employee={employee}
        isExternal={isExternal}
        disabled={isClosed}
        onChange={invalidate}
      />

      <div className="mt-6">
        <SalaryPanel employment={employment} onChange={invalidate} disabled={isClosed} />
      </div>

      <div className="mt-6 p-5 rounded-xl border" style={{ borderColor: 'rgba(127,127,127,0.15)', background: 'var(--card)' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="font-semibold">{t.employees.payrollSection} · {formatPeriodMonth(period)}</h2>
            <p className="text-xs opacity-60 mt-1">{t.employees.payrollHint}</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value || currentPeriodMonth())}
              className="px-3 py-1.5 rounded-md border bg-transparent text-sm"
              style={{ borderColor: 'rgba(127,127,127,0.3)', colorScheme: 'dark' }}
            />
            <button
              onClick={() => setShowRecord(true)}
              disabled={isClosed || !employment.payrollActive || !employment.monthlyPay}
              className="px-3 py-1.5 rounded-md text-sm text-white disabled:opacity-50"
              style={{ background: '#6366F1' }}
            >
              {t.employees.recordPayment}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label={t.employees.monthlyTarget} value={summary?.monthlyPay ? formatCurrency(summary.monthlyPay) : '—'} />
          <SummaryCard label={t.employees.paidConfirmed} value={formatCurrency(summary?.paidConfirmed ?? '0')} accent="#10B981" />
          <SummaryCard label={t.employees.pendingConfirmation} value={formatCurrency(summary?.pendingConfirmation ?? '0')} accent="#F59E0B" />
          <SummaryCard
            label={t.employees.balanceRemaining}
            value={summary?.balanceRemaining ? formatCurrency(summary.balanceRemaining) : '—'}
            accent="#818CF8"
          />
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">{t.employees.paymentHistory}</h2>
          <div className="flex gap-1 text-xs">
            <FilterPill active={periodFilter === 'current'} onClick={() => setPeriodFilter('current')}>
              {formatPeriodMonth(period)}
            </FilterPill>
            <FilterPill active={periodFilter === 'all'} onClick={() => setPeriodFilter('all')}>
              {t.employees.allTime}
            </FilterPill>
          </div>
        </div>

        {loadingPayments ? (
          <div className="text-sm opacity-60 p-6 text-center">{t.employees.loading}</div>
        ) : !payments?.length ? (
          <div className="text-sm opacity-60 p-6 text-center rounded-xl border" style={{ borderColor: 'rgba(127,127,127,0.15)' }}>
            {periodFilter === 'current'
              ? t.employees.noPaymentsForPeriod(formatPeriodMonth(period))
              : t.employees.noPaymentsYet}
          </div>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <PaymentRow key={p.id} payment={p} onChange={invalidate} />
            ))}
          </div>
        )}
      </div>

      {showRecord && (
        <RecordPaymentModal
          employment={employment}
          period={period}
          onClose={() => setShowRecord(false)}
          onSuccess={invalidate}
        />
      )}
    </div>
  );
}

function ProfilePanel({
  employmentId,
  employee,
  isExternal,
  disabled,
  onChange,
}: {
  employmentId: string;
  employee: EmploymentParty | undefined;
  isExternal: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);

  if (!employee) return null;

  return (
    <div
      className="p-5 rounded-xl border"
      style={{ borderColor: 'rgba(127,127,127,0.15)', background: 'var(--card)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">{t.employees.profile}</h2>
        {!disabled && (
          <button
            onClick={() => setEditing(true)}
            className="px-2.5 py-1 rounded-md text-xs"
            style={{ border: '1px solid rgba(127,127,127,0.3)' }}
          >
            {t.employees.edit}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <ProfileField label={t.employees.fieldName} value={employee.name || '—'} />
        <ProfileField
          label={t.employees.fieldSystemUsername}
          value={`@${employee.username}`}
          hint={t.employees.cannotBeChanged}
        />
        <ProfileField label={t.employees.fieldRole} value={employee.role || '—'} />
        {isExternal && (
          <ProfileField
            label={t.employees.fieldDateOfBirth}
            value={employee.dateOfBirth ? formatDate(employee.dateOfBirth) : '—'}
          />
        )}
        {!isExternal && (
          <>
            {employee.email && <ProfileField label={t.employees.fieldEmail} value={employee.email} />}
            {employee.phone && <ProfileField label={t.employees.fieldPhone} value={employee.phone} />}
          </>
        )}
      </div>

      {editing && (
        <EditProfileModal
          employmentId={employmentId}
          employee={employee}
          showDobField={isExternal}
          onClose={() => setEditing(false)}
          onSuccess={() => {
            onChange();
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function ProfileField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-xs opacity-60 mb-0.5">
        {label}
        {hint && <span className="ml-1 italic opacity-70">({hint})</span>}
      </div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function EditProfileModal({
  employmentId,
  employee,
  showDobField,
  onClose,
  onSuccess,
}: {
  employmentId: string;
  employee: EmploymentParty;
  showDobField: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(employee.name ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(employee.dateOfBirth ?? '');
  const [role, setRole] = useState(employee.role ?? '');

  const m = useMutation({
    mutationFn: () => {
      const body: { name?: string; dateOfBirth?: string; role?: string } = {
        name,
        role: role || '',
      };
      if (showDobField) {
        body.dateOfBirth = dateOfBirth || '';
      }
      return employmentsApi.updateEmployeeProfile(employmentId, body);
    },
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
          <h2 className="font-semibold">{t.employees.editProfileTitle}</h2>
          <button onClick={onClose} className="text-xl leading-none opacity-60 hover:opacity-100">
            ×
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs font-medium mb-1 opacity-80">{t.employees.fieldFullName}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-md border bg-transparent"
              style={{ borderColor: 'rgba(127,127,127,0.3)' }}
              autoFocus
            />
          </label>
          {showDobField && (
            <label className="block">
              <span className="block text-xs font-medium mb-1 opacity-80">{t.employees.fieldDateOfBirth}</span>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-transparent"
                style={{ borderColor: 'rgba(127,127,127,0.3)', colorScheme: 'dark' }}
              />
            </label>
          )}
          <label className="block">
            <span className="block text-xs font-medium mb-1 opacity-80">{t.employees.fieldRole}</span>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 rounded-md border bg-transparent"
              style={{ borderColor: 'rgba(127,127,127,0.3)' }}
              placeholder={t.employees.rolePlaceholderShort}
            />
          </label>
          <div className="text-xs opacity-60">
            {t.employees.usernameCantChange(employee.username)}
          </div>
          {!!m.error && (
            <div className="text-xs" style={{ color: '#EF4444' }}>{getErrorMessage(m.error)}</div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-sm"
              style={{ border: '1px solid rgba(127,127,127,0.3)' }}
            >
              {t.employees.cancel}
            </button>
            <button
              onClick={() => m.mutate()}
              disabled={!name || m.isPending}
              className="px-3 py-1.5 rounded-md text-sm text-white disabled:opacity-50"
              style={{ background: '#6366F1' }}
            >
              {m.isPending ? t.employees.saving : t.employees.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="p-3 rounded-lg border" style={{ borderColor: 'rgba(127,127,127,0.15)' }}>
      <div className="text-xs opacity-60 mb-1">{label}</div>
      <div className="text-lg font-semibold" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-md font-medium transition-colors"
      style={{
        background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
        color: active ? '#818CF8' : 'rgba(127,127,127,0.8)',
        border: '1px solid',
        borderColor: active ? 'rgba(99,102,241,0.3)' : 'rgba(127,127,127,0.2)',
      }}
    >
      {children}
    </button>
  );
}

function SalaryPanel({
  employment,
  onChange,
  disabled,
}: {
  employment: Employment;
  onChange: () => void;
  disabled: boolean;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(employment.monthlyPay ?? '');
  const m = useMutation({
    mutationFn: (raw: string) =>
      employmentsApi.setSalary(employment.id, raw === '' ? null : Number(raw)),
    onSuccess: () => {
      onChange();
      setEditing(false);
    },
  });

  return (
    <div className="p-5 rounded-xl border flex items-center justify-between gap-4 flex-wrap" style={{ borderColor: 'rgba(127,127,127,0.15)', background: 'var(--card)' }}>
      <div>
        <div className="text-xs opacity-70 mb-1">{t.employees.monthlyPayTarget}</div>
        {editing ? (
          <div className="flex items-center gap-2">
            <span className="text-sm opacity-70">USD</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              className="px-3 py-1.5 rounded-md border bg-transparent text-base font-semibold w-40"
              style={{ borderColor: 'rgba(127,127,127,0.3)' }}
              placeholder="0.00"
            />
            <button
              onClick={() => m.mutate(value)}
              disabled={m.isPending}
              className="px-3 py-1.5 rounded-md text-sm text-white disabled:opacity-50"
              style={{ background: '#6366F1' }}
            >
              {t.employees.save}
            </button>
            <button
              onClick={() => { setEditing(false); setValue(employment.monthlyPay ?? ''); }}
              className="px-3 py-1.5 rounded-md text-sm"
              style={{ border: '1px solid rgba(127,127,127,0.3)' }}
            >
              {t.employees.cancel}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold">
              {employment.monthlyPay ? formatCurrency(employment.monthlyPay) : t.employees.notSet}
            </span>
            {!disabled && (
              <button
                onClick={() => setEditing(true)}
                className="px-2.5 py-1 rounded-md text-xs"
                style={{ border: '1px solid rgba(127,127,127,0.3)' }}
              >
                {employment.monthlyPay ? t.employees.editBtn : t.employees.setBtn}
              </button>
            )}
          </div>
        )}
        {!!m.error && (
          <div className="text-xs mt-2" style={{ color: '#EF4444' }}>{getErrorMessage(m.error)}</div>
        )}
      </div>
    </div>
  );
}

function RemoveExternalButton({
  employmentId,
  displayName,
  onRemoved,
}: {
  employmentId: string;
  displayName: string;
  onRemoved: () => void;
}) {
  const confirm = useConfirm();
  const t = useT();
  const m = useMutation({
    mutationFn: () => employmentsApi.removeExternalEmployee(employmentId),
    onSuccess: onRemoved,
  });
  const handleClick = async () => {
    const ok = await confirm({
      title: t.employees.removeConfirmTitle(displayName),
      description: t.employees.removeConfirmDescription,
      confirmLabel: t.employees.remove,
      variant: 'danger',
    });
    if (ok) m.mutate();
  };
  return (
    <button
      onClick={handleClick}
      disabled={m.isPending}
      className="px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-50"
      style={{ border: '1px solid rgba(239,68,68,0.4)', color: '#F87171' }}
    >
      {m.isPending ? t.employees.removing : t.employees.removeEmployee}
    </button>
  );
}

function PayrollActiveToggle({
  employment,
  onChange,
}: {
  employment: Employment;
  onChange: () => void;
}) {
  const t = useT();
  const m = useMutation({
    mutationFn: (next: boolean) => employmentsApi.setPayrollActive(employment.id, next),
    onSuccess: onChange,
  });
  const next = !employment.payrollActive;
  return (
    <button
      onClick={() => m.mutate(next)}
      disabled={m.isPending}
      className="px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-50"
      style={{
        background: employment.payrollActive ? 'rgba(16,185,129,0.15)' : 'rgba(107,114,128,0.15)',
        color: employment.payrollActive ? '#10B981' : '#9CA3AF',
        border: '1px solid',
        borderColor: employment.payrollActive ? 'rgba(16,185,129,0.3)' : 'rgba(127,127,127,0.3)',
      }}
      title={employment.payrollActive ? t.employees.pauseTooltip : t.employees.resumeTooltip}
    >
      {employment.payrollActive ? `● ${t.employees.payrollActive}` : `⏸ ${t.employees.payrollPaused}`}
    </button>
  );
}

function PaymentRow({ payment, onChange }: { payment: SalaryPayment; onChange: () => void }) {
  const t = useT();
  const formatPeriodMonth = useFormatPeriodMonth();
  const cancelM = useMutation({
    mutationFn: () => salaryPaymentsApi.cancel(payment.id),
    onSuccess: onChange,
  });
  const color = STATUS_COLORS[payment.status];
  return (
    <div className="p-3 rounded-lg border flex items-center justify-between gap-3" style={{ borderColor: 'rgba(127,127,127,0.15)', background: 'var(--card)' }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">{formatCurrency(payment.amount)}</span>
          <span className="text-xs opacity-60">· {formatPeriodMonth(payment.periodMonth)}</span>
          <span
            className="px-2 py-0.5 text-xs rounded-md font-medium"
            style={{ background: color.bg, color: color.fg }}
          >
            {statusLabel(t, payment.status)}
          </span>
        </div>
        <div className="text-xs opacity-60 mt-1">
          {t.employees.recordedLabel} {formatDate(payment.paidAt)}
          {payment.confirmedAt && ` · ${t.employees.confirmed} ${formatDate(payment.confirmedAt)}`}
          {payment.rejectedAt && ` · ${t.employees.rejected} ${formatDate(payment.rejectedAt)}`}
          {payment.cancelledAt && ` · ${t.employees.cancelled} ${formatDate(payment.cancelledAt)}`}
        </div>
        {payment.note && <div className="text-xs opacity-80 mt-1 italic">{payment.note}</div>}
        {payment.rejectionReason && (
          <div className="text-xs mt-1" style={{ color: '#EF4444' }}>
            {payment.rejectionReason}
          </div>
        )}
      </div>
      {payment.status === 'PENDING_CONFIRMATION' && (
        <button
          onClick={() => cancelM.mutate()}
          disabled={cancelM.isPending}
          className="px-2.5 py-1 rounded-md text-xs disabled:opacity-50"
          style={{ border: '1px solid rgba(239,68,68,0.4)', color: '#F87171' }}
        >
          {t.employees.cancelBtn}
        </button>
      )}
    </div>
  );
}

interface SalaryOverflowError {
  warning: true;
  code: 'SALARY_OVERFLOW';
  monthlyPay: string;
  alreadyPlanned: string;
  attemptedAmount: string;
  projected: string;
  message: string;
}

function isSalaryOverflow(err: unknown): SalaryOverflowError | null {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { status?: number; data?: unknown } }).response?.data;
    if (data && typeof data === 'object' && 'warning' in data && (data as { code?: string }).code === 'SALARY_OVERFLOW') {
      return data as SalaryOverflowError;
    }
  }
  return null;
}

function RecordPaymentModal({
  employment,
  period,
  onClose,
  onSuccess,
}: {
  employment: Employment;
  period: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useT();
  const formatPeriodMonth = useFormatPeriodMonth();
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [overflow, setOverflow] = useState<SalaryOverflowError | null>(null);
  const [confirmedOverride, setConfirmedOverride] = useState(false);

  const m = useMutation({
    mutationFn: () =>
      salaryPaymentsApi.create({
        employmentId: employment.id,
        amount: Number(amount),
        periodMonth: period,
        note: note || undefined,
        confirmedOverride: confirmedOverride || undefined,
      }),
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err) => {
      const ovf = isSalaryOverflow(err);
      if (ovf) setOverflow(ovf);
    },
  });

  const monthlyPay = employment.monthlyPay ? formatCurrency(employment.monthlyPay) : t.employees.notSet;
  const validAmount = !!amount && Number(amount) > 0;
  const isExternal = !!employment.employee?.isExternalEmployee;

  const handleSubmit = () => {
    setOverflow(null);
    setConfirmedOverride(false);
    m.mutate();
  };

  const handleOverride = () => {
    setConfirmedOverride(true);
    setOverflow(null);
    m.mutate();
  };

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
          <h2 className="font-semibold">{t.employees.recordSalaryPaymentTitle}</h2>
          <button onClick={onClose} className="text-xl leading-none opacity-60 hover:opacity-100">
            ×
          </button>
        </div>
        <p className="text-xs opacity-70 mb-4">
          {t.employees.periodLabel}: <strong>{formatPeriodMonth(period)}</strong> · {t.employees.monthlyTargetLabel}: <strong>{monthlyPay}</strong>
          <br />
          {isExternal
            ? t.employees.recordPaymentDescExternal
            : t.employees.recordPaymentDescConfirm}
        </p>

        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs font-medium mb-1 opacity-80">{t.employees.fieldAmount}</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 rounded-md border bg-transparent"
              style={{ borderColor: 'rgba(127,127,127,0.3)' }}
              placeholder="0.00"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium mb-1 opacity-80">{t.employees.fieldNoteOptional}</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 rounded-md border bg-transparent"
              style={{ borderColor: 'rgba(127,127,127,0.3)' }}
              placeholder={t.employees.notePlaceholder}
            />
          </label>
        </div>

        {overflow && (
          <div
            className="mt-4 p-3 rounded-lg text-xs"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}
          >
            <div className="font-semibold mb-1" style={{ color: '#F59E0B' }}>
              {t.employees.exceedsMonthlyTarget}
            </div>
            <div className="opacity-80">{overflow.message}</div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleOverride}
                disabled={m.isPending}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-white disabled:opacity-50"
                style={{ background: '#F59E0B' }}
              >
                {t.employees.overrideAndRecord}
              </button>
              <button
                onClick={() => setOverflow(null)}
                className="px-3 py-1.5 rounded-md text-xs"
                style={{ border: '1px solid rgba(127,127,127,0.3)' }}
              >
                {t.employees.adjust}
              </button>
            </div>
          </div>
        )}

        {!!m.error && !overflow && (
          <div className="mt-3 text-xs" style={{ color: '#EF4444' }}>
            {getErrorMessage(m.error)}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm" style={{ border: '1px solid rgba(127,127,127,0.3)' }}>
            {t.employees.cancel}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!validAmount || m.isPending}
            className="px-3 py-1.5 rounded-md text-sm text-white disabled:opacity-50"
            style={{ background: '#6366F1' }}
          >
            {m.isPending ? t.employees.recording : t.employees.recordPayment.replace('+ ', '')}
          </button>
        </div>
      </div>
    </div>
  );
}
