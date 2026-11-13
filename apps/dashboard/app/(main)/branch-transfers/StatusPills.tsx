'use client';

import type { BranchPaymentStatus, BranchTransferStatus } from '../../../lib/api';
import { useT } from '../../../lib/i18n';

const TONE = {
  warning: { background: 'rgba(var(--warning-rgb), 0.12)', color: 'var(--warning)' },
  primary: { background: 'rgba(var(--primary-rgb), 0.12)', color: 'var(--primary)' },
  danger: { background: 'rgba(var(--danger-rgb), 0.12)', color: 'var(--danger)' },
  muted: { background: 'rgba(127,127,127,0.12)', color: 'var(--muted)' },
} as const;

function Pill({ tone, label }: { tone: keyof typeof TONE; label: string }) {
  return (
    <span className="px-2 py-0.5 rounded-md text-xs whitespace-nowrap" style={TONE[tone]}>
      {label}
    </span>
  );
}

export function TransferStatusPill({ status }: { status: BranchTransferStatus }) {
  const t = useT().branchTransfers;
  switch (status) {
    case 'IN_TRANSIT':
      return <Pill tone="warning" label={t.statusInTransit} />;
    case 'RECEIVED':
      return <Pill tone="primary" label={t.statusReceived} />;
    case 'REJECTED':
      return <Pill tone="danger" label={t.statusRejected} />;
    case 'CANCELLED':
      return <Pill tone="muted" label={t.statusCancelled} />;
  }
}

export function PaymentStatusPill({ status }: { status: BranchPaymentStatus }) {
  const t = useT().branchTransfers;
  switch (status) {
    case 'PENDING':
      return <Pill tone="warning" label={t.payStatusPending} />;
    case 'CONFIRMED':
      return <Pill tone="primary" label={t.payStatusConfirmed} />;
    case 'REJECTED':
      return <Pill tone="danger" label={t.payStatusRejected} />;
  }
}
