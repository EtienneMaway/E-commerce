'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { branchTransfersApi, type BranchTransfer } from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { formatDate, getErrorMessage } from '../../../lib/utils';
import { useFormatCurrency } from '../../../lib/currency';
import { useConfirm } from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../components/ui/Toast';
import { useT } from '../../../lib/i18n';
import { TransferStatusPill } from './StatusPills';

interface Props {
  transfer: BranchTransfer;
  /** The branch the viewer is acting for; null under "All branches" (read-only). */
  currentShopId: string | null;
  canWrite: boolean;
  onClose: () => void;
}

const personName = (p: BranchTransfer['sentBy']): string => p?.name ?? p?.username ?? '—';

export default function TransferDetail({ transfer, currentShopId, canWrite, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const fmt = useFormatCurrency();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const inTransit = transfer.status === 'IN_TRANSIT';
  const isReceiver = canWrite && inTransit && currentShopId === transfer.toShopId;
  const isSender = canWrite && inTransit && currentShopId === transfer.fromShopId;

  const done = (): void => {
    qc.invalidateQueries({ queryKey: QK.branchTransfersAll });
    qc.invalidateQueries({ queryKey: QK.inventoryProducts });
    qc.invalidateQueries({ queryKey: QK.custodyMine });
    qc.invalidateQueries({ queryKey: QK.alerts });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    onClose();
  };
  const fail = (e: unknown): void => {
    const message = getErrorMessage(e);
    setError(message);
    toast({ variant: 'error', title: t.toasts.errorTitle, description: message });
  };

  const receive = useMutation({
    mutationFn: () => branchTransfersApi.receive(transfer.id),
    onSuccess: () => {
      toast({
        variant: 'success',
        title: t.branchTransfers.toastReceivedTitle,
        description: t.branchTransfers.toastReceivedBody(transfer.fromShop.name),
      });
      done();
    },
    onError: fail,
  });
  const reject = useMutation({
    mutationFn: () => branchTransfersApi.reject(transfer.id, reason.trim()),
    onSuccess: () => {
      toast({ variant: 'success', title: t.branchTransfers.toastRejectedTitle });
      done();
    },
    onError: fail,
  });
  const cancel = useMutation({
    mutationFn: () => branchTransfersApi.cancel(transfer.id),
    onSuccess: () => {
      toast({ variant: 'success', title: t.branchTransfers.toastCancelledTitle });
      done();
    },
    onError: fail,
  });
  const busy = receive.isPending || reject.isPending || cancel.isPending;

  const onReceive = async (): Promise<void> => {
    const ok = await confirm({
      title: t.branchTransfers.receiveConfirmTitle,
      description: t.branchTransfers.receiveConfirmBody(fmt(transfer.totalValue), transfer.fromShop.name),
      confirmLabel: t.branchTransfers.receiveAll,
    });
    if (ok) receive.mutate();
  };
  const onCancel = async (): Promise<void> => {
    const ok = await confirm({
      title: t.branchTransfers.cancelConfirmTitle,
      description: t.branchTransfers.cancelConfirmBody,
      confirmLabel: t.branchTransfers.cancelTransfer,
      variant: 'danger',
    });
    if (ok) cancel.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl p-6 shadow-xl overflow-y-auto border"
        style={{ background: 'var(--card)', borderColor: 'rgba(127,127,127,0.2)', maxHeight: '90vh' }}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold truncate" style={{ color: 'var(--foreground)' }}>
              {t.branchTransfers.detailTitle(transfer.fromShop.name, transfer.toShop.name)}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              {t.branchTransfers.sentBy(personName(transfer.sentBy), formatDate(transfer.sentAt))}
            </p>
            {transfer.answeredAt && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {t.branchTransfers.answeredBy(personName(transfer.answeredBy), formatDate(transfer.answeredAt))}
              </p>
            )}
          </div>
          <TransferStatusPill status={transfer.status} />
        </div>

        {transfer.note && (
          <p className="text-sm mb-4 px-3 py-2 rounded-lg" style={{ background: 'var(--surface)', color: 'var(--foreground)' }}>
            {transfer.note}
          </p>
        )}
        {transfer.rejectionReason && (
          <p className="text-sm mb-4 px-3 py-2 rounded-lg" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
            {t.branchTransfers.rejectionReason}: {transfer.rejectionReason}
          </p>
        )}

        <div className="card overflow-x-auto mb-4">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>{t.branchTransfers.product}</th>
                <th className="text-right">{t.branchTransfers.quantity}</th>
                <th className="text-right">{t.branchTransfers.colUnitCost}</th>
                <th className="text-right">{t.branchTransfers.colLineValue}</th>
              </tr>
            </thead>
            <tbody>
              {transfer.items.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.productName}
                    {i.variantLabel && <span style={{ color: 'var(--muted)' }}> — {i.variantLabel}</span>}
                  </td>
                  <td className="text-right tabular-nums">{i.quantity}</td>
                  <td className="text-right tabular-nums">{fmt(i.unitCost)}</td>
                  <td className="text-right tabular-nums">{fmt(String(Number(i.unitCost) * i.quantity))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm mb-5">
          <span style={{ color: 'var(--muted)' }}>{t.branchTransfers.totalOwed}</span>
          <span className="font-bold tabular-nums" style={{ color: 'var(--foreground)' }}>
            {fmt(transfer.totalValue)}
          </span>
        </div>

        {rejecting && (
          <div className="space-y-2 mb-4">
            <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
              {t.branchTransfers.rejectTitle}
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {t.branchTransfers.rejectSub}
            </p>
            <input
              className="input"
              autoFocus
              maxLength={255}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t.branchTransfers.rejectReasonPlaceholder}
            />
          </div>
        )}

        {error && (
          <p className="text-xs rounded-lg px-3 py-2 mb-3" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
            {error}
          </p>
        )}

        <div className="flex gap-2 flex-wrap">
          <button onClick={onClose} className="btn btn-secondary" disabled={busy}>
            {t.common.close}
          </button>
          <div className="flex-1" />
          {isReceiver && !rejecting && (
            <>
              <button className="btn btn-danger" disabled={busy} onClick={() => setRejecting(true)}>
                {t.branchTransfers.reject}
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={onReceive}>
                {t.branchTransfers.receiveAll}
              </button>
            </>
          )}
          {isReceiver && rejecting && (
            <>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setRejecting(false)}>
                {t.common.cancel}
              </button>
              <button
                className="btn btn-danger"
                disabled={busy || reason.trim().length === 0}
                onClick={() => reject.mutate()}
              >
                {t.branchTransfers.rejectSubmit}
              </button>
            </>
          )}
          {isSender && (
            <button className="btn btn-danger" disabled={busy} onClick={onCancel}>
              {t.branchTransfers.cancelTransfer}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
