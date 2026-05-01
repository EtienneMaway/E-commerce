'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardApi, paymentsApi } from '../../../../lib/api';
import { QK } from '../../../../lib/query-keys';
import { formatDate } from '../../../../lib/utils';
import { useFormatCurrency } from '../../../../lib/currency';
import { KpiCard } from '../../../../components/ui/KpiCard';
import { Badge } from '../../../../components/ui/Badge';
import { ActorPill } from '../../../../components/ui/ActorPill';
import { useAuthStore } from '../../../../store/auth.store';
import { useT } from '../../../../lib/i18n';

interface InventoryRow {
  id: string;
  productName: string;
  sellingPrice: string;
  quantityOriginal: number;
  createdAt: string;
}

interface PaymentRow {
  id: string;
  amount: string;
  note: string | null;
  date: string;
  remainingBalance: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  actor?: { id: string; username: string } | null;
}

interface Credit {
  outstandingBalance: string;
  totalCreditGiven: string;
  totalReceived: string;
}

interface Detail {
  debtorUserId: string;
  debtorUsername: string;
  debtorEmail: string | null;
  debtorPhone: string | null;
  credit: Credit | null;
  productsConsigned: InventoryRow[];
  payments: PaymentRow[];
}

export default function DebtorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const qc = useQueryClient();
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: QK.debtorDetail(id),
    queryFn: () => dashboardApi.debtorDetail(id),
    enabled: !!id,
  });

  const approveMutation = useMutation({
    mutationFn: (paymentId: string) => paymentsApi.approvePayment(paymentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.debtorDetail(id) });
      qc.invalidateQueries({ queryKey: QK.debtors });
      qc.invalidateQueries({ queryKey: QK.dashboard });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (paymentId: string) => paymentsApi.rejectPayment(paymentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.debtorDetail(id) });
    },
  });

  if (isLoading) return <div className="p-8 text-center" style={{ color: 'var(--muted)' }}>{t.common.loading}</div>;

  const d = data as Detail | undefined;
  if (!d) return <div className="p-8 text-center" style={{ color: 'var(--muted)' }}>{t.common.notFound}</div>;

  const pendingCount = d.payments.filter((p) => p.status === 'PENDING').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href="/debtors" className="text-xs font-semibold mb-2 inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}>
            {t.debtors.backToDebtors}
          </Link>
          <h1 className="page-title">@{d.debtorUsername}</h1>
          <p className="page-sub">{t.debtors.debtorAccount}</p>
          {(d.debtorEmail || d.debtorPhone) && (
            <div className="flex items-center gap-4 mt-2">
              {d.debtorEmail && (
                <span className="text-sm" style={{ color: 'var(--muted)' }}>✉️ {d.debtorEmail}</span>
              )}
              {d.debtorPhone && (
                <a href={`tel:${d.debtorPhone}`} className="text-sm font-medium" style={{ color: 'var(--primary)' }}>
                  📞 {d.debtorPhone}
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="page-content space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard label={t.debtors.owesMe} value={formatCurrency(d.credit?.outstandingBalance ?? '0')} color="success" icon="💰" />
          <KpiCard label={t.debtors.totalGiven} value={formatCurrency(d.credit?.totalCreditGiven ?? '0')} icon="📤" />
          <KpiCard label={t.debtors.colTotalReceived} value={formatCurrency(d.credit?.totalReceived ?? '0')} color="primary" icon="✅" />
        </div>

        {/* Products consigned */}
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="font-bold text-sm tracking-tight" style={{ color: 'var(--foreground)' }}>{t.debtors.productsConsigned(d.productsConsigned?.length ?? 0)}</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full text-sm" style={{ minWidth: '540px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)' }}>
                  {[t.debtors.colProduct, t.debtors.colAgreedPrice, t.debtors.colQty, t.debtors.colTotalValue, t.debtors.colAdded].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.productsConsigned?.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: 'var(--muted)' }}>{t.debtors.noProductsConsigned}</td></tr>
                ) : (
                  d.productsConsigned?.map((row, i) => (
                    <tr key={row.id} style={{ background: i % 2 === 0 ? 'var(--card)' : '#FAFAFA', borderBottom: '1px solid var(--border)' }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium" style={{ color: 'var(--foreground)' }}>
                            {row.productName.charAt(0).toUpperCase() + row.productName.slice(1)}
                          </span>
                          <Badge label="Consigned" variant="consigned" />
                        </div>
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>{formatCurrency(row.sellingPrice)}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>{row.quantityOriginal}</td>
                      <td className="px-4 py-3 font-semibold" style={{ color: 'var(--success)' }}>
                        {formatCurrency((parseFloat(row.sellingPrice) * row.quantityOriginal).toFixed(2))}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>{formatDate(row.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Unified payment history */}
        <div className="rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)', overflow: 'hidden' }}>
          <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>
              {t.debtors.paymentHistory(d.payments.length)}
            </h2>
            {pendingCount > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--warning-light, #fffbeb)', color: 'var(--warning, #d97706)' }}>
                ⏳ {t.debtors.pendingPayments(pendingCount)}
              </span>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full text-sm" style={{ minWidth: '560px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)' }}>
                  {[t.debtors.colDate, t.debtors.colAmountReceived, t.debtors.colNote, t.debtors.colStatus, t.debtors.colBalanceAfter, ''].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.payments.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--muted)' }}>{t.debtors.noPayments}</td></tr>
                ) : (
                  d.payments.map((row, i) => (
                    <tr key={row.id} style={{ background: i % 2 === 0 ? 'var(--card)' : '#FAFAFA', borderBottom: '1px solid var(--border)' }}>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>
                        <div className="flex flex-col gap-0.5">
                          <span>{formatDate(row.date)}</span>
                          <ActorPill actor={row.actor ?? null} viewerId={user?.id} />
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold" style={{ color: 'var(--foreground)' }}>{formatCurrency(row.amount)}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>{row.note ?? '—'}</td>
                      <td className="px-4 py-3">
                        <Badge
                          label={
                            row.status === 'PENDING' ? t.debtors.statusPending
                            : row.status === 'REJECTED' ? t.debtors.statusRejected
                            : t.debtors.statusApproved
                          }
                          variant={
                            row.status === 'PENDING' ? 'pending'
                            : row.status === 'REJECTED' ? 'rejected'
                            : 'accepted'
                          }
                        />
                      </td>
                      <td className="px-4 py-3 font-semibold" style={{ color: row.remainingBalance && parseFloat(row.remainingBalance) > 0 ? 'var(--success)' : 'var(--muted)' }}>
                        {row.remainingBalance ? formatCurrency(row.remainingBalance) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {row.status === 'PENDING' && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => approveMutation.mutate(row.id)}
                              disabled={approveMutation.isPending || rejectMutation.isPending}
                              className="btn btn-primary"
                              style={{ fontSize: '12px', padding: '5px 14px', whiteSpace: 'nowrap' }}
                            >
                              {approveMutation.isPending && approveMutation.variables === row.id
                                ? t.debtors.approving
                                : t.debtors.approveBtn}
                            </button>
                            <button
                              onClick={() => rejectMutation.mutate(row.id)}
                              disabled={approveMutation.isPending || rejectMutation.isPending}
                              className="btn"
                              style={{ fontSize: '12px', padding: '5px 14px', whiteSpace: 'nowrap', background: 'var(--danger-light)', color: 'var(--danger)', border: '1px solid rgba(var(--danger-rgb),0.2)' }}
                            >
                              {rejectMutation.isPending && rejectMutation.variables === row.id
                                ? t.debtors.rejecting
                                : t.debtors.rejectBtn}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
