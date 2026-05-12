'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Employment,
  EmploymentStatus,
  EmploymentTier,
  employmentsApi,
} from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { useAuthStore } from '../../../store/auth.store';
import { formatCurrency, formatDate, getErrorMessage } from '../../../lib/utils';
import { useOwnerOnlyPage } from '../../../hooks/use-owner-only';
import { useConfirm } from '../../../components/ui/ConfirmDialog';
import { useT, type Translations } from '../../../lib/i18n';

type TabKey = 'active' | 'sent' | 'received' | 'archive';

const STATUS_COLORS: Record<EmploymentStatus, { bg: string; fg: string }> = {
  PENDING: { bg: 'rgba(245,158,11,0.15)', fg: '#F59E0B' },
  ACTIVE: { bg: 'rgba(16,185,129,0.15)', fg: '#10B981' },
  REJECTED: { bg: 'rgba(107,114,128,0.15)', fg: '#9CA3AF' },
  TERMINATION_REQUESTED: { bg: 'rgba(239,68,68,0.15)', fg: '#EF4444' },
  TERMINATED: { bg: 'rgba(107,114,128,0.15)', fg: '#9CA3AF' },
};

function statusLabel(t: Translations, s: EmploymentStatus): string {
  switch (s) {
    case 'PENDING': return t.employees.statusPENDING;
    case 'ACTIVE': return t.employees.statusACTIVE;
    case 'REJECTED': return t.employees.statusREJECTED;
    case 'TERMINATION_REQUESTED': return t.employees.statusTERMINATION_REQUESTED;
    case 'TERMINATED': return t.employees.statusTERMINATED;
  }
}

function tierLabel(t: Translations, tier: EmploymentTier): string {
  return tier === 'FULL' ? t.employees.tierFULL : t.employees.tierSALES_ONLY;
}

const ROLE_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: 'rgba(56,189,248,0.15)', fg: '#38BDF8' },   // sky
  { bg: 'rgba(45,212,191,0.15)', fg: '#2DD4BF' },   // teal
  { bg: 'rgba(34,211,238,0.15)', fg: '#22D3EE' },   // cyan
  { bg: 'rgba(251,113,133,0.15)', fg: '#FB7185' },  // rose
  { bg: 'rgba(244,114,182,0.15)', fg: '#F472B6' },  // pink
  { bg: 'rgba(163,230,53,0.15)', fg: '#A3E635' },   // lime
];

function roleColor(role: string): { bg: string; fg: string } {
  let hash = 0;
  const key = role.trim().toLowerCase();
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return ROLE_PALETTE[Math.abs(hash) % ROLE_PALETTE.length];
}

function tabLabel(t: Translations, k: TabKey): string {
  switch (k) {
    case 'active': return t.employees.tabActive;
    case 'sent': return t.employees.tabSent;
    case 'received': return t.employees.tabReceived;
    case 'archive': return t.employees.tabArchive;
  }
}

export default function EmployeesPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isOwner = useOwnerOnlyPage();
  const t = useT();
  const [tab, setTab] = useState<TabKey>('active');
  const [showHire, setShowHire] = useState(false);
  const [showMini, setShowMini] = useState(false);
  const [showExternal, setShowExternal] = useState(false);
  const isCurrentlyEmployee = !!user?.activeEmployment;

  const { data, isLoading } = useQuery({
    queryKey: QK.employments(),
    queryFn: () => employmentsApi.list(),
    staleTime: 15_000,
    enabled: isOwner,
  });

  const all = (data as Employment[] | undefined) ?? [];
  const myId = user?.id;

  const filtered = useMemo(() => {
    return all.filter((e) => {
      if (tab === 'active') {
        return e.status === 'ACTIVE' || e.status === 'TERMINATION_REQUESTED';
      }
      if (tab === 'sent') {
        return e.status === 'PENDING' && e.employerId === myId;
      }
      if (tab === 'received') {
        return e.status === 'PENDING' && e.employeeId === myId;
      }
      return e.status === 'REJECTED' || e.status === 'TERMINATED';
    });
  }, [all, tab, myId]);

  if (!isOwner) return null;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{isCurrentlyEmployee ? t.employees.myEmploymentTitle : t.employees.title}</h1>
          <p className="text-sm opacity-70 mt-1">
            {isCurrentlyEmployee ? t.employees.subEmployee : t.employees.subOwner}
          </p>
        </div>
        {!isCurrentlyEmployee && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowExternal(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium border"
              style={{ borderColor: 'rgba(168,85,247,0.4)', color: '#C084FC' }}
            >
              {t.employees.externalEmployee}
            </button>
            <button
              onClick={() => setShowMini(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium border"
              style={{ borderColor: 'rgba(99,102,241,0.4)', color: '#818CF8' }}
            >
              {t.employees.miniEmployee}
            </button>
            <button
              onClick={() => setShowHire(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' }}
            >
              {t.employees.hireUser}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-1 mb-4 border-b" style={{ borderColor: 'rgba(127,127,127,0.15)' }}>
        {(['active', 'sent', 'received', 'archive'] as TabKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              color: tab === k ? '#818CF8' : 'rgba(127,127,127,0.8)',
              borderBottom: tab === k ? '2px solid #818CF8' : '2px solid transparent',
            }}
          >
            {tabLabel(t, k)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm opacity-60 p-8 text-center">{t.employees.loading}</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm opacity-60 p-8 text-center">{t.employees.empty}</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <EmploymentRow key={e.id} employment={e} myId={myId} qc={qc} />
          ))}
        </div>
      )}

      {showHire && <HireModal onClose={() => setShowHire(false)} qc={qc} />}
      {showMini && <MiniEmployeeModal onClose={() => setShowMini(false)} qc={qc} />}
      {showExternal && <ExternalEmployeeModal onClose={() => setShowExternal(false)} qc={qc} />}
    </div>
  );
}

function EmploymentRow({
  employment: e,
  myId,
  qc,
}: {
  employment: Employment;
  myId?: string;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const isEmployer = e.employerId === myId;
  const counterparty = isEmployer ? e.employee : e.employer;
  const counterpartyName = counterparty?.name?.trim();
  const counterpartyUsername = counterparty?.username ?? (isEmployer ? 'employee' : 'employer');
  const isExternal = !!counterparty?.isExternalEmployee;
  const statusColor = STATUS_COLORS[e.status];
  const confirm = useConfirm();
  const t = useT();

  const onSuccess = () => qc.invalidateQueries({ queryKey: QK.employments() });
  const acceptM = useMutation({ mutationFn: () => employmentsApi.accept(e.id), onSuccess });
  const rejectM = useMutation({ mutationFn: () => employmentsApi.reject(e.id), onSuccess });
  const reqTerm = useMutation({ mutationFn: () => employmentsApi.requestTermination(e.id), onSuccess });
  const apprTerm = useMutation({ mutationFn: () => employmentsApi.approveTermination(e.id), onSuccess });
  const cancelTerm = useMutation({ mutationFn: () => employmentsApi.cancelTermination(e.id), onSuccess });
  const rejectTerm = useMutation({ mutationFn: () => employmentsApi.rejectTermination(e.id), onSuccess });
  const removeExternalM = useMutation({ mutationFn: () => employmentsApi.removeExternalEmployee(e.id), onSuccess });

  const inFlight =
    acceptM.isPending || rejectM.isPending || reqTerm.isPending ||
    apprTerm.isPending || cancelTerm.isPending || rejectTerm.isPending ||
    removeExternalM.isPending;

  const error =
    acceptM.error || rejectM.error || reqTerm.error || apprTerm.error || cancelTerm.error || rejectTerm.error ||
    removeExternalM.error;

  const handleRemoveExternal = async () => {
    const who = counterpartyName || `@${counterpartyUsername}`;
    const ok = await confirm({
      title: t.employees.removeConfirmTitle(who),
      description: t.employees.removeConfirmDescription,
      confirmLabel: t.employees.remove,
      variant: 'danger',
    });
    if (ok) removeExternalM.mutate();
  };

  return (
    <div
      className="p-4 rounded-xl border"
      style={{ borderColor: 'rgba(127,127,127,0.15)', background: 'var(--card)' }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {counterpartyName ? (
              <>
                <span className="font-semibold">{counterpartyName}</span>
                <span className="text-xs opacity-60">@{counterpartyUsername}</span>
              </>
            ) : (
              <span className="font-semibold">@{counterpartyUsername}</span>
            )}
            <span className="text-xs opacity-60">({isEmployer ? t.employees.amTheEmployer : t.employees.amTheEmployee})</span>
            <span
              className="px-2 py-0.5 text-xs rounded-md font-medium"
              style={{ background: statusColor.bg, color: statusColor.fg }}
            >
              {statusLabel(t, e.status)}
            </span>
            {isExternal ? (
              <span
                className="px-2 py-0.5 text-xs rounded-md border opacity-90"
                style={{ borderColor: 'rgba(168,85,247,0.4)', color: '#C084FC' }}
              >
                {t.employees.externalLabel}
              </span>
            ) : (
              <span className="px-2 py-0.5 text-xs rounded-md border opacity-80" style={{ borderColor: 'rgba(127,127,127,0.3)' }}>
                {tierLabel(t, e.tier)}
              </span>
            )}
            {counterparty?.role && (() => {
              const rc = roleColor(counterparty.role);
              return (
                <span
                  className="px-2 py-0.5 text-xs rounded-md font-medium"
                  style={{ background: rc.bg, color: rc.fg }}
                  title={t.employees.fieldRole}
                >
                  {counterparty.role}
                </span>
              );
            })()}
          </div>
          <div className="text-xs opacity-60 mt-1">
            {t.employees.createdLabel} {formatDate(e.createdAt)}
            {e.acceptedAt && ` · ${t.employees.acceptedLabel} ${formatDate(e.acceptedAt)}`}
            {e.terminatedAt && ` · ${t.employees.terminatedLabel} ${formatDate(e.terminatedAt)}`}
          </div>
          {e.status === 'TERMINATION_REQUESTED' && (
            <div className="text-xs mt-2 opacity-80">
              {e.terminationRequestedBy === myId
                ? t.employees.awaitingApproval
                : t.employees.otherPartyRequested}
            </div>
          )}
          {isEmployer && (e.status === 'ACTIVE' || e.status === 'TERMINATION_REQUESTED') && (
            <div className="text-xs mt-2 flex items-center gap-3 flex-wrap">
              <span className="opacity-70">
                {t.employees.monthlyPay}:{' '}
                <strong>{e.monthlyPay ? formatCurrency(e.monthlyPay) : t.employees.notSet}</strong>
              </span>
              <span
                className="px-1.5 py-0.5 rounded text-[10px]"
                style={{
                  background: e.payrollActive ? 'rgba(16,185,129,0.15)' : 'rgba(107,114,128,0.15)',
                  color: e.payrollActive ? '#10B981' : '#9CA3AF',
                }}
              >
                {e.payrollActive ? t.employees.payrollActive : t.employees.payrollPaused}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {e.status === 'PENDING' && !isEmployer && (
            <>
              <ActionBtn label={t.employees.accept} onClick={() => acceptM.mutate()} disabled={inFlight} primary />
              <ActionBtn label={t.employees.reject} onClick={() => rejectM.mutate()} disabled={inFlight} />
            </>
          )}
          {isEmployer && (e.status === 'ACTIVE' || e.status === 'TERMINATION_REQUESTED') && (
            <Link
              href={`/employees/${e.id}`}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-white"
              style={{ background: '#6366F1' }}
            >
              {t.employees.managePayroll}
            </Link>
          )}
          {isEmployer && isExternal && e.status === 'ACTIVE' && (
            <ActionBtn label={t.employees.remove} onClick={handleRemoveExternal} disabled={inFlight} />
          )}
          {!isExternal && e.status === 'ACTIVE' && (
            <ActionBtn label={t.employees.requestTermination} onClick={() => reqTerm.mutate()} disabled={inFlight} />
          )}
          {e.status === 'TERMINATION_REQUESTED' && e.terminationRequestedBy === myId && (
            <ActionBtn label={t.employees.cancelMyRequest} onClick={() => cancelTerm.mutate()} disabled={inFlight} />
          )}
          {e.status === 'TERMINATION_REQUESTED' && e.terminationRequestedBy !== myId && (
            <>
              <ActionBtn label={t.employees.approveTermination} onClick={() => apprTerm.mutate()} disabled={inFlight} primary />
              <ActionBtn label={t.employees.refuse} onClick={() => rejectTerm.mutate()} disabled={inFlight} />
            </>
          )}
        </div>
      </div>
      {!!error && (
        <div className="text-xs mt-3" style={{ color: '#EF4444' }}>
          {getErrorMessage(error)}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ label, onClick, disabled, primary }: { label: string; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-50"
      style={primary
        ? { background: '#6366F1', color: '#fff' }
        : { border: '1px solid rgba(127,127,127,0.3)' }}
    >
      {label}
    </button>
  );
}

function HireModal({ onClose, qc }: { onClose: () => void; qc: ReturnType<typeof useQueryClient> }) {
  const t = useT();
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [tier, setTier] = useState<EmploymentTier>('FULL');

  const create = useMutation({
    mutationFn: () => employmentsApi.create({ emailOrPhone, tier }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.employments() });
      onClose();
    },
  });

  return (
    <ModalShell onClose={onClose} title={t.employees.hireTitle}>
      <div className="space-y-3">
        <Field label={t.employees.fieldEmailOrPhone}>
          <input
            value={emailOrPhone}
            onChange={(e) => setEmailOrPhone(e.target.value)}
            className="w-full px-3 py-2 rounded-md border bg-transparent"
            style={{ borderColor: 'rgba(127,127,127,0.3)' }}
            placeholder="alice@example.com or +24399…"
          />
        </Field>
        <Field label={t.employees.fieldTier}>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as EmploymentTier)}
            className="w-full px-3 py-2 rounded-md border bg-transparent"
            style={{ borderColor: 'rgba(127,127,127,0.3)' }}
          >
            <option value="FULL">{t.employees.tierFullDescription}</option>
            <option value="SALES_ONLY">{t.employees.tierMiniDescription}</option>
          </select>
        </Field>
        {!!create.error && (
          <div className="text-xs" style={{ color: '#EF4444' }}>{getErrorMessage(create.error)}</div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm" style={{ border: '1px solid rgba(127,127,127,0.3)' }}>
            {t.employees.cancel}
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={!emailOrPhone || create.isPending}
            className="px-3 py-1.5 rounded-md text-sm text-white disabled:opacity-50"
            style={{ background: '#6366F1' }}
          >
            {t.employees.sendRequest}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function MiniEmployeeModal({ onClose, qc }: { onClose: () => void; qc: ReturnType<typeof useQueryClient> }) {
  const t = useT();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState<{ username: string; pairingCode: string } | null>(null);

  const create = useMutation({
    mutationFn: () => employmentsApi.createMiniEmployee({ name, phone: phone || undefined }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: QK.employments() });
      setResult({ username: res.employee.username, pairingCode: res.pairingCode });
    },
  });

  return (
    <ModalShell onClose={onClose} title={t.employees.miniTitle}>
      {result ? (
        <div className="space-y-3">
          <p className="text-sm">{t.employees.miniCreatedMessage}</p>
          <div className="p-3 rounded-md" style={{ background: 'rgba(99,102,241,0.1)' }}>
            <Row label={t.employees.fieldUsername} value={result.username} mono />
            <Row label={t.employees.fieldPairingCode} value={result.pairingCode} mono />
          </div>
          <p className="text-xs opacity-70">{t.employees.miniPairingHint}</p>
          <div className="flex justify-end pt-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm text-white" style={{ background: '#6366F1' }}>
              {t.employees.done}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label={t.employees.fieldDisplayName}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-md border bg-transparent"
              style={{ borderColor: 'rgba(127,127,127,0.3)' }}
              placeholder="Alice K."
            />
          </Field>
          <Field label={t.employees.fieldPhoneOptional}>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 rounded-md border bg-transparent"
              style={{ borderColor: 'rgba(127,127,127,0.3)' }}
              placeholder="+24399…"
            />
          </Field>
          {!!create.error && (
            <div className="text-xs" style={{ color: '#EF4444' }}>{getErrorMessage(create.error)}</div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm" style={{ border: '1px solid rgba(127,127,127,0.3)' }}>
              {t.employees.cancel}
            </button>
            <button
              onClick={() => create.mutate()}
              disabled={!name || create.isPending}
              className="px-3 py-1.5 rounded-md text-sm text-white disabled:opacity-50"
              style={{ background: '#6366F1' }}
            >
              {t.employees.create}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function ExternalEmployeeModal({ onClose, qc }: { onClose: () => void; qc: ReturnType<typeof useQueryClient> }) {
  const t = useT();
  const [name, setName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [role, setRole] = useState('');
  const [monthlyPay, setMonthlyPay] = useState('');
  const [result, setResult] = useState<{ username: string; name: string } | null>(null);

  const create = useMutation({
    mutationFn: () =>
      employmentsApi.createExternalEmployee({
        name,
        dateOfBirth: dateOfBirth || undefined,
        role: role || undefined,
        monthlyPay: monthlyPay ? Number(monthlyPay) : undefined,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: QK.employments() });
      setResult({ username: res.employee.username, name: res.employee.name });
    },
  });

  return (
    <ModalShell onClose={onClose} title={t.employees.externalTitle}>
      {result ? (
        <div className="space-y-3">
          <p className="text-sm">{t.employees.externalCreatedMessage}</p>
          <div className="p-3 rounded-md" style={{ background: 'rgba(168,85,247,0.1)' }}>
            <Row label={t.employees.fieldName} value={result.name} />
            <Row label={t.employees.fieldSystemUsername} value={result.username} mono />
          </div>
          <div className="flex justify-end pt-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm text-white" style={{ background: '#A855F7' }}>
              {t.employees.done}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs opacity-70">{t.employees.externalDescription}</p>
          <Field label={t.employees.fieldFullNameRequired}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-md border bg-transparent"
              style={{ borderColor: 'rgba(127,127,127,0.3)' }}
              placeholder="Alice K."
              autoFocus
            />
          </Field>
          <Field label={t.employees.fieldDateOfBirthOptional}>
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="w-full px-3 py-2 rounded-md border bg-transparent"
              style={{ borderColor: 'rgba(127,127,127,0.3)', colorScheme: 'dark' }}
            />
          </Field>
          <Field label={t.employees.fieldRoleOptional}>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 rounded-md border bg-transparent"
              style={{ borderColor: 'rgba(127,127,127,0.3)' }}
              placeholder={t.employees.rolePlaceholder}
            />
          </Field>
          <Field label={t.employees.fieldMonthlyPayOptional}>
            <input
              type="number"
              step="0.01"
              min="0"
              value={monthlyPay}
              onChange={(e) => setMonthlyPay(e.target.value)}
              className="w-full px-3 py-2 rounded-md border bg-transparent"
              style={{ borderColor: 'rgba(127,127,127,0.3)' }}
              placeholder={t.employees.monthlyPayPlaceholder}
            />
          </Field>
          {!!create.error && (
            <div className="text-xs" style={{ color: '#EF4444' }}>{getErrorMessage(create.error)}</div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm" style={{ border: '1px solid rgba(127,127,127,0.3)' }}>
              {t.employees.cancel}
            </button>
            <button
              onClick={() => create.mutate()}
              disabled={!name || create.isPending}
              className="px-3 py-1.5 rounded-md text-sm text-white disabled:opacity-50"
              style={{ background: '#A855F7' }}
            >
              {create.isPending ? t.employees.creating : t.employees.create}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function ModalShell({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md p-5 rounded-xl border" style={{ background: 'var(--card)', borderColor: 'rgba(127,127,127,0.2)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-xl leading-none opacity-60 hover:opacity-100">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium mb-1 opacity-80">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs opacity-70">{label}</span>
      <span className={mono ? 'text-sm font-mono select-all' : 'text-sm'}>{value}</span>
    </div>
  );
}
