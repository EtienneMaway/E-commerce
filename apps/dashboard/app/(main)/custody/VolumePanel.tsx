'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  custodyApi,
  employmentsApi,
  type CustodyTeamMember,
  type Employment,
  type StockCustody,
  type StockIssue,
} from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { formatDate, getErrorMessage } from '../../../lib/utils';
import { useT } from '../../../lib/i18n';
import { useToast } from '../../../components/ui/Toast';

/** Someone is in charge: show who, what has been offered, and who may sell it. */
export default function VolumePanel({
  custody,
  canWrite,
  onEnd,
}: {
  custody: StockCustody;
  canWrite: boolean;
  onEnd: () => void;
}) {
  const qc = useQueryClient();
  const t = useT();
  const toast = useToast();
  const fail = (e: unknown): void =>
    toast({ variant: 'error', title: t.toasts.errorTitle, description: getErrorMessage(e) });
  const ISSUE_STATE: Record<StockIssue['status'], string> = {
    PENDING: t.custody.issuePending,
    ACCEPTED: t.custody.issueAccepted,
    REJECTED: t.custody.issueRejected,
    CANCELLED: t.custody.issueCancelled,
  };
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [newMember, setNewMember] = useState('');

  const { data: issues } = useQuery({
    queryKey: QK.custodyIssues(custody.id),
    queryFn: () => custodyApi.issues(custody.id),
    staleTime: 15_000,
  });
  const { data: team } = useQuery({
    queryKey: QK.custodyTeam(custody.id),
    queryFn: () => custodyApi.team(custody.id),
    staleTime: 15_000,
  });
  const { data: employments } = useQuery({
    queryKey: QK.employments({ role: 'employer', status: 'ACTIVE' }),
    queryFn: () => employmentsApi.list({ role: 'employer', status: 'ACTIVE' }),
    staleTime: 60_000,
  });

  const issue = useMutation({
    mutationFn: () =>
      custodyApi.createIssue(custody.id, {
        items: [{ productName: productName.trim().toLowerCase(), quantity: Number(quantity) }],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.custodyIssues(custody.id) });
      setProductName('');
      setQuantity('');
      toast({
        variant: 'success',
        title: t.custody.toastOfferedTitle,
        description: t.custody.toastOfferedBody,
      });
    },
    onError: fail,
  });
  const cancelIssue = useMutation({
    mutationFn: (id: string) => custodyApi.cancelIssue(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.custodyIssues(custody.id) });
      toast({ variant: 'success', title: t.custody.toastWithdrawnTitle });
    },
    onError: fail,
  });
  const addMember = useMutation({
    mutationFn: () => custodyApi.addTeamMember(custody.id, newMember),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.custodyTeam(custody.id) });
      setNewMember('');
      toast({ variant: 'success', title: t.custody.toastMemberAddedTitle });
    },
    onError: fail,
  });
  const removeMember = useMutation({
    mutationFn: (id: string) => custodyApi.removeTeamMember(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.custodyTeam(custody.id) });
      toast({ variant: 'success', title: t.custody.toastMemberRemovedTitle });
    },
    onError: fail,
  });

  const issueRows = (issues as StockIssue[] | undefined) ?? [];
  const teamRows = (team as CustodyTeamMember[] | undefined) ?? [];
  const onTeam = new Set(teamRows.map((m) => m.userId));
  const addable = ((employments as Employment[] | undefined) ?? []).filter(
    (e) => e.employeeId !== custody.custodianId && !onTeam.has(e.employeeId),
  );
  const hasPendingIssue = issueRows.some((i) => i.status === 'PENDING');
  const hasAcceptedIssue = issueRows.some((i) => i.status === 'ACCEPTED');

  return (
    <div className="grid gap-5">
      <div className="card p-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>
            {t.custody.inChargeOf}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-xl font-semibold">
              {custody.custodian?.name ?? custody.custodian?.username ?? '—'}
            </div>
            {/* Being appointed is instant; this reflects whether they have
                actually accepted anything yet, which is the fact that makes
                the responsibility real. */}
            {hasPendingIssue ? (
              <span
                className="px-2 py-0.5 rounded-md text-xs font-medium"
                style={{ background: 'rgba(var(--warning-rgb), 0.12)', color: 'var(--warning)' }}
              >
                {t.custody.acceptanceAwaiting}
              </span>
            ) : hasAcceptedIssue ? (
              <span
                className="px-2 py-0.5 rounded-md text-xs font-medium"
                style={{ background: 'rgba(var(--primary-rgb), 0.12)', color: 'var(--primary)' }}
              >
                {t.custody.acceptanceAccepted}
              </span>
            ) : null}
          </div>
          <div className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {t.custody.since} {formatDate(custody.openedAt)}
            {custody.note ? ` · ${custody.note}` : ''}
          </div>
        </div>
        <button className="btn btn-secondary" onClick={onEnd} disabled={!canWrite}>
          {t.custody.endCustody}
        </button>
      </div>

      <div className="card p-6">
        <h3 className="font-semibold mb-1">{t.custody.issueTitle}</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
          {t.custody.issueBody}
        </p>
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium mb-1 opacity-80">{t.custody.product}</label>
            <input
              className="input w-full"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Rice 50kg"
              disabled={!canWrite}
            />
          </div>
          <div className="w-32">
            <label className="block text-xs font-medium mb-1 opacity-80">{t.custody.quantity}</label>
            <input
              className="input w-full"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode="numeric"
              placeholder="20"
              disabled={!canWrite}
            />
          </div>
          <button
            className="btn btn-primary"
            disabled={!canWrite || !productName || !quantity || issue.isPending}
            onClick={() => issue.mutate()}
          >
            {t.custody.offerIt}
          </button>
        </div>

        {issueRows.length > 0 && (
          <div className="mt-5 grid gap-2">
            {issueRows.slice(0, 8).map((i) => (
              <div
                key={i.id}
                className="flex items-center justify-between gap-3 text-sm py-2 border-t"
                style={{ borderColor: 'rgba(127,127,127,0.15)' }}
              >
                <div>
                  <span className="font-medium">
                    {i.isOpeningSweep
                      ? t.custody.openingStock
                      : i.items.map((it) => `${it.productName} ×${it.quantity}`).join(', ')}
                  </span>
                  <span className="ml-2" style={{ color: 'var(--muted)' }}>
                    {formatDate(i.createdAt)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ color: 'var(--muted)' }}>{ISSUE_STATE[i.status]}</span>
                  {i.status === 'PENDING' && canWrite && (
                    <button
                      className="btn btn-ghost text-xs"
                      onClick={() => cancelIssue.mutate(i.id)}
                    >
                      {t.custody.withdraw}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-6">
        <h3 className="font-semibold mb-1">{t.custody.teamTitle}</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
          {t.custody.teamBody}
        </p>

        <div className="flex gap-2 flex-wrap items-end mb-4">
          <select
            className="input flex-1 min-w-[220px]"
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            disabled={!canWrite}
          >
            <option value="">{t.custody.addSomeone}</option>
            {addable.map((e) => (
              <option key={e.id} value={e.employeeId}>
                {e.employee?.name ?? e.employee?.username ?? e.employeeId}
                {e.tier === 'SALES_ONLY' ? ' (mini)' : ''}
              </option>
            ))}
          </select>
          <button
            className="btn btn-secondary"
            disabled={!canWrite || !newMember || addMember.isPending}
            onClick={() => addMember.mutate()}
          >
            {t.custody.add}
          </button>
        </div>

        {teamRows.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {t.custody.teamEmpty}
          </p>
        ) : (
          <div className="grid gap-2">
            {teamRows.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between text-sm py-2 border-t"
                style={{ borderColor: 'rgba(127,127,127,0.15)' }}
              >
                <span>{m.user?.name ?? m.user?.username ?? m.userId}</span>
                {canWrite && (
                  <button
                    className="btn btn-ghost text-xs"
                    onClick={() => removeMember.mutate(m.id)}
                  >
                    {t.custody.remove}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
