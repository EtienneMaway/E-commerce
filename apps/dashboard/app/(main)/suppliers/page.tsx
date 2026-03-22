'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { useFormatCurrency } from '../../../lib/currency';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { KpiCard } from '../../../components/ui/KpiCard';
import { Badge } from '../../../components/ui/Badge';
import { PaySupplierDialog } from '../../../components/forms/PaySupplierDialog';
import { useT } from '../../../lib/i18n';

interface Row {
  supplierUserId: string;
  supplierUsername: string;
  outstandingBalance: string;
  totalCreditReceived: string;
  totalPaid: string;
}

interface PayTarget {
  id: string;
  username: string;
  outstanding: string;
}

export default function SuppliersPage() {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: QK.suppliers,
    queryFn: () => dashboardApi.suppliers(),
    staleTime: 30_000,
  });

  const rows = (data as Row[] | undefined) ?? [];

  const totalOwed     = rows.reduce((s, r) => s + parseFloat(r.outstandingBalance),   0);
  const totalReceived = rows.reduce((s, r) => s + parseFloat(r.totalCreditReceived),  0);
  const totalPaid     = rows.reduce((s, r) => s + parseFloat(r.totalPaid),            0);

  const COLUMNS: Column<Row>[] = [
    {
      key: 'supplierUsername', header: t.suppliers.colSupplier, sortable: true,
      render: (r) => (
        <Link href={`/suppliers/${r.supplierUserId}`} className="font-medium hover:underline" style={{ color: 'var(--primary)' }}>
          @{r.supplierUsername}
        </Link>
      ),
    },
    {
      key: 'totalCreditReceived', header: t.suppliers.colTotalReceived, sortable: true,
      getValue: (r) => parseFloat(r.totalCreditReceived),
      render: (r) => <span style={{ color: 'var(--foreground)' }}>{formatCurrency(r.totalCreditReceived)}</span>,
    },
    {
      key: 'totalPaid', header: t.suppliers.colTotalPaid, sortable: true,
      getValue: (r) => parseFloat(r.totalPaid),
      render: (r) => <span style={{ color: 'var(--success)' }}>{formatCurrency(r.totalPaid)}</span>,
    },
    {
      key: 'outstandingBalance', header: t.suppliers.colOutstanding, sortable: true,
      getValue: (r) => parseFloat(r.outstandingBalance),
      render: (r) => (
        <span style={{ color: parseFloat(r.outstandingBalance) > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
          {formatCurrency(r.outstandingBalance)}
        </span>
      ),
    },
    {
      key: 'status', header: t.suppliers.colStatus,
      render: (r) => (
        <Badge
          label={parseFloat(r.outstandingBalance) === 0 ? t.suppliers.statusSettled : t.suppliers.statusActive}
          variant={parseFloat(r.outstandingBalance) === 0 ? 'accepted' : 'pending'}
        />
      ),
    },
    {
      key: 'actions', header: '',
      render: (r) => (
        <div className="flex items-center gap-2">
          {parseFloat(r.outstandingBalance) > 0 && (
            <button
              onClick={() => setPayTarget({ id: r.supplierUserId, username: r.supplierUsername, outstanding: r.outstandingBalance })}
              className="btn btn-primary"
              style={{ fontSize: '12px', padding: '5px 12px' }}
            >
              {t.suppliers.payBtn}
            </button>
          )}
          <Link href={`/suppliers/${r.supplierUserId}`} className="text-sm font-medium hover:underline" style={{ color: 'var(--primary)' }}>
            {t.common.viewArrow}
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PaySupplierDialog supplier={payTarget} onClose={() => setPayTarget(null)} />

      <div className="page-header">
        <div>
          <h1 className="page-title">{t.suppliers.title}</h1>
          <p className="page-sub">
            {t.suppliers.sub(rows.length, formatCurrency(totalOwed.toFixed(2)))}
          </p>
        </div>
      </div>

      <div className="page-content space-y-6">
        {/* KPI summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label={t.suppliers.kpiSuppliers}
            value={String(rows.length)}
            icon="🏭"
            loading={isLoading}
          />
          <KpiCard
            label={t.suppliers.kpiTotalOwed}
            value={formatCurrency(totalOwed.toFixed(2))}
            icon="💸"
            color="danger"
            loading={isLoading}
          />
          <KpiCard
            label={t.suppliers.kpiTotalReceived}
            value={formatCurrency(totalReceived.toFixed(2))}
            icon="📦"
            loading={isLoading}
          />
          <KpiCard
            label={t.suppliers.kpiTotalPaid}
            value={formatCurrency(totalPaid.toFixed(2))}
            icon="✅"
            color="success"
            loading={isLoading}
          />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="loading-state"><div className="spinner" /><span>{t.suppliers.loading}</span></div>
        ) : (
          <DataTable
            columns={COLUMNS}
            data={rows}
            keyField="supplierUserId"
            searchPlaceholder={t.suppliers.searchPlaceholder}
            searchFields={['supplierUsername']}
          />
        )}
      </div>
    </div>
  );
}
