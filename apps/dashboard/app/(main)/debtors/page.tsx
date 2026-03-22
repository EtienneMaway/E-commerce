'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { useFormatCurrency } from '../../../lib/currency';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { useT } from '../../../lib/i18n';

interface Row {
  debtorUserId: string;
  debtorUsername: string;
  outstandingBalance: string;
  totalCreditGiven: string;
  totalReceived: string;
}

export default function DebtorsPage() {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const { data, isLoading } = useQuery({
    queryKey: QK.debtors,
    queryFn: () => dashboardApi.debtors(),
    staleTime: 30_000,
  });

  const rows = (data as Row[] | undefined) ?? [];
  const totalOwed = rows.reduce((s, r) => s + parseFloat(r.outstandingBalance), 0);

  const COLUMNS: Column<Row>[] = [
    {
      key: 'debtorUsername', header: t.debtors.colDebtor, sortable: true,
      render: (r) => (
        <Link href={`/debtors/${r.debtorUserId}`} className="font-medium hover:underline" style={{ color: 'var(--primary)' }}>
          @{r.debtorUsername}
        </Link>
      ),
    },
    {
      key: 'totalCreditGiven', header: t.debtors.colTotalGiven, sortable: true,
      getValue: (r) => parseFloat(r.totalCreditGiven),
      render: (r) => formatCurrency(r.totalCreditGiven),
    },
    {
      key: 'totalReceived', header: t.debtors.colTotalReceived, sortable: true,
      getValue: (r) => parseFloat(r.totalReceived),
      render: (r) => formatCurrency(r.totalReceived),
    },
    {
      key: 'outstandingBalance', header: t.debtors.colOutstanding, sortable: true,
      getValue: (r) => parseFloat(r.outstandingBalance),
      render: (r) => (
        <span style={{ color: parseFloat(r.outstandingBalance) > 0 ? 'var(--success)' : 'var(--muted)', fontWeight: 600 }}>
          {formatCurrency(r.outstandingBalance)}
        </span>
      ),
    },
    {
      key: 'actions', header: '',
      render: (r) => (
        <Link href={`/debtors/${r.debtorUserId}`} className="text-sm font-medium hover:underline" style={{ color: 'var(--primary)' }}>
          {t.common.viewArrow}
        </Link>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.debtors.title}</h1>
          <p className="page-sub">
            {t.debtors.sub(rows.length, formatCurrency(totalOwed.toFixed(2)))}
          </p>
        </div>
      </div>
      <div className="page-content">
        {isLoading ? (
          <div className="loading-state"><div className="spinner" /><span>{t.debtors.loading}</span></div>
        ) : (
          <DataTable
            columns={COLUMNS}
            data={rows}
            keyField="debtorUserId"
            searchPlaceholder={t.debtors.searchPlaceholder}
            searchFields={['debtorUsername']}
          />
        )}
      </div>
    </div>
  );
}
