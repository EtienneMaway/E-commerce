'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Employment,
  EmploymentStatus,
  EmploymentTier,
  employmentsApi,
} from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { useAuthStore } from '../../../store/auth.store';
import { formatDate, getErrorMessage } from '../../../lib/utils';

type TabKey = 'active' | 'sent' | 'received' | 'archive';

const STATUS_LABELS: Record<EmploymentStatus, string> = {
  PENDING: 'Pending',
  ACTIVE: 'Active',
  REJECTED: 'Rejected',
  TERMINATION_REQUESTED: 'Termination requested',
  TERMINATED: 'Terminated',
};

const STATUS_COLORS: Record<EmploymentStatus, { bg: string; fg: string }> = {
  PENDING: { bg: 'rgba(245,158,11,0.15)', fg: '#F59E0B' },
  ACTIVE: { bg: 'rgba(16,185,129,0.15)', fg: '#10B981' },
  REJECTED: { bg: 'rgba(107,114,128,0.15)', fg: '#9CA3AF' },
  TERMINATION_REQUESTED: { bg: 'rgba(239,68,68,0.15)', fg: '#EF4444' },
  TERMINATED: { bg: 'rgba(107,114,128,0.15)', fg: '#9CA3AF' },
};

const TIER_LABELS: Record<EmploymentTier, string> = {
  FULL: 'Full employee',
  SALES_ONLY: 'Mini (sales only)',
};

export default function EmployeesPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<TabKey>('active');
  const [showHire, setShowHire] = useState(false);
  const [showMini, setShowMini] = useState(false);
  const isCurrentlyEmployee = !!user?.activeEmployment;

  const { data, isLoading } = useQuery({
    queryKey: QK.employments(),
    queryFn: () => employmentsApi.list(),
    staleTime: 15_000,
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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{isCurrentlyEmployee ? 'My employment' : 'Employees'}</h1>
          <p className="text-sm opacity-70 mt-1">
            {isCurrentlyEmployee
              ? 'You are currently employed by another user. Hiring is disabled while you have an active employment.'
              : 'Hire users to act on your books or create mini employees for direct sales only.'}
          </p>
        </div>
        {!isCurrentlyEmployee && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowMini(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium border"
              style={{ borderColor: 'rgba(99,102,241,0.4)', color: '#818CF8' }}
            >
              + Mini Employee
            </button>
            <button
              onClick={() => setShowHire(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' }}
            >
              + Hire User
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
            {k === 'active' ? 'My Employees' : k === 'sent' ? 'Pending Sent' : k === 'received' ? 'Pending Received' : 'Archive'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm opacity-60 p-8 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm opacity-60 p-8 text-center">No employments to show.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <EmploymentRow key={e.id} employment={e} myId={myId} qc={qc} />
          ))}
        </div>
      )}

      {showHire && <HireModal onClose={() => setShowHire(false)} qc={qc} />}
      {showMini && <MiniEmployeeModal onClose={() => setShowMini(false)} qc={qc} />}
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
  const counterpartyLabel = counterparty?.username ?? (isEmployer ? 'employee' : 'employer');
  const statusColor = STATUS_COLORS[e.status];

  const onSuccess = () => qc.invalidateQueries({ queryKey: QK.employments() });
  const acceptM = useMutation({ mutationFn: () => employmentsApi.accept(e.id), onSuccess });
  const rejectM = useMutation({ mutationFn: () => employmentsApi.reject(e.id), onSuccess });
  const reqTerm = useMutation({ mutationFn: () => employmentsApi.requestTermination(e.id), onSuccess });
  const apprTerm = useMutation({ mutationFn: () => employmentsApi.approveTermination(e.id), onSuccess });
  const cancelTerm = useMutation({ mutationFn: () => employmentsApi.cancelTermination(e.id), onSuccess });
  const rejectTerm = useMutation({ mutationFn: () => employmentsApi.rejectTermination(e.id), onSuccess });

  const inFlight =
    acceptM.isPending || rejectM.isPending || reqTerm.isPending ||
    apprTerm.isPending || cancelTerm.isPending || rejectTerm.isPending;

  const error =
    acceptM.error || rejectM.error || reqTerm.error || apprTerm.error || cancelTerm.error || rejectTerm.error;

  return (
    <div
      className="p-4 rounded-xl border"
      style={{ borderColor: 'rgba(127,127,127,0.15)', background: 'var(--card)' }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{counterpartyLabel}</span>
            <span className="text-xs opacity-60">({isEmployer ? 'I am the employer' : 'I am the employee'})</span>
            <span
              className="px-2 py-0.5 text-xs rounded-md font-medium"
              style={{ background: statusColor.bg, color: statusColor.fg }}
            >
              {STATUS_LABELS[e.status]}
            </span>
            <span className="px-2 py-0.5 text-xs rounded-md border opacity-80" style={{ borderColor: 'rgba(127,127,127,0.3)' }}>
              {TIER_LABELS[e.tier]}
            </span>
          </div>
          <div className="text-xs opacity-60 mt-1">
            Created {formatDate(e.createdAt)}
            {e.acceptedAt && ` · Accepted ${formatDate(e.acceptedAt)}`}
            {e.terminatedAt && ` · Terminated ${formatDate(e.terminatedAt)}`}
          </div>
          {e.status === 'TERMINATION_REQUESTED' && (
            <div className="text-xs mt-2 opacity-80">
              {e.terminationRequestedBy === myId
                ? 'Awaiting counterparty approval to terminate.'
                : 'The other party has requested termination — approve to end, or refuse to keep going.'}
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {e.status === 'PENDING' && !isEmployer && (
            <>
              <ActionBtn label="Accept" onClick={() => acceptM.mutate()} disabled={inFlight} primary />
              <ActionBtn label="Reject" onClick={() => rejectM.mutate()} disabled={inFlight} />
            </>
          )}
          {e.status === 'ACTIVE' && (
            <ActionBtn label="Request termination" onClick={() => reqTerm.mutate()} disabled={inFlight} />
          )}
          {e.status === 'TERMINATION_REQUESTED' && e.terminationRequestedBy === myId && (
            <ActionBtn label="Cancel my request" onClick={() => cancelTerm.mutate()} disabled={inFlight} />
          )}
          {e.status === 'TERMINATION_REQUESTED' && e.terminationRequestedBy !== myId && (
            <>
              <ActionBtn label="Approve termination" onClick={() => apprTerm.mutate()} disabled={inFlight} primary />
              <ActionBtn label="Refuse" onClick={() => rejectTerm.mutate()} disabled={inFlight} />
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
    <ModalShell onClose={onClose} title="Hire user">
      <div className="space-y-3">
        <Field label="Email or phone">
          <input
            value={emailOrPhone}
            onChange={(e) => setEmailOrPhone(e.target.value)}
            className="w-full px-3 py-2 rounded-md border bg-transparent"
            style={{ borderColor: 'rgba(127,127,127,0.3)' }}
            placeholder="alice@example.com or +24399…"
          />
        </Field>
        <Field label="Tier">
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as EmploymentTier)}
            className="w-full px-3 py-2 rounded-md border bg-transparent"
            style={{ borderColor: 'rgba(127,127,127,0.3)' }}
          >
            <option value="FULL">Full employee (dashboard + mobile)</option>
            <option value="SALES_ONLY">Sales-only (mobile only — usually use Mini Employee instead)</option>
          </select>
        </Field>
        {!!create.error && (
          <div className="text-xs" style={{ color: '#EF4444' }}>{getErrorMessage(create.error)}</div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm" style={{ border: '1px solid rgba(127,127,127,0.3)' }}>
            Cancel
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={!emailOrPhone || create.isPending}
            className="px-3 py-1.5 rounded-md text-sm text-white disabled:opacity-50"
            style={{ background: '#6366F1' }}
          >
            Send request
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function MiniEmployeeModal({ onClose, qc }: { onClose: () => void; qc: ReturnType<typeof useQueryClient> }) {
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
    <ModalShell onClose={onClose} title="Add mini employee">
      {result ? (
        <div className="space-y-3">
          <p className="text-sm">
            Mini-employee created. Share these credentials with them — the pairing code is shown
            only once.
          </p>
          <div className="p-3 rounded-md" style={{ background: 'rgba(99,102,241,0.1)' }}>
            <Row label="Username" value={result.username} mono />
            <Row label="Pairing code" value={result.pairingCode} mono />
          </div>
          <p className="text-xs opacity-70">
            They sign in via the mobile app's "I have a pairing code" flow.
          </p>
          <div className="flex justify-end pt-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm text-white" style={{ background: '#6366F1' }}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Display name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-md border bg-transparent"
              style={{ borderColor: 'rgba(127,127,127,0.3)' }}
              placeholder="Alice K."
            />
          </Field>
          <Field label="Phone (optional)">
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
              Cancel
            </button>
            <button
              onClick={() => create.mutate()}
              disabled={!name || create.isPending}
              className="px-3 py-1.5 rounded-md text-sm text-white disabled:opacity-50"
              style={{ background: '#6366F1' }}
            >
              Create
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
