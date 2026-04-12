'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { consignmentsApi } from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { formatDate, getErrorMessage } from '../../../lib/utils';
import { useFormatCurrency } from '../../../lib/currency';
import { Badge } from '../../../components/ui/Badge';
import { SendConsignmentDialog } from '../../../components/forms/SendConsignmentDialog';
import { useT } from '@/lib/i18n';
import { consignmentHtml } from '../../../lib/print-templates';
import { PrintDialog } from '../../../components/ui/PrintDialog';

type ConsignmentStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
type Variant = 'pending' | 'accepted' | 'rejected' | 'cancelled';

interface ConsignmentItem {
  id: string;
  productName: string;
  quantity: number;
  agreedUnitPrice: string;
}

interface ConsignmentRequest {
  id: string;
  status: ConsignmentStatus;
  note: string | null;
  createdAt: string;
  supplierId: string;
  supplier?: { id: string; username: string };
  debtorId: string;
  debtor?: { id: string; username: string };
  items: ConsignmentItem[];
}

const STATUS_VARIANT: Record<ConsignmentStatus, Variant> = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

function totalValue(items: ConsignmentItem[]): string {
  const sum = items.reduce((acc, it) => acc + parseFloat(it.agreedUnitPrice) * it.quantity, 0);
  return sum.toFixed(2);
}

type Tab = 'outgoing' | 'incoming';

export default function ConsignmentsPage() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('outgoing');
  const [sendOpen, setSendOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const TABS: { value: Tab; label: string }[] = [
    { value: 'outgoing', label: t.consignments.tabOutgoing },
    { value: 'incoming', label: t.consignments.tabIncoming },
  ];

  return (
    <div>
      <SendConsignmentDialog open={sendOpen} onClose={() => setSendOpen(false)} />

      <div className="page-header">
        <div className="flex-1 min-w-0">
          <h1 className="page-title">{t.consignments.title}</h1>
          <p className="page-sub">{t.consignments.sub}</p>
          <div className="flex gap-1.5 mt-3">
            {TABS.map((tb) => (
              <button key={tb.value} onClick={() => setTab(tb.value)} className={`pill${tab === tb.value ? ' active' : ''}`}>
                {tb.label}
              </button>
            ))}
          </div>
        </div>
        {tab === 'outgoing' && (
          <button onClick={() => setSendOpen(true)} className="btn btn-primary flex-shrink-0">
            {t.consignments.sendConsignment}
          </button>
        )}
      </div>

      <div className="page-content">
        {tab === 'outgoing' ? (
          <OutgoingTab expandedId={expandedId} setExpandedId={setExpandedId} />
        ) : (
          <IncomingTab expandedId={expandedId} setExpandedId={setExpandedId} />
        )}
      </div>
    </div>
  );
}

function OutgoingTab({ expandedId, setExpandedId }: { expandedId: string | null; setExpandedId: (id: string | null) => void }) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const qc = useQueryClient();
  const [printRow, setPrintRow] = useState<ConsignmentRequest | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: QK.consignmentsOutgoing,
    queryFn: () => consignmentsApi.outgoing(),
    staleTime: 30_000,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => consignmentsApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.consignmentsOutgoing }),
  });

  const rows = (data as ConsignmentRequest[] | undefined) ?? [];

  if (isLoading) return <div className="loading-state"><div className="spinner" /><span>{t.consignments.loading}</span></div>;
  if (rows.length === 0) return <EmptyState message={t.consignments.noOutgoing} />;

  return (
    <>
    <PrintDialog
      open={!!printRow}
      onClose={() => setPrintRow(null)}
      buildHtml={(fmt) => consignmentHtml({
        supplierUsername: printRow?.supplier?.username ?? printRow?.supplierId ?? '',
        debtorUsername: printRow?.debtor?.username ?? printRow?.debtorId ?? '',
        status: printRow?.status ?? '',
        note: printRow?.note ?? null,
        createdAt: printRow?.createdAt ?? '',
        items: printRow?.items ?? [],
        formatCurrency: fmt,
        t: { title: t.print.consignmentNote, from: t.print.from, to: t.print.to, date: t.print.date, status: t.print.status, product: t.print.product, qty: t.print.qty, unitPrice: t.print.unitPrice, total: t.print.total, note: t.print.note, grandTotal: t.print.grandTotal, cartonPrice: t.print.cartonPrice },
      })}
    />
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <div style={{ overflowX: 'auto' }}>
      <table className="w-full text-sm" style={{ minWidth: '600px' }}>
        <thead>
          <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)' }}>
            {[t.consignments.colDebtor, t.consignments.colItems, t.consignments.colTotalValue, t.consignments.colStatus, t.consignments.colDate, ''].map((h) => (
              <th key={h} className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <React.Fragment key={row.id}>
              <tr
                style={{ background: i % 2 === 0 ? 'var(--card)' : '#FAFAFA', borderBottom: '1px solid var(--border)' }}
              >
                <td className="px-4 py-3" style={{ color: 'var(--foreground)' }}>
                  @{row.debtor?.username ?? row.debtorId}
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--foreground)' }}>
                  <button
                    className="text-xs underline"
                    style={{ color: 'var(--primary)' }}
                    onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                  >
                    {t.consignments.items(row.items.length)}
                  </button>
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--foreground)' }}>{formatCurrency(totalValue(row.items))}</td>
                <td className="px-4 py-3">
                  <Badge label={row.status} variant={STATUS_VARIANT[row.status]} />
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>{formatDate(row.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setPrintRow(row)}
                      className="btn btn-secondary"
                      style={{ fontSize: '12px', padding: '5px 12px' }}
                      title={t.print.printBtn}
                    >
                      🖨️
                    </button>
                    {row.status === 'PENDING' && (
                      <button
                        onClick={() => cancelMutation.mutate(row.id)}
                        disabled={cancelMutation.isPending}
                        className="btn btn-danger"
                        style={{ fontSize: '12px', padding: '5px 12px' }}
                      >
                        {t.consignments.cancel}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              {expandedId === row.id && (
                <tr style={{ background: '#F1F5F9' }}>
                  <td colSpan={6} className="px-6 py-3">
                    <ItemsDetail items={row.items} note={row.note} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      </div>
    </div>
    </>
  );
}

function IncomingTab({ expandedId, setExpandedId }: { expandedId: string | null; setExpandedId: (id: string | null) => void }) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const qc = useQueryClient();
  const [actionError, setActionError] = useState<Record<string, string>>({});
  const [printRow, setPrintRow] = useState<ConsignmentRequest | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: QK.consignmentsIncoming,
    queryFn: () => consignmentsApi.incoming(),
    staleTime: 30_000,
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) => consignmentsApi.confirm(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.consignmentsIncoming }),
    onError: (err, id) => setActionError((prev) => ({ ...prev, [id]: getErrorMessage(err) })),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => consignmentsApi.reject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.consignmentsIncoming }),
    onError: (err, id) => setActionError((prev) => ({ ...prev, [id]: getErrorMessage(err) })),
  });

  const rows = (data as ConsignmentRequest[] | undefined) ?? [];

  if (isLoading) return <div className="loading-state"><div className="spinner" /><span>{t.consignments.loading}</span></div>;
  if (rows.length === 0) return <EmptyState message={t.consignments.noIncoming} />;

  return (
    <>
    <PrintDialog
      open={!!printRow}
      onClose={() => setPrintRow(null)}
      buildHtml={(fmt) => consignmentHtml({
        supplierUsername: printRow?.supplier?.username ?? printRow?.supplierId ?? '',
        debtorUsername: printRow?.debtor?.username ?? printRow?.debtorId ?? '',
        status: printRow?.status ?? '',
        note: printRow?.note ?? null,
        createdAt: printRow?.createdAt ?? '',
        items: printRow?.items ?? [],
        formatCurrency: fmt,
        t: { title: t.print.consignmentNote, from: t.print.from, to: t.print.to, date: t.print.date, status: t.print.status, product: t.print.product, qty: t.print.qty, unitPrice: t.print.unitPrice, total: t.print.total, note: t.print.note, grandTotal: t.print.grandTotal, cartonPrice: t.print.cartonPrice },
      })}
    />
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <div style={{ overflowX: 'auto' }}>
      <table className="w-full text-sm" style={{ minWidth: '680px' }}>
        <thead>
          <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)' }}>
            {[t.consignments.colSupplier, t.consignments.colItems, t.consignments.colTotalValue, t.consignments.colStatus, t.consignments.colDate, t.consignments.colNote, ''].map((h) => (
              <th key={h} className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <React.Fragment key={row.id}>
              <tr
                style={{ background: i % 2 === 0 ? 'var(--card)' : '#FAFAFA', borderBottom: '1px solid var(--border)' }}
              >
                <td className="px-4 py-3" style={{ color: 'var(--foreground)' }}>
                  @{row.supplier?.username ?? row.supplierId}
                </td>
                <td className="px-4 py-3">
                  <button
                    className="text-xs underline"
                    style={{ color: 'var(--primary)' }}
                    onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                  >
                    {t.consignments.items(row.items.length)}
                  </button>
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--foreground)' }}>{formatCurrency(totalValue(row.items))}</td>
                <td className="px-4 py-3">
                  <Badge label={row.status} variant={STATUS_VARIANT[row.status]} />
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>{formatDate(row.createdAt)}</td>
                <td className="px-4 py-3 max-w-xs truncate" style={{ color: 'var(--muted)' }}>{row.note ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      onClick={() => setPrintRow(row)}
                      className="btn btn-secondary"
                      style={{ fontSize: '12px', padding: '5px 12px' }}
                      title={t.print.printBtn}
                    >
                      🖨️
                    </button>
                    {row.status === 'PENDING' && (
                      <>
                        <button
                          onClick={() => confirmMutation.mutate(row.id)}
                          disabled={confirmMutation.isPending || rejectMutation.isPending}
                          className="btn btn-success"
                          style={{ fontSize: '12px', padding: '5px 12px' }}
                        >
                          {t.consignments.confirm}
                        </button>
                        <button
                          onClick={() => rejectMutation.mutate(row.id)}
                          disabled={confirmMutation.isPending || rejectMutation.isPending}
                          className="btn btn-danger"
                          style={{ fontSize: '12px', padding: '5px 12px' }}
                        >
                          {t.consignments.reject}
                        </button>
                      </>
                    )}
                  </div>
                  {actionError[row.id] && (
                    <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>{actionError[row.id]}</p>
                  )}
                </td>
              </tr>
              {expandedId === row.id && (
                <tr style={{ background: '#F1F5F9' }}>
                  <td colSpan={7} className="px-6 py-3">
                    <ItemsDetail items={row.items} note={row.note} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      </div>
    </div>
    </>
  );
}

function ItemsDetail({ items, note }: { items: ConsignmentItem[]; note: string | null }) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  return (
    <div>
      {note && <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>{t.consignments.noteLabel}: {note}</p>}
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left font-semibold pb-1" style={{ color: 'var(--muted)' }}>{t.consignments.colProduct}</th>
            <th className="text-left font-semibold pb-1" style={{ color: 'var(--muted)' }}>{t.consignments.colQty}</th>
            <th className="text-left font-semibold pb-1" style={{ color: 'var(--muted)' }}>{t.consignments.colUnitPrice}</th>
            <th className="text-left font-semibold pb-1" style={{ color: 'var(--muted)' }}>{t.consignments.colSubtotal}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td className="py-0.5 pr-4" style={{ color: 'var(--foreground)' }}>{it.productName}</td>
              <td className="py-0.5 pr-4" style={{ color: 'var(--foreground)' }}>{it.quantity}</td>
              <td className="py-0.5 pr-4" style={{ color: 'var(--foreground)' }}>{formatCurrency(it.agreedUnitPrice)}</td>
              <td className="py-0.5" style={{ color: 'var(--foreground)' }}>
                {formatCurrency((parseFloat(it.agreedUnitPrice) * it.quantity).toFixed(2))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16" style={{ color: 'var(--muted)' }}>
      <div className="text-4xl mb-3">📋</div>
      <p className="text-sm">{message}</p>
    </div>
  );
}
