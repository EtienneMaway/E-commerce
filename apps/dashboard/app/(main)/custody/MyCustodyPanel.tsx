'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  custodyApi,
  type CustodyHandoverPreview,
  type CustodyOverview,
  type CustodyPendingSale,
  type StockIssue,
} from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { breakdownQuantity, formatBreakdown, formatDate, getErrorMessage } from '../../../lib/utils';
import { useConfirm } from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../components/ui/Toast';
import { useT } from '../../../lib/i18n';

type Tab = 'volume' | 'approve' | 'handover';

const fc = (v: string | number): string => Number(v).toLocaleString('fr-CD');

/**
 * The custodian's own screen — what they are holding, what they have been
 * offered, whose sales they still have to go through, and the handover that
 * closes the period. Mirrors `apps/mobile/app/custody.tsx`, which had this
 * before the dashboard did; someone who only uses the web app had no way to
 * accept a volume or settle a handover until this existed.
 *
 * Deliberately scoped to their own volume, not the branch's cash position or
 * the business's numbers — that stays on the owner's side of this same route.
 */
export default function MyCustodyPanel() {
  const t = useT();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('volume');

  const mine = useQuery({
    queryKey: QK.custodyMine,
    queryFn: () => custodyApi.mine(),
  });
  const issues = useQuery({
    queryKey: QK.custodyMyIssues,
    queryFn: () => custodyApi.myIssues(),
  });

  const overview = mine.data as CustodyOverview | null | undefined;
  const offered = ((issues.data as StockIssue[] | undefined) ?? []).filter(
    (i) => i.status === 'PENDING',
  );

  const refreshAll = (): void => {
    qc.invalidateQueries({ queryKey: ['custody'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.custodyMine.title}</h1>
          <p className="page-sub">{t.custodyMine.subtitle}</p>
        </div>
      </div>

      <div className="flex gap-1 mb-5">
        {(
          [
            ['volume', t.custodyMine.tabVolume],
            ['approve', t.custodyMine.tabApprove],
            ['handover', t.custodyMine.tabHandover],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="px-4 py-2 text-sm rounded-lg transition-colors"
            style={
              tab === key
                ? { background: 'rgba(var(--primary-rgb), 0.12)', color: 'var(--primary)' }
                : { color: 'var(--muted)' }
            }
          >
            {label}
            {key === 'approve' && overview?.pendingSaleCount ? ` (${overview.pendingSaleCount})` : ''}
          </button>
        ))}
      </div>

      {mine.isLoading ? (
        <div className="skeleton h-40 rounded-xl" />
      ) : !overview ? (
        <div className="card p-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
          <div className="font-medium mb-1" style={{ color: 'var(--foreground)' }}>
            {t.custodyMine.noneTitle}
          </div>
          {t.custodyMine.noneBody}
        </div>
      ) : tab === 'volume' ? (
        <VolumeTab overview={overview} offered={offered} onChanged={refreshAll} />
      ) : tab === 'approve' ? (
        <ApproveTab />
      ) : (
        <HandoverTab />
      )}
    </div>
  );
}

function VolumeTab({
  overview,
  offered,
  onChanged,
}: {
  overview: CustodyOverview;
  offered: StockIssue[];
  onChanged: () => void;
}) {
  const t = useT();
  const confirm = useConfirm();
  const toast = useToast();
  const fail = (e: unknown): void =>
    toast({ variant: 'error', title: t.toasts.errorTitle, description: getErrorMessage(e) });

  const accept = useMutation({
    mutationFn: (id: string) => custodyApi.acceptIssue(id),
    onSuccess: () => {
      onChanged();
      toast({
        variant: 'success',
        title: t.custodyMine.toastAcceptedTitle,
        description: t.custodyMine.toastAcceptedBody,
      });
    },
    onError: fail,
  });
  const refuse = useMutation({
    mutationFn: (id: string) => custodyApi.rejectIssue(id),
    onSuccess: () => {
      onChanged();
      toast({
        variant: 'success',
        title: t.custodyMine.toastRefusedTitle,
        description: t.custodyMine.refuseBody,
      });
    },
    onError: fail,
  });

  const onRefuse = async (id: string): Promise<void> => {
    const ok = await confirm({
      title: t.custodyMine.refuseTitle,
      description: t.custodyMine.refuseBody,
      confirmLabel: t.custodyMine.refuse,
      variant: 'danger',
    });
    if (ok) refuse.mutate(id);
  };

  return (
    <div className="grid gap-5">
      <div className="card p-6">
        <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>
          {t.custodyMine.inYourHandsSince} {formatDate(overview.custody.openedAt)}
        </div>
        <div className="text-2xl font-semibold">
          {overview.totalUnits} {overview.totalUnits === 1 ? t.custodyMine.units : t.custodyMine.unitsPlural}
        </div>
        <div className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          {overview.lines.length}{' '}
          {overview.lines.length === 1 ? t.custodyMine.products : t.custodyMine.productsPlural} ·{' '}
          {overview.teamSize}{' '}
          {overview.teamSize === 1 ? t.custodyMine.teammate : t.custodyMine.teammatesPlural}
        </div>
      </div>

      {offered.length > 0 && (
        <div className="card p-6">
          <h3 className="font-semibold mb-4">{t.custodyMine.offeredToYou}</h3>
          <div className="grid gap-3">
            {offered.map((i) => (
              <div
                key={i.id}
                className="rounded-xl border p-4"
                style={{ borderColor: 'rgba(127,127,127,0.2)' }}
              >
                <div className="font-medium">
                  {i.isOpeningSweep
                    ? t.custodyMine.wholeShelf
                    : i.items.map((it) => `${it.productName} ×${it.quantity}`).join(', ')}
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                  {formatDate(i.createdAt)}
                  {i.note ? ` · ${i.note}` : ''}
                </div>
                <div className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                  {t.custodyMine.takeItWarning}
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    className="btn btn-primary"
                    disabled={accept.isPending}
                    onClick={() => accept.mutate(i.id)}
                  >
                    {t.custodyMine.takeIt}
                  </button>
                  <button
                    className="btn btn-secondary"
                    disabled={refuse.isPending}
                    onClick={() => onRefuse(i.id)}
                  >
                    {t.custodyMine.refuse}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-6">
        <h3 className="font-semibold mb-3">{t.custodyMine.whatYouHold}</h3>
        {overview.lines.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {t.custodyMine.nothingYet}
          </p>
        ) : (
          <div className="grid gap-2">
            {overview.lines.map((l) => (
              <div
                key={`${l.productName}:${l.variantId ?? ''}`}
                className="flex items-center justify-between text-sm py-2 border-t"
                style={{ borderColor: 'rgba(127,127,127,0.15)' }}
              >
                <span>
                  {l.productName}
                  {l.variantLabel ? ` · ${l.variantLabel}` : ''}
                </span>
                <span style={{ color: 'var(--muted)' }}>
                  {formatBreakdown(breakdownQuantity(l.quantityRemaining, l.piecesPerCarton))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The batch the custodian signs off. `expectedCount` goes with the request, so
 * a queue that grew since this list rendered is refused rather than waved
 * through — the only thing that makes "approve all" mean anything.
 */
function ApproveTab() {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [reviewed, setReviewed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: QK.custodyMyPendingSales,
    queryFn: () => custodyApi.pendingSales(),
  });
  const sales = (data as CustodyPendingSale[] | undefined) ?? [];

  const approve = useMutation({
    mutationFn: () =>
      custodyApi.approveSales({
        saleIds: sales.map((s) => s.id),
        expectedCount: sales.length,
        reviewed: true,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['custody'] });
      setReviewed(false);
      toast({
        variant: 'success',
        title: t.custodyMine.approvedTitle,
        description: `${r.approved} ${t.custodyMine.approvedBody}`,
      });
    },
    onError: (e) =>
      toast({ variant: 'error', title: t.toasts.errorTitle, description: getErrorMessage(e) }),
  });

  if (isLoading) return <div className="skeleton h-40 rounded-xl" />;

  if (sales.length === 0) {
    return (
      <div className="card p-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
        <div className="font-medium mb-1" style={{ color: 'var(--foreground)' }}>
          {t.custodyMine.nothingToApprove}
        </div>
        {t.custodyMine.nothingToApproveBody}
      </div>
    );
  }

  const total = sales.reduce((sum, s) => sum + Number(s.salePrice) * s.qtySold, 0);

  return (
    <div className="card p-6">
      <div className="grid gap-2 mb-4">
        {sales.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between text-sm py-2 border-t"
            style={{ borderColor: 'rgba(127,127,127,0.15)' }}
          >
            <div>
              <div>
                {s.productName}
                {s.variantLabel ? ` · ${s.variantLabel}` : ''} ×{s.qtySold}
              </div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                {s.actor?.name ?? s.actor?.username ?? t.custodyMine.teammateLabel} ·{' '}
                {formatDate(s.date)}
              </div>
            </div>
            <span className="tabular-nums">{Number(s.salePrice).toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div
        className="rounded-xl p-4"
        style={{ background: 'rgba(var(--warning-rgb), 0.1)', color: 'var(--warning)' }}
      >
        <div className="text-sm">
          {sales.length} · {total.toFixed(2)} · {t.custodyMine.approveWarning}
        </div>
        <label className="flex items-center gap-2 mt-3 cursor-pointer text-sm">
          <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
          {t.custodyMine.approveCheckbox}
        </label>
      </div>

      <button
        className="btn btn-primary mt-4"
        disabled={!reviewed || approve.isPending}
        onClick={() => approve.mutate()}
      >
        {approve.isPending ? t.custodyMine.approving : `${t.custodyMine.approve} ${sales.length}`}
      </button>
    </div>
  );
}

/** What I owe if I close now, and the form that closes it. */
function HandoverTab() {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [cash, setCash] = useState('');
  const [note, setNote] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: QK.custodyMyHandoverPreview,
    queryFn: () => custodyApi.handoverPreview(),
  });
  const p = data as CustodyHandoverPreview | null | undefined;

  const submit = useMutation({
    mutationFn: () =>
      custodyApi.submitHandover({
        cashDeclaredFc: Number(cash || 0).toFixed(4),
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custody'] });
      setCash('');
      setNote('');
      toast({
        variant: 'success',
        title: t.custodyMine.handedOverTitle,
        description: t.custodyMine.handedOverBody,
      });
    },
    onError: (e) =>
      toast({ variant: 'error', title: t.toasts.errorTitle, description: getErrorMessage(e) }),
  });

  if (isLoading) return <div className="skeleton h-40 rounded-xl" />;

  if (!p) {
    return (
      <div className="card p-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
        {t.custodyMine.nothingToHandOver}
      </div>
    );
  }

  const blocked = p.unattestedSaleCount > 0;

  return (
    <div className="grid gap-5 max-w-2xl">
      <div className="card p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">{t.custodyMine.handoverSummary}</h3>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            {t.custodyMine.since} {formatDate(p.periodStart)}
          </span>
        </div>
        <Row label={t.custodyMine.youSold} value={`${fc(p.salesFc)} FC`} />
        {Number(p.miniRollupCashFc) > 0 && (
          <Row label={t.custodyMine.fromYourMinis} value={`${fc(p.miniRollupCashFc)} FC`} />
        )}
        {Number(p.expensesFc) > 0 && (
          <Row label={t.custodyMine.youSpent} value={`−${fc(p.expensesFc)} FC`} />
        )}
        <div className="h-px my-3" style={{ background: 'rgba(127,127,127,0.15)' }} />
        <Row label={t.custodyMine.youOwe} value={`${fc(p.cashExpectedFc)} FC`} strong />
      </div>

      {p.pendingMiniHandovers.length > 0 && (
        <div
          className="rounded-xl p-4 text-sm"
          style={{ background: 'rgba(var(--primary-rgb), 0.08)' }}
        >
          {t.custodyMine.stillOutTitle} {p.pendingMiniHandovers.map((m) => m.miniName).join(', ')}.{' '}
          {t.custodyMine.stillOutBody}
        </div>
      )}

      {blocked && (
        <div
          className="rounded-xl p-4 text-sm"
          style={{ background: 'rgba(var(--warning-rgb), 0.1)', color: 'var(--warning)' }}
        >
          {p.unattestedSaleCount} {t.custodyMine.blockedByApproval}
        </div>
      )}

      {p.soldLines.length > 0 && (
        <div className="card p-6">
          <h3 className="font-semibold mb-1">{t.custodyMine.soldSectionTitle}</h3>
          <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
            {t.custodyMine.soldSectionHint}
          </p>
          <div className="grid gap-0.5">
            {p.soldLines.map((l, i) => (
              <LineRow
                key={i}
                left={`${l.productName}${l.variantLabel ? ` · ${l.variantLabel}` : ''}`}
                mid={formatBreakdown(breakdownQuantity(l.qtySold, l.piecesPerCarton))}
                right={`${fc(l.valueFc)} FC`}
              />
            ))}
          </div>
        </div>
      )}

      {p.miniRollupLines.length > 0 && (
        <div className="card p-6">
          <h3 className="font-semibold mb-3">{t.custodyMine.miniRollupTitle}</h3>
          <div className="grid gap-0.5">
            {p.miniRollupLines.map((l) => (
              <LineRow
                key={l.miniId}
                left={l.miniName}
                mid={`${l.returnedUnits} ${t.custodyMine.unitsReturned}`}
                right={`${fc(l.cashFc)} FC`}
              />
            ))}
          </div>
        </div>
      )}

      {p.rejectedLines.length > 0 && (
        <div className="card p-6">
          <h3 className="font-semibold mb-3">{t.custodyMine.voidedSectionTitle}</h3>
          <div className="grid gap-0.5">
            {p.rejectedLines.map((l, i) => (
              <LineRow key={i} left={l.productName} right={`×${l.qtySold}`} muted />
            ))}
          </div>
        </div>
      )}

      <div className="card p-6">
        <h3 className="font-semibold mb-1">{t.custodyMine.returnsTitle}</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
          {t.custodyMine.returnsHint}
        </p>
        {p.holding.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {t.custodyMine.nothingYet}
          </p>
        ) : (
          <div className="grid gap-0.5">
            {p.holding.map((l) => (
              <LineRow
                key={l.inventoryEntryId}
                left={`${l.productName}${l.variantLabel ? ` · ${l.variantLabel}` : ''}`}
                right={formatBreakdown(breakdownQuantity(l.quantityRemaining, l.piecesPerCarton))}
              />
            ))}
          </div>
        )}
      </div>

      <div className="card p-6">
        <label className="block mb-4">
          <span className="block text-xs font-medium mb-1 opacity-80">{t.custodyMine.cashLabel}</span>
          <input
            className="input w-full"
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            inputMode="decimal"
            placeholder={fc(p.cashExpectedFc)}
          />
        </label>

        <label className="block mb-4">
          <input
            className="input w-full"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.custodyMine.notePlaceholder}
          />
        </label>

        <div
          className="rounded-xl p-4 mb-4 text-sm"
          style={{ background: 'rgba(var(--warning-rgb), 0.1)', color: 'var(--warning)' }}
        >
          {t.custodyMine.fullReturnWarning}
        </div>

        <button
          className="btn btn-primary w-full"
          disabled={blocked || submit.isPending}
          onClick={() => submit.mutate()}
        >
          {submit.isPending ? t.custodyMine.handingOver : t.custodyMine.handOver}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between mt-2 text-sm">
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span className={strong ? 'font-semibold' : ''}>{value}</span>
    </div>
  );
}

/** One itemized report row: a name, an optional middle detail (qty), and a value on the right. */
function LineRow({
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
      <span className="flex-1 min-w-0 truncate">{left}</span>
      <span className="flex items-center gap-3 shrink-0">
        {mid && <span style={{ color: 'var(--muted)' }}>{mid}</span>}
        <span className="tabular-nums font-medium" style={{ minWidth: 70, textAlign: 'right' }}>
          {right}
        </span>
      </span>
    </div>
  );
}
