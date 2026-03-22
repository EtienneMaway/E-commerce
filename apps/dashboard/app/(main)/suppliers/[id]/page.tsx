'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../../../../lib/api';
import { QK } from '../../../../lib/query-keys';
import { formatDate } from '../../../../lib/utils';
import { useFormatCurrency } from '../../../../lib/currency';
import { KpiCard } from '../../../../components/ui/KpiCard';
import { Badge } from '../../../../components/ui/Badge';
import { useT } from '../../../../lib/i18n';

interface InventoryRow {
  id: string;
  productName: string;
  unitCost: string;
  sellingPrice: string;
  quantityOriginal: number;
  quantityRemaining: number;
  createdAt: string;
}

interface PaymentRow {
  id: string;
  amount: string;
  note: string | null;
  date: string;
  remainingBalance: string | null;
  status: 'PENDING' | 'APPROVED';
}

interface Debt {
  outstandingBalance: string;
  totalCreditReceived: string;
  totalPaid: string;
}

interface Detail {
  supplierUserId: string;
  supplierUsername: string;
  debt: Debt | null;
  productsReceived: InventoryRow[];
  totalValueSold: string;
  payments: PaymentRow[];
}

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const formatCurrency = useFormatCurrency();

  const { data, isLoading } = useQuery({
    queryKey: QK.supplierDetail(id),
    queryFn: () => dashboardApi.supplierDetail(id),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-8 text-center" style={{ color: 'var(--muted)' }}>{t.common.loading}</div>;

  const d = data as Detail | undefined;
  if (!d) return <div className="p-8 text-center" style={{ color: 'var(--muted)' }}>{t.common.notFound}</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href="/suppliers" className="text-xs font-semibold mb-2 inline-flex items-center gap-1" style={{ color: 'var(--primary)' }}>
            {t.suppliers.backToSuppliers}
          </Link>
          <h1 className="page-title">@{d.supplierUsername}</h1>
          <p className="page-sub">{t.suppliers.supplierAccount}</p>
        </div>
      </div>

      <div className="page-content space-y-6">
        {/* KPI row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard label={t.suppliers.iOwe} value={formatCurrency(d.debt?.outstandingBalance ?? '0')} color="danger" icon="💸" />
          <KpiCard label={t.suppliers.totalReceived} value={formatCurrency(d.debt?.totalCreditReceived ?? '0')} icon="📦" />
          <KpiCard label={t.suppliers.totalPaid} value={formatCurrency(d.debt?.totalPaid ?? '0')} color="success" icon="✅" />
        </div>

        {/* Products table */}
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="font-bold text-sm tracking-tight" style={{ color: 'var(--foreground)' }}>{t.suppliers.productsReceived(d.productsReceived.length)}</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm" style={{ minWidth: '560px' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)' }}>
                {[t.suppliers.colProduct, t.suppliers.colCost, t.suppliers.colSellingPrice, t.suppliers.colRemainingTotal, t.suppliers.colAdded].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.productsReceived.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: 'var(--muted)' }}>{t.suppliers.noProducts}</td></tr>
              ) : (
                d.productsReceived.map((row, i) => (
                  <tr key={row.id} style={{ background: i % 2 === 0 ? 'var(--card)' : '#FAFAFA', borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium" style={{ color: 'var(--foreground)' }}>
                          {row.productName.charAt(0).toUpperCase() + row.productName.slice(1)}
                        </span>
                        <Badge label="Supplier" variant="supplier" />
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>{formatCurrency(row.unitCost)}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>{formatCurrency(row.sellingPrice)}</td>
                    <td className="px-4 py-3" style={{ color: row.quantityRemaining <= 5 ? 'var(--danger)' : 'var(--foreground)', fontWeight: row.quantityRemaining <= 5 ? 600 : 400 }}>
                      {row.quantityRemaining} / {row.quantityOriginal}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>{formatDate(row.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>

        {/* Payments table */}
        <div className="rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)', overflow: 'hidden' }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>{t.suppliers.paymentHistory(d.payments.length)}</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm" style={{ minWidth: '560px' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)' }}>
                {[t.suppliers.colDate, t.suppliers.colAmountPaid, t.suppliers.colNote, t.suppliers.colStatus, t.suppliers.colBalanceAfter].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.payments.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: 'var(--muted)' }}>{t.suppliers.noPayments}</td></tr>
              ) : (
                d.payments.map((row, i) => (
                  <tr key={row.id} style={{ background: i % 2 === 0 ? 'var(--card)' : '#FAFAFA', borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>{formatDate(row.date)}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: 'var(--foreground)' }}>{formatCurrency(row.amount)}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>{row.note ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge
                        label={row.status === 'PENDING' ? t.suppliers.statusPending : t.suppliers.statusApproved}
                        variant={row.status === 'PENDING' ? 'pending' : 'accepted'}
                      />
                    </td>
                    <td className="px-4 py-3 font-semibold" style={{ color: row.remainingBalance && parseFloat(row.remainingBalance) > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {row.remainingBalance ? formatCurrency(row.remainingBalance) : '—'}
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
