'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Employment,
  EmploymentParty,
  MiniSettlement,
  SalaryPayment,
  SalaryPaymentStatus,
  employmentsApi,
  miniSettlementsApi,
  salaryPaymentsApi,
  currencyApi,
  inventoryApi,
} from '../../../../lib/api';
import { QK } from '../../../../lib/query-keys';
import { useOwnerOnlyPage } from '../../../../hooks/use-owner-only';
import { useConfirm } from '../../../../components/ui/ConfirmDialog';
import { SendConsignmentDialog } from '../../../../components/forms/SendConsignmentDialog';
import { useT, type Translations } from '../../../../lib/i18n';
import { useLocaleStore } from '../../../../store/locale.store';
import { useCurrencyStore } from '../../../../store/currency.store';
import { useFormatCurrency } from '../../../../lib/currency';
import {
  formatCurrency,
  formatDate,
  getErrorMessage,
  breakdownQuantity,
  formatBreakdown,
} from '../../../../lib/utils';

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
  const [tab, setTab] = useState<'profile' | 'activities' | 'salary'>('profile');

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
  const isMini = employment.tier === 'SALES_ONLY' && !isExternal && !!employee?.id;
  const displayName = employee?.name?.trim() || employee?.username || t.employees.title.slice(0, -1);
  const activeTab = tab === 'activities' && !isMini ? 'profile' : tab;

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

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b" style={{ borderColor: 'rgba(127,127,127,0.15)' }}>
        <TabButton active={activeTab === 'profile'} onClick={() => setTab('profile')}>{t.employees.tabProfile}</TabButton>
        {isMini && (
          <TabButton active={activeTab === 'activities'} onClick={() => setTab('activities')}>{t.employees.tabActivities}</TabButton>
        )}
        <TabButton active={activeTab === 'salary'} onClick={() => setTab('salary')}>{t.employees.tabSalary}</TabButton>
      </div>

      {activeTab === 'profile' && (
        <ProfilePanel
          employmentId={employment.id}
          employee={employee}
          isExternal={isExternal}
          disabled={isClosed}
          onChange={invalidate}
        />
      )}

      {activeTab === 'activities' && isMini && employee?.id && (
        <MiniOversight
          miniUserId={employee.id}
          miniUsername={employee.username}
          canGive={!isClosed}
        />
      )}

      {activeTab === 'salary' && (
        <>
          <SalaryPanel employment={employment} onChange={invalidate} disabled={isClosed} />

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
        </>
      )}

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

function MiniOversight({
  miniUserId,
  miniUsername,
  canGive,
}: {
  miniUserId: string;
  miniUsername: string;
  canGive: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  // Activity is scoped to one handover cycle at a time, navigated with prev/next
  // arrows. navOffset = how many cycles back from the current (open) one: 0 =
  // current cycle (since the last approved handover), 1 = the cycle the last
  // handover settled, and so on.
  const [navOffset, setNavOffset] = useState(0);
  const [giveOpen, setGiveOpen] = useState(false);
  const [subTab, setSubTab] = useState<'sales' | 'handovers'>('sales');
  // Both activity tables paginate at 5 rows; pages reset whenever the selected
  // cycle changes (see the effect once cycleIdx is known).
  const [givenPage, setGivenPage] = useState(0);
  const [salesPage, setSalesPage] = useState(0);

  // A mini's figures are locked to each batch's give-time rate, so the FC toggle
  // shows the server's locked-FC values (NOT a live conversion). USD comes
  // straight from the ledger. Outstanding is a live balance → standard formatter.
  const displayCurrency = useCurrencyStore((s) => s.displayCurrency);
  const fmtLive = useFormatCurrency();
  const fcStr = (n: number): string =>
    new Intl.NumberFormat('fr-CD').format(Math.trunc(Number.isFinite(n) ? n : 0)) + ' FC';
  /** Currency-aware: FC mode uses the server's locked-FC value; USD mode the ledger USD. */
  const money = (usd: string, fc: string): string =>
    displayCurrency === 'FC' ? fcStr(parseFloat(fc) || 0) : formatCurrency(usd);
  /** For rows where only the batch rate is known: FC = usd × locked rate. */
  const moneyAtRate = (usd: string, rate: string | null): string => {
    if (displayCurrency !== 'FC') return formatCurrency(usd);
    if (!rate) return formatCurrency(usd); // pre-snapshot: no locked rate to apply
    return fcStr((parseFloat(usd) || 0) * (parseFloat(rate) || 0));
  };
  const fmtRate = (rate: string | null): string =>
    rate ? `1$ = ${new Intl.NumberFormat('fr-CD').format(Math.trunc(parseFloat(rate) || 0))} FC` : '—';

  // Product → piecesPerCarton, so quantities in this panel can render as
  // cartons/dozens/pieces (like the sales page). The activity/handover payloads
  // carry only raw piece counts; this owner-side map supplies the carton size.
  // Keyed by productName, which is normalized lowercase on both sides.
  const { data: productsData } = useQuery<{ productName: string; piecesPerCarton: number | null }[]>({
    queryKey: QK.inventoryProducts,
    queryFn: () => inventoryApi.listProducts(),
    staleTime: 60_000,
  });
  const ppcMap = useMemo(
    () => new Map((productsData ?? []).map((p) => [p.productName, p.piecesPerCarton])),
    [productsData],
  );

  const { data: handovers } = useQuery({
    queryKey: QK.miniSettlementsIncoming,
    queryFn: () => miniSettlementsApi.incoming(),
    // No polling: useInboxSignal invalidates this key when the handovers stamp
    // moves (a mini submits a handover for approval).
  });

  // Handover cycles: approved handovers split this mini's timeline into windows.
  // Ascending approval instants are the cycle boundaries; there are (n + 1)
  // cycles — n closed ones each ending at a handover, plus the open current one.
  const boundaries = useMemo(
    () =>
      (handovers ?? [])
        .filter((h) => h.miniId === miniUserId && h.status === 'APPROVED' && h.approvedAt)
        .map((h) => new Date(h.approvedAt as string).getTime())
        .sort((a, b) => a - b),
    [handovers, miniUserId],
  );
  const cycleCount = boundaries.length; // = number of closed cycles; current index = cycleCount
  const clampedOffset = Math.min(navOffset, cycleCount); // can't go older than the first cycle
  const cycleIdx = cycleCount - clampedOffset; // 0 = oldest cycle … cycleCount = current
  const isCurrentCycle = cycleIdx === cycleCount;
  // The selected window: (from, to]. from = previous handover instant (+1ms so
  // it's exclusive, matching handover settlement), to = this cycle's closing
  // handover (null = open/now for the current cycle).
  const windowFromMs = cycleIdx === 0 ? null : boundaries[cycleIdx - 1] + 1;
  const windowToMs = cycleIdx < cycleCount ? boundaries[cycleIdx] : null;

  const params = useMemo(() => {
    const p: { dateFrom?: string; dateTo?: string } = {};
    if (windowFromMs != null) p.dateFrom = new Date(windowFromMs).toISOString();
    if (windowToMs != null) p.dateTo = new Date(windowToMs).toISOString();
    return p;
  }, [windowFromMs, windowToMs]);

  const { data: activity, isLoading } = useQuery({
    queryKey: QK.miniActivity(miniUserId, params),
    queryFn: () => miniSettlementsApi.miniActivity(miniUserId, params),
    enabled: !!miniUserId,
    // No polling: useInboxSignal invalidates the miniActivity prefix when the
    // handovers stamp moves, refreshing whichever cycle window is on screen.
  });

  // Reset both tables to page 1 when the cycle window changes.
  useEffect(() => {
    setGivenPage(0);
    setSalesPage(0);
  }, [cycleIdx]);

  // Paginate the two activity tables at 5 rows each (clamped so a shrinking list
  // — e.g. after a background refetch — never strands you on an empty page).
  const PAGE_SIZE = 5;
  const givenRows = activity?.given ?? [];
  const givenPageCount = Math.max(1, Math.ceil(givenRows.length / PAGE_SIZE));
  const givenClamped = Math.min(givenPage, givenPageCount - 1);
  const givenSlice = givenRows.slice(givenClamped * PAGE_SIZE, givenClamped * PAGE_SIZE + PAGE_SIZE);
  const salesRows = activity?.sales ?? [];
  const salesPageCount = Math.max(1, Math.ceil(salesRows.length / PAGE_SIZE));
  const salesClamped = Math.min(salesPage, salesPageCount - 1);
  const salesSlice = salesRows.slice(salesClamped * PAGE_SIZE, salesClamped * PAGE_SIZE + PAGE_SIZE);

  // Live rate — only a fallback for legacy handovers with no locked-FC snapshot.
  const { data: rateData } = useQuery({
    queryKey: ['currency', 'rate'],
    queryFn: () => currencyApi.getRate(),
    staleTime: 5 * 60_000,
  });
  const liveRate = parseFloat(rateData?.usdToFcRate ?? '1') || 1;
  const pending = (handovers ?? []).filter(
    (h) => h.miniId === miniUserId && h.status === 'PENDING',
  );
  // Full handover history for this mini, newest first — every settlement they've
  // ever submitted, each carrying its own status flag (pending/approved/
  // rejected). Tells the owner exactly what the mini has worked through so far.
  const allHandovers = (handovers ?? [])
    .filter((h) => h.miniId === miniUserId)
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  // Boundary for "already handed over": the most recent approved handover's
  // timestamp. Sales on/before it were settled in a handover; sales after it
  // are the current, un-handed-over cycle. 0 = no approved handover yet.
  const lastApprovedAt = (handovers ?? [])
    .filter((h) => h.miniId === miniUserId && h.status === 'APPROVED' && h.approvedAt)
    .reduce<number>((max, h) => Math.max(max, new Date(h.approvedAt as string).getTime()), 0);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['mini-settlements'] });
    qc.invalidateQueries({ queryKey: QK.dashboard });
  };

  return (
    <div
      className="p-5 rounded-xl border"
      style={{ borderColor: 'rgba(127,127,127,0.15)', background: 'var(--card)' }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            {t.employees.miniOversightTitle}
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}
            >
              ● {t.employees.miniLive}
            </span>
          </h2>
          <p className="text-xs opacity-60 mt-1 max-w-xl">{t.employees.miniOversightHint}</p>
        </div>
        <button
          onClick={() => setGiveOpen(true)}
          disabled={!canGive}
          className="px-3 py-1.5 rounded-md text-sm text-white disabled:opacity-50"
          style={{ background: '#6366F1' }}
        >
          {t.employees.miniGiveProducts}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
        <SummaryCard label={t.employees.miniGiven} value={money(activity?.givenInPeriod ?? '0', activity?.givenInPeriodFc ?? '0')} />
        <SummaryCard
          label={t.employees.miniSold}
          // The agreed value of what sold — i.e. the cash the mini must hand over
          // for it — NOT the customer-facing sale price. The mini's markup lives
          // in "Their markup" so the two don't double-count.
          value={money(activity?.soldAtAgreedPrice ?? '0', activity?.soldAtAgreedPriceFc ?? '0')}
          accent="#10B981"
        />
        <SummaryCard label={t.employees.miniMarkup} value={money(activity?.markup ?? '0', activity?.markupFc ?? '0')} accent="#818CF8" />
        <SummaryCard label={t.employees.miniOutstanding} value={fmtLive(activity?.outstanding ?? '0')} accent="#F59E0B" />
        <SummaryCard label={t.employees.miniStillOut} value={`${activity?.stillOutUnits ?? 0}`} />
      </div>

      {/* Handover-cycle navigator — steps the whole activity view through one
          settlement window at a time (previous = older cycle, next = newer). */}
      <div className="flex items-center justify-center gap-3 mt-4 text-xs">
        {(() => {
          const prevEnabled = cycleIdx !== 0;
          const nextEnabled = !isCurrentCycle;
          // Clickable arrows get an indigo accent (border + tint + text) so it's
          // obvious which direction you can still navigate; the end of the range
          // reads as a muted, plainly-disabled button.
          const navStyle = (enabled: boolean) =>
            enabled
              ? { borderColor: 'rgba(99,102,241,0.5)', color: '#818CF8', background: 'rgba(99,102,241,0.08)' }
              : { borderColor: 'rgba(127,127,127,0.25)' };
          return (
        <>
        <button
          onClick={() => setNavOffset((o) => Math.min(cycleCount, o + 1))}
          disabled={!prevEnabled}
          className="px-2.5 py-1 rounded-md border font-medium transition-colors disabled:opacity-30 disabled:font-normal"
          style={navStyle(prevEnabled)}
        >
          ← {t.employees.miniCyclePrev}
        </button>
        <div className="text-center min-w-[10rem]">
          <div className="font-medium">
            {isCurrentCycle
              ? t.employees.miniCycleCurrent
              : `${t.employees.miniCycleWord} ${cycleIdx + 1} / ${cycleCount + 1}`}
          </div>
          <div className="opacity-60">
            {windowFromMs != null ? formatDate(new Date(windowFromMs).toISOString()) : t.employees.miniCycleStart}
            {' → '}
            {windowToMs != null ? formatDate(new Date(windowToMs).toISOString()) : t.employees.miniCycleNow}
          </div>
        </div>
        <button
          onClick={() => setNavOffset((o) => Math.max(0, o - 1))}
          disabled={!nextEnabled}
          className="px-2.5 py-1 rounded-md border font-medium transition-colors disabled:opacity-30 disabled:font-normal"
          style={navStyle(nextEnabled)}
        >
          {t.employees.miniCycleNext} →
        </button>
        </>
          );
        })()}
      </div>

      {/* Sub-tabs: items & live sales · handovers */}
      <div className="flex gap-1 mt-5 border-b" style={{ borderColor: 'rgba(127,127,127,0.15)' }}>
        <TabButton active={subTab === 'sales'} onClick={() => setSubTab('sales')}>{t.employees.subTabSales}</TabButton>
        <TabButton active={subTab === 'handovers'} onClick={() => setSubTab('handovers')}>
          {t.employees.subTabHandovers}{pending.length > 0 ? ` (${pending.length})` : ''}
        </TabButton>
      </div>

      {subTab === 'sales' && (
        <>
      {/* What was given (per consignment) */}
      <div className="mt-4">
        <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#818CF8' }}>{t.employees.miniGivenTitle}</h3>
        {!activity?.given.length ? (
          <div className="text-sm opacity-60 p-4 text-center rounded-lg border" style={{ borderColor: 'rgba(127,127,127,0.15)' }}>
            {t.employees.miniGivenEmpty}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs opacity-60 text-left">
                  <th className="py-1.5 pr-3 font-medium">{t.employees.miniColProduct}</th>
                  <th className="py-1.5 pr-3 font-medium text-right">{t.employees.miniColGiven}</th>
                  <th className="py-1.5 pr-3 font-medium text-right">{t.employees.miniColRate}</th>
                  <th className="py-1.5 pr-3 font-medium text-right">{t.employees.miniColValue}</th>
                  <th className="py-1.5 font-medium text-right">{t.employees.miniColDate}</th>
                </tr>
              </thead>
              <tbody>
                {givenSlice.map((g, i) => (
                  <tr key={givenClamped * PAGE_SIZE + i} className="border-t" style={{ borderColor: 'rgba(127,127,127,0.1)' }}>
                    <td className="py-1.5 pr-3 capitalize">{g.productName}</td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                      {formatBreakdown(breakdownQuantity(g.quantity, ppcMap.get(g.productName) ?? null))}
                    </td>
                    <td className="py-1.5 pr-3 text-right opacity-60 whitespace-nowrap">{fmtRate(g.usdToFcRateSnapshot)}</td>
                    <td className="py-1.5 pr-3 text-right opacity-80">
                      {money(String((parseFloat(g.agreedUnitPrice) || 0) * g.quantity), g.agreedValueFc)}
                    </td>
                    <td className="py-1.5 text-right opacity-60 whitespace-nowrap">{formatDate(g.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager
              page={givenClamped}
              pageCount={givenPageCount}
              total={givenRows.length}
              pageSize={PAGE_SIZE}
              onPrev={() => setGivenPage((p) => Math.max(0, p - 1))}
              onNext={() => setGivenPage((p) => Math.min(givenPageCount - 1, p + 1))}
            />
          </div>
        )}
      </div>

      {/* Live sales feed */}
      <div className="mt-4">
        <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#818CF8' }}>{t.employees.miniSalesFeed}</h3>
        {isLoading ? (
          <div className="text-sm opacity-60 p-4 text-center">{t.employees.loading}</div>
        ) : !activity?.sales.length ? (
          <div className="text-sm opacity-60 p-4 text-center rounded-lg border" style={{ borderColor: 'rgba(127,127,127,0.15)' }}>
            {t.employees.miniNoSales}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs opacity-60 text-left">
                  <th className="py-1.5 pr-3 font-medium">{t.employees.miniColProduct}</th>
                  <th className="py-1.5 pr-3 font-medium text-right">{t.employees.miniColQty}</th>
                  <th className="py-1.5 pr-3 font-medium text-right">{t.employees.miniColAgreed}</th>
                  <th className="py-1.5 pr-3 font-medium text-right">{t.employees.miniColSold}</th>
                  <th className="py-1.5 pr-3 font-medium text-right">{t.employees.miniColMarkup}</th>
                  <th className="py-1.5 font-medium text-right">{t.employees.miniColDate}</th>
                </tr>
              </thead>
              <tbody>
                {salesSlice.map((s) => {
                  const up = Number(s.markup) > 0;
                  // A sale dated on/before the last approved handover has already
                  // been settled — flag it so the owner can tell reconciled sales
                  // apart from the current, still-owed cycle at a glance.
                  const handedOver =
                    lastApprovedAt > 0 && new Date(s.date).getTime() <= lastApprovedAt;
                  return (
                    <tr key={s.id} className="border-t" style={{ borderColor: 'rgba(127,127,127,0.1)' }}>
                      <td className="py-1.5 pr-3 capitalize">
                        <span className="inline-flex items-center gap-1.5">
                          {s.productName}
                          {handedOver && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
                              style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}
                              title={t.employees.miniHandedOverHint}
                            >
                              ✓ {t.employees.miniHandedOver}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                        {formatBreakdown(breakdownQuantity(s.qtySold, ppcMap.get(s.productName) ?? null))}
                      </td>
                      <td className="py-1.5 pr-3 text-right opacity-70">{moneyAtRate(s.agreedUnitPrice, s.usdToFcRateSnapshot)}</td>
                      <td className="py-1.5 pr-3 text-right">{moneyAtRate(s.salePrice, s.usdToFcRateSnapshot)}</td>
                      <td className="py-1.5 pr-3 text-right" style={{ color: up ? '#10B981' : undefined }}>
                        {up ? '+' : ''}{moneyAtRate(s.markup, s.usdToFcRateSnapshot)}
                      </td>
                      <td className="py-1.5 text-right opacity-60 whitespace-nowrap">{formatDate(s.date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pager
              page={salesClamped}
              pageCount={salesPageCount}
              total={salesRows.length}
              pageSize={PAGE_SIZE}
              onPrev={() => setSalesPage((p) => Math.max(0, p - 1))}
              onNext={() => setSalesPage((p) => Math.min(salesPageCount - 1, p + 1))}
            />
          </div>
        )}
      </div>

        </>
      )}

      {subTab === 'handovers' && (
      <div className="mt-4">
        <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#818CF8' }}>
          {t.employees.miniHandoverHistory}
          {pending.length > 0 && (
            <span className="ml-1 opacity-60">· {pending.length} {t.employees.miniHoPendingSuffix}</span>
          )}
        </h3>
        {allHandovers.length === 0 ? (
          <div className="text-xs opacity-60 p-3 text-center rounded-lg border" style={{ borderColor: 'rgba(127,127,127,0.15)' }}>
            {t.employees.miniNoHandovers}
          </div>
        ) : (
          <div className="space-y-2">
            {allHandovers.map((h) => (
              <HandoverRow key={h.id} handover={h} onChange={invalidate} liveRate={liveRate} ppcMap={ppcMap} />
            ))}
          </div>
        )}
      </div>
      )}

      <SendConsignmentDialog
        open={giveOpen}
        onClose={() => { setGiveOpen(false); invalidate(); }}
        fixedDebtor={{ id: miniUserId, username: miniUsername }}
        heading={t.employees.miniEntrust}
        submitLabel={t.employees.miniEntrust}
      />
    </div>
  );
}

function HandoverRow({ handover, onChange, liveRate, ppcMap }: { handover: MiniSettlement; onChange: () => void; liveRate: number; ppcMap: Map<string, number | null> }) {
  const t = useT();
  const approveM = useMutation({
    mutationFn: () => miniSettlementsApi.approve(handover.id),
    onSuccess: onChange,
  });
  const rejectM = useMutation({
    mutationFn: () => miniSettlementsApi.reject(handover.id),
    onSuccess: onChange,
  });
  const busy = approveM.isPending || rejectM.isPending;
  const err = approveM.error || rejectM.error;

  // Only pending handovers are actionable; approved/rejected render read-only
  // with their status flag so the row doubles as history.
  const isPending = handover.status === 'PENDING';
  const statusMeta: Record<MiniSettlement['status'], { bg: string; fg: string; label: string }> = {
    PENDING: { bg: 'rgba(245,158,11,0.15)', fg: '#F59E0B', label: t.employees.miniHoStatusPending },
    APPROVED: { bg: 'rgba(16,185,129,0.15)', fg: '#10B981', label: t.employees.miniHoStatusApproved },
    REJECTED: { bg: 'rgba(239,68,68,0.15)', fg: '#EF4444', label: t.employees.miniHoStatusRejected },
  };
  const st = statusMeta[handover.status] ?? statusMeta.PENDING;

  // Reconciliation: what the mini accounted for splits into the cash to receive
  // (for goods sold) and the standing value of the items coming back unsold.
  //   given = to receive + standing
  const standing = handover.items.reduce(
    (s, it) => s + (parseFloat(it.agreedUnitPrice) || 0) * it.quantity,
    0,
  );
  const receive = parseFloat(handover.cashAmount) || 0;
  const given = receive + standing;

  // Expenses the mini claimed on this handover (FC-native). They reduce the
  // physical cash handed over and book as the owner's expenses on approval.
  const expenses = handover.expenses ?? [];
  const expensesFc = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const fcStr = (n: number): string =>
    new Intl.NumberFormat('fr-CD').format(Math.trunc(Number.isFinite(n) ? n : 0)) + ' FC';

  // Net pay = sold-in-FC (locked rates) − expenses. This is the physical cash
  // the owner actually receives from this handover. Falls back to a live-rate
  // conversion only for legacy handovers with no locked-FC snapshot.
  const soldFc = handover.cashAmountFc != null ? parseFloat(handover.cashAmountFc) : receive * liveRate;
  const netPayFc = Math.max(0, soldFc - expensesFc);

  return (
    <div className="p-3 rounded-lg border" style={{ borderColor: 'rgba(127,127,127,0.15)', background: 'var(--card)' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {/* Given = To receive (cash) + Standing (returns value) */}
          <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
            <span className="inline-flex items-baseline gap-1.5">
              <span className="text-xs opacity-60">{t.employees.miniHoGiven}</span>
              <span className="font-semibold">{formatCurrency(given.toFixed(4))}</span>
            </span>
            <span className="inline-flex items-baseline gap-1.5">
              <span className="text-xs opacity-60">{t.employees.miniHoReceive}</span>
              <span className="font-semibold" style={{ color: '#10B981' }}>{formatCurrency(receive.toFixed(4))}</span>
            </span>
            <span className="inline-flex items-baseline gap-1.5">
              <span className="text-xs opacity-60">{t.employees.miniHoStanding}</span>
              <span className="font-semibold" style={{ color: '#F59E0B' }}>{formatCurrency(standing.toFixed(4))}</span>
            </span>
            <span className="text-xs opacity-50">· {formatDate(handover.createdAt)}</span>
            {handover.status === 'APPROVED' && handover.approvedAt && (
              <span className="text-xs opacity-50">· {t.employees.miniHoApprovedOn} {formatDate(handover.approvedAt)}</span>
            )}
          </div>
          {handover.items.length > 0 && (
            <div className="text-xs opacity-70 mt-1">
              {t.employees.miniReturns}: {handover.items.map((it) => {
                // A variant (sized) item is counted in its own unit, so the
                // group's carton size doesn't apply — show a plain piece count
                // for those; break whole-product items into cartons/dozens/pcs.
                const ppc = it.variantLabel ? null : (ppcMap.get(it.productName) ?? null);
                const qty = formatBreakdown(breakdownQuantity(it.quantity, ppc));
                return `${it.productName}${it.variantLabel ? ` (${it.variantLabel})` : ''} — ${qty}`;
              }).join(', ')}
            </div>
          )}
          {expenses.length > 0 && (
            <div className="text-xs mt-1.5">
              <span className="opacity-60">{t.employees.miniHoExpenses}: </span>
              <span className="font-medium" style={{ color: '#EF4444' }}>{fcStr(expensesFc)}</span>
              <span className="opacity-60"> · {t.employees.miniHoExpensesHint}</span>
              <ul className="mt-0.5 ml-1 space-y-0.5">
                {expenses.map((e) => (
                  <li key={e.id} className="opacity-70 capitalize">
                    {e.category.toLowerCase()}
                    {e.description ? ` · ${e.description}` : ''} — {fcStr(parseFloat(e.amount) || 0)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {handover.note && <div className="text-xs opacity-60 mt-1 italic">{handover.note}</div>}
          {!!err && <div className="text-xs mt-1" style={{ color: '#EF4444' }}>{getErrorMessage(err)}</div>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
            style={{ background: st.bg, color: st.fg }}
          >
            {st.label}
          </span>
          {isPending && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => approveM.mutate()}
                disabled={busy}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-white disabled:opacity-50"
                style={{ background: '#10B981' }}
              >
                {approveM.isPending ? t.employees.miniApproving : t.employees.miniApprove}
              </button>
              <button
                onClick={() => rejectM.mutate()}
                disabled={busy}
                className="px-3 py-1.5 rounded-md text-xs disabled:opacity-50"
                style={{ border: '1px solid rgba(239,68,68,0.4)', color: '#F87171' }}
              >
                {rejectM.isPending ? t.employees.miniRejecting : t.employees.miniReject}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Net pay — what the owner physically receives (sold in FC − expenses).
          Sits at the bottom-right below the actions; wraps to its own line on
          small screens. Hidden for rejected handovers (no cash changed hands). */}
      {handover.status !== 'REJECTED' && (
        <div className="flex justify-end items-baseline gap-1.5 mt-2 pt-2 border-t" style={{ borderColor: 'rgba(127,127,127,0.12)' }}>
          <span className="text-xs opacity-60">{t.employees.miniNetPay}:</span>
          <span className="font-bold" style={{ color: '#10B981' }}>{fcStr(netPayFc)}</span>
        </div>
      )}
    </div>
  );
}

function Pager({
  page,
  pageCount,
  total,
  pageSize,
  onPrev,
  onNext,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (pageCount <= 1) return null; // a single page (≤ pageSize rows) needs no controls
  const start = page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);
  const btn = 'px-2 py-0.5 rounded border disabled:opacity-30';
  return (
    <div className="flex items-center justify-between mt-2 text-xs opacity-70">
      <span className="tabular-nums">{start}–{end} / {total}</span>
      <div className="flex items-center gap-2">
        <button onClick={onPrev} disabled={page === 0} className={btn} style={{ borderColor: 'rgba(127,127,127,0.3)' }}>←</button>
        <span className="tabular-nums">{page + 1} / {pageCount}</span>
        <button onClick={onNext} disabled={page >= pageCount - 1} className={btn} style={{ borderColor: 'rgba(127,127,127,0.3)' }}>→</button>
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

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 text-sm font-medium transition-colors"
      style={{
        color: active ? '#818CF8' : 'rgba(127,127,127,0.8)',
        borderBottom: active ? '2px solid #818CF8' : '2px solid transparent',
      }}
    >
      {children}
    </button>
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
