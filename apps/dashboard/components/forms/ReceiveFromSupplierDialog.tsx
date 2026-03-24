'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { consignmentsApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { formatDate, getErrorMessage } from '../../lib/utils';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';

interface ConsignmentItem {
  id: string;
  productName: string;
  quantity: number;
  agreedUnitPrice: string;
}

interface PendingConsignment {
  id: string;
  note: string | null;
  createdAt: string;
  status: string;
  supplierId: string;
  supplier?: { id: string; username: string };
  items: ConsignmentItem[];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

function totalValue(items: ConsignmentItem[]): string {
  return items.reduce((acc, it) => acc + parseFloat(it.agreedUnitPrice) * it.quantity, 0).toFixed(2);
}

export function ReceiveFromSupplierDialog({ open, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: QK.consignmentsIncoming,
    queryFn: () => consignmentsApi.incoming(),
    enabled: open,
    staleTime: 0,
  });

  const pending = ((data as PendingConsignment[] | undefined) ?? []).filter(
    (c) => c.status === 'PENDING',
  );

  const confirmMutation = useMutation({
    mutationFn: (id: string) => consignmentsApi.confirm(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: QK.consignmentsIncoming });
    },
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-xl flex flex-col"
        style={{ background: 'var(--card)', maxHeight: '80vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>{t.receiveFromSupplier.title}</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              {t.receiveFromSupplier.sub}
            </p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--muted)' }}>✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {isLoading ? (
            <div className="text-center py-10 text-sm" style={{ color: 'var(--muted)' }}>{t.common.loading}</div>
          ) : pending.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>{t.receiveFromSupplier.noPending}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pending.map((c) => (
                <ConsignmentCard
                  key={c.id}
                  consignment={c}
                  onConfirm={() => confirmMutation.mutate(c.id)}
                  isPending={confirmMutation.isPending && confirmMutation.variables === c.id}
                  error={confirmMutation.isError && confirmMutation.variables === c.id
                    ? getErrorMessage(confirmMutation.error)
                    : ''}
                  fromLabel={t.receiveFromSupplier.from}
                  confirmLabel={t.receiveFromSupplier.confirmReception}
                  confirmingLabel={t.receiveFromSupplier.confirming}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="btn btn-secondary w-full">{t.common.close}</button>
        </div>
      </div>
    </div>
  );
}

function ConsignmentCard({
  consignment,
  onConfirm,
  isPending,
  error,
  fromLabel,
  confirmLabel,
  confirmingLabel,
}: {
  consignment: PendingConsignment;
  onConfirm: () => void;
  isPending: boolean;
  error: string;
  fromLabel: string;
  confirmLabel: (n: number) => string;
  confirmingLabel: string;
}) {
  const formatCurrency = useFormatCurrency();
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
      {/* Supplier + date */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
            {fromLabel} @{consignment.supplier?.username ?? consignment.supplierId}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{formatDate(consignment.createdAt)}</p>
          {consignment.note && (
            <p className="text-xs mt-1 italic" style={{ color: 'var(--muted)' }}>"{consignment.note}"</p>
          )}
        </div>
        <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
          {formatCurrency(totalValue(consignment.items))}
        </span>
      </div>

      {/* Items list */}
      <table className="w-full text-xs mb-3">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th className="text-left pb-1 font-medium" style={{ color: 'var(--muted)' }}>Product</th>
            <th className="text-right pb-1 font-medium" style={{ color: 'var(--muted)' }}>Qty</th>
            <th className="text-right pb-1 font-medium" style={{ color: 'var(--muted)' }}>Unit Price</th>
            <th className="text-right pb-1 font-medium" style={{ color: 'var(--muted)' }}>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {consignment.items.map((it) => (
            <tr key={it.id}>
              <td className="py-1 pr-2" style={{ color: 'var(--foreground)' }}>{it.productName}</td>
              <td className="py-1 text-right pr-2" style={{ color: 'var(--foreground)' }}>{it.quantity}</td>
              <td className="py-1 text-right pr-2" style={{ color: 'var(--foreground)' }}>{formatCurrency(it.agreedUnitPrice)}</td>
              <td className="py-1 text-right" style={{ color: 'var(--foreground)' }}>
                {formatCurrency((parseFloat(it.agreedUnitPrice) * it.quantity).toFixed(2))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {error && <p className="text-xs mb-2" style={{ color: 'var(--danger)' }}>{error}</p>}

      {/* Confirm button */}
      <button
        onClick={onConfirm}
        disabled={isPending}
        className="btn btn-success w-full"
      >
        {isPending ? confirmingLabel : confirmLabel(consignment.items.length)}
      </button>
    </div>
  );
}
