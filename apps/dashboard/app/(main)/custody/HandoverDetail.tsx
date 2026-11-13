'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  custodyApi,
  type CustodyAdjustmentKind,
  type CustodyHandover,
  type CustodyHandoverStatus,
} from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import {
  breakdownQuantity,
  formatBreakdown,
  formatDate,
  getErrorMessage,
  initialsOf,
} from '../../../lib/utils';
import { useT } from '../../../lib/i18n';
import { useToast } from '../../../components/ui/Toast';

const fc = (v: string | number): string => Number(v).toLocaleString('fr-CD');

const STATUS_STYLE: Record<CustodyHandoverStatus, { bg: string; fg: string }> = {
  PENDING: { bg: 'rgba(var(--warning-rgb), 0.12)', fg: 'var(--warning)' },
  APPROVED: { bg: 'rgba(var(--primary-rgb), 0.12)', fg: 'var(--primary)' },
  REJECTED: { bg: 'rgba(var(--danger-rgb), 0.12)', fg: 'var(--danger)' },
};

/**
 * One handover, and the owner's decision on it.
 *
 * The difference between what the books expected and what came back is shown but
 * never acted on automatically — the owner types the shortage in themselves with
 * a reason. That was the explicit requirement, and it is the honest design: the
 * gap between the books and the shelf is a judgement about a person, not an
 * arithmetic result.
 */
export default function HandoverDetail({
  handoverId,
  canWrite,
  onClose,
}: {
  handoverId: string;
  canWrite: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const t = useT();
  const toast = useToast();
  const fail = (e: unknown): void =>
    toast({ variant: 'error', title: t.toasts.errorTitle, description: getErrorMessage(e) });
  const KIND_LABEL: Record<CustodyAdjustmentKind, string> = {
    CASH_SHORT: t.custody.kindCashShort,
    CASH_OVER: t.custody.kindCashOver,
    ITEM_MISSING: t.custody.kindItemMissing,
    ITEM_FOUND: t.custody.kindItemFound,
    OTHER: t.custody.kindOther,
  };
  const [kind, setKind] = useState<CustodyAdjustmentKind>('CASH_SHORT');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: QK.custodyHandover(handoverId),
    queryFn: () => custodyApi.handover(handoverId),
  });

  const invalidate = (): void => {
    qc.invalidateQueries({ queryKey: QK.custodyHandover(handoverId) });
    qc.invalidateQueries({ queryKey: ['custody', 'handovers'] });
  };

  const addLine = useMutation({
    mutationFn: () =>
      custodyApi.addAdjustment(handoverId, {
        kind,
        amountFc: amount.trim() || undefined,
        note: note.trim(),
      }),
    onSuccess: () => {
      invalidate();
      setAmount('');
      setNote('');
      toast({ variant: 'success', title: t.custody.toastLineAddedTitle });
    },
    onError: fail,
  });
  const removeLine = useMutation({
    mutationFn: (id: string) => custodyApi.removeAdjustment(id),
    onSuccess: () => {
      invalidate();
      toast({ variant: 'success', title: t.custody.toastLineRemovedTitle });
    },
    onError: fail,
  });
  const approve = useMutation({
    mutationFn: () => custodyApi.approveHandover(handoverId),
    onSuccess: () => {
      invalidate();
      // A handover now always declares everything held, so approving it
      // usually ends the custody — refetch so the volume tab switches back to
      // "nobody is in charge" instead of showing a stale, empty appointment.
      qc.invalidateQueries({ queryKey: QK.custodyCurrent });
      toast({ variant: 'success', title: t.custody.toastSettledTitle });
      onClose();
    },
    onError: fail,
  });
  const reject = useMutation({
    mutationFn: () => custodyApi.rejectHandover(handoverId, rejectReason.trim() || undefined),
    onSuccess: () => {
      invalidate();
      toast({ variant: 'success', title: t.custody.toastSentBackTitle });
      onClose();
    },
    onError: fail,
  });

  const h = data as CustodyHandover | undefined;
  const diff = h ? Number(h.cashDeclaredFc) - Number(h.cashExpectedFc) : 0;
  const isCashLine = kind === 'CASH_SHORT' || kind === 'CASH_OVER';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl border w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--card)', borderColor: 'rgba(127,127,127,0.2)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading || !h ? (
          <div className="p-8">
            <div className="skeleton h-40 rounded-xl" />
          </div>
        ) : (
          <div>
            <div
              className="flex items-start justify-between gap-4 p-6 pb-5"
              style={{ borderBottom: '1px solid rgba(127,127,127,0.12)' }}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                  style={{ background: 'var(--brand-gradient)', color: '#fff' }}
                >
                  {initialsOf(h.custodian?.name ?? h.custodian?.username ?? '?')}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-semibold truncate">
                      {h.custodian?.name ?? h.custodian?.username ?? 'Handover'}
                    </h2>
                    <span
                      className="px-2 py-0.5 rounded-md text-xs font-medium shrink-0"
                      style={{
                        background: STATUS_STYLE[h.status].bg,
                        color: STATUS_STYLE[h.status].fg,
                      }}
                    >
                      {h.status === 'PENDING'
                        ? t.custody.statusPending
                        : h.status === 'APPROVED'
                          ? t.custody.statusApproved
                          : t.custody.statusRejected}
                    </span>
                  </div>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
                    {formatDate(h.periodStart)} → {formatDate(h.periodEnd)}
                  </p>
                </div>
              </div>
              <button className="btn btn-ghost shrink-0" onClick={onClose}>
                {t.custody.close}
              </button>
            </div>

            <div className="p-6">
              <div className="grid gap-3 sm:grid-cols-4 mb-4">
                {[
                  // Sold is what is left of expected once every other part is
                  // taken out — branch cash included (0 before branch transfers).
                  [
                    t.custody.sold,
                    fc(
                      Number(h.cashExpectedFc) -
                        Number(h.miniRollupCashFc) +
                        Number(h.expensesFc) -
                        Number(h.branchReceivedFc ?? 0) +
                        Number(h.branchPaidOutFc ?? 0),
                    ),
                  ],
                  [t.custody.fromMinis, fc(h.miniRollupCashFc)],
                  [t.custody.spent, `−${fc(h.expensesFc)}`],
                  ...(Number(h.branchPaidOutFc ?? 0) !== 0 || Number(h.branchReceivedFc ?? 0) !== 0
                    ? [[t.custody.branchCash, fc(Number(h.branchReceivedFc) - Number(h.branchPaidOutFc))]]
                    : []),
                  [t.custody.expectedBack, fc(h.cashExpectedFc)],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl p-3"
                    style={{ background: 'var(--surface)' }}
                  >
                    <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>
                      {label}
                    </div>
                    <div className="text-base font-semibold tabular-nums">{value}</div>
                  </div>
                ))}
              </div>

              <div
                className="rounded-xl p-4 mb-6 flex items-center justify-between gap-4 flex-wrap"
                style={{
                  background:
                    diff < 0
                      ? 'rgba(var(--danger-rgb), 0.08)'
                      : 'rgba(var(--primary-rgb), 0.08)',
                  border: `1px solid ${diff < 0 ? 'rgba(var(--danger-rgb), 0.25)' : 'rgba(var(--primary-rgb), 0.2)'}`,
                }}
              >
                <div>
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>
                    {t.custody.handedOver}
                  </div>
                  <div className="text-2xl font-semibold tabular-nums">
                    {fc(h.cashDeclaredFc)} FC
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>
                    {t.custody.difference}
                  </div>
                  <div
                    className="text-2xl font-semibold tabular-nums"
                    style={{ color: diff < 0 ? 'var(--danger)' : 'var(--primary)' }}
                  >
                    {diff === 0 ? '—' : `${diff > 0 ? '+' : ''}${fc(diff)}`}
                  </div>
                </div>
              </div>

              {h.soldLines && h.soldLines.length > 0 && (
                <Section title={t.custody.soldThisPeriod}>
                  {h.soldLines.map((l, i) => (
                    <Row
                      key={i}
                      left={`${l.productName}${l.variantLabel ? ` · ${l.variantLabel}` : ''}`}
                      mid={formatBreakdown(breakdownQuantity(l.qtySold, l.piecesPerCarton))}
                      right={`${fc(l.valueFc)} FC`}
                    />
                  ))}
                </Section>
              )}

              {h.miniRollupLines && h.miniRollupLines.length > 0 && (
                <Section title={t.custody.handedUpByMinis}>
                  {h.miniRollupLines.map((l) => (
                    <Row
                      key={l.settlementId}
                      left={l.miniName}
                      mid={`${l.returnedUnits} ${t.custody.unitsReturned}`}
                      right={`${fc(l.cashFc)} FC`}
                    />
                  ))}
                </Section>
              )}

              {h.items.length > 0 && (
                <Section title={t.custody.goodsHandedBack}>
                  {h.items.map((it) => (
                    <Row
                      key={it.id}
                      left={`${it.productName}${it.variantLabel ? ` · ${it.variantLabel}` : ''}`}
                      right={formatBreakdown(breakdownQuantity(it.quantity, it.piecesPerCarton))}
                    />
                  ))}
                </Section>
              )}

              {h.rejectedLines && h.rejectedLines.length > 0 && (
                <Section title={t.custody.salesVoided} muted>
                  {h.rejectedLines.map((l, i) => (
                    <Row
                      key={i}
                      left={`${l.productName}${l.reason ? ` — ${l.reason}` : ''}`}
                      right={`×${l.qtySold}`}
                      muted
                    />
                  ))}
                </Section>
              )}

              <Section title={t.custody.yourLines}>
                {h.adjustments.length === 0 && (
                  <p className="text-sm py-2" style={{ color: 'var(--muted)' }}>
                    {t.custody.nothingAdded}
                  </p>
                )}
                {h.adjustments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 text-sm py-1.5 border-t"
                    style={{ borderColor: 'rgba(127,127,127,0.12)' }}
                  >
                    <span>
                      <span className="font-medium">{KIND_LABEL[a.kind]}</span>
                      <span className="ml-2" style={{ color: 'var(--muted)' }}>
                        {a.note}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      {a.amountFc && (
                        <span className="tabular-nums font-medium">{fc(a.amountFc)} FC</span>
                      )}
                      {h.status === 'PENDING' && canWrite && (
                        <button
                          className="btn btn-ghost text-xs"
                          onClick={() => removeLine.mutate(a.id)}
                        >
                          Remove
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </Section>

              {h.status === 'PENDING' && canWrite && (
                <>
                  <div
                    className="rounded-xl p-4 mb-5"
                    style={{ background: 'var(--surface)', border: '1px solid rgba(127,127,127,0.12)' }}
                  >
                    <div className="text-sm font-medium mb-3">{t.custody.addLine}</div>
                    <div className="flex gap-2 flex-wrap items-end">
                      <select
                        className="input"
                        value={kind}
                        onChange={(e) => setKind(e.target.value as CustodyAdjustmentKind)}
                        style={{ maxWidth: 180 }}
                      >
                        {(Object.keys(KIND_LABEL) as CustodyAdjustmentKind[]).map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                      {isCashLine && (
                        <input
                          className="input"
                          style={{ maxWidth: 140 }}
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          inputMode="decimal"
                          placeholder={t.custody.amountFc}
                        />
                      )}
                      <input
                        className="input flex-1 min-w-[200px]"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={t.custody.whyRequired}
                      />
                      <button
                        className="btn btn-secondary"
                        disabled={!note.trim() || (isCashLine && !amount.trim()) || addLine.isPending}
                        onClick={() => addLine.mutate()}
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <div
                    className="rounded-xl p-4"
                    style={{ background: 'rgba(var(--warning-rgb), 0.08)', border: '1px solid rgba(var(--warning-rgb), 0.2)' }}
                  >
                    <p className="text-xs mb-3" style={{ color: 'var(--warning)' }}>
                      {t.custody.approveEndsCustody}
                    </p>
                    <div className="flex gap-2 flex-wrap items-end">
                      <input
                        className="input flex-1 min-w-[200px]"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder={t.custody.sendBackReason}
                      />
                      <button
                        className="btn btn-secondary"
                        disabled={reject.isPending}
                        onClick={() => reject.mutate()}
                      >
                        {t.custody.sendBack}
                      </button>
                      <button
                        className="btn btn-primary"
                        disabled={approve.isPending}
                        onClick={() => approve.mutate()}
                      >
                        {approve.isPending ? t.custody.settling : t.custody.settle}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {h.status !== 'PENDING' && (
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  {h.status === 'APPROVED'
                    ? `${t.custody.settledOn} ${h.approvedAt ? formatDate(h.approvedAt) : ''}`
                    : `${t.custody.sentBack}${h.rejectionReason ? ` — ${h.rejectionReason}` : ''}`}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  muted,
  children,
}: {
  title: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-4 mb-4"
      style={{ background: muted ? 'transparent' : 'var(--surface)' }}
    >
      <h3
        className="text-xs font-semibold uppercase tracking-wide mb-1"
        style={{ color: 'var(--muted)' }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

/** One itemized report row: a name, an optional middle detail (qty), and a value on the right. */
function Row({
  left,
  mid,
  right,
  muted,
}: {
  left: string;
  mid?: string;
  right: string;
  muted?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 text-sm py-1.5 border-t"
      style={{ borderColor: 'rgba(127,127,127,0.12)', color: muted ? 'var(--muted)' : undefined }}
    >
      <span className="min-w-0 truncate">{left}</span>
      <span className="flex items-center gap-3 shrink-0">
        {mid && (
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            {mid}
          </span>
        )}
        <span
          className="tabular-nums font-medium"
          style={{ color: muted ? 'var(--muted)' : undefined, minWidth: 70, textAlign: 'right' }}
        >
          {right}
        </span>
      </span>
    </div>
  );
}
