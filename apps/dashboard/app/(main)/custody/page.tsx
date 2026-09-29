'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  custodyApi,
  type CustodyHandover,
  type CustodyHandoverStatus,
  type StockCustody,
} from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { formatDate, getErrorMessage, initialsOf } from '../../../lib/utils';
import { usePageAccess } from '../../../hooks/use-page-access';
import { usePermissions } from '../../../lib/permissions';
import { useShopScope } from '../../../hooks/use-shop-scope';
import { useConfirm } from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../components/ui/Toast';
import { useT } from '../../../lib/i18n';
import HandoverDetail from './HandoverDetail';
import AppointPanel from './AppointPanel';
import VolumePanel from './VolumePanel';
import MyCustodyPanel from './MyCustodyPanel';

type Tab = 'volume' | 'handovers';

const STATUS_STYLE: Record<CustodyHandoverStatus, { bg: string; fg: string }> = {
  PENDING: { bg: 'rgba(var(--warning-rgb), 0.12)', fg: 'var(--warning)' },
  APPROVED: { bg: 'rgba(var(--primary-rgb), 0.12)', fg: 'var(--primary)' },
  REJECTED: { bg: 'rgba(var(--danger-rgb), 0.12)', fg: 'var(--danger)' },
};

/**
 * One route, two audiences: the owner appoints and settles here, and the
 * custodian they appointed reaches their own accept/approve/handover screen
 * through the very same URL. `custody.manage` is owner-only (never grantable
 * through a role), so `can()` alone tells the two apart.
 */
export default function CustodyPage() {
  const { can } = usePermissions();
  const allowed = usePageAccess('custody.manage', 'custody.hold');
  if (!allowed) return null;
  if (!can('custody.manage')) return <MyCustodyPanel />;
  return <OwnerCustodyPanel />;
}

function OwnerCustodyPanel() {
  const qc = useQueryClient();
  const { canWrite, isAllShops } = useShopScope();
  const confirm = useConfirm();
  const toast = useToast();
  const t = useT();
  const [tab, setTab] = useState<Tab>('volume');
  const [statusFilter, setStatusFilter] = useState<CustodyHandoverStatus | ''>('');
  const [custodianFilter, setCustodianFilter] = useState('');
  const [openHandover, setOpenHandover] = useState<string | null>(null);

  const { data: custody, isLoading: loadingCustody } = useQuery({
    queryKey: QK.custodyCurrent,
    queryFn: () => custodyApi.current(),
    staleTime: 15_000,
  });

  const handoverFilters = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(custodianFilter ? { custodianId: custodianFilter } : {}),
  };
  const { data: handovers, isLoading: loadingHandovers } = useQuery({
    queryKey: QK.custodyHandovers(handoverFilters),
    queryFn: () => custodyApi.handovers(handoverFilters),
    enabled: tab === 'handovers',
    staleTime: 15_000,
  });

  const close = useMutation({
    mutationFn: (id: string) => custodyApi.close(id),
    onSuccess: (_data, id) => {
      const c = id === custody?.id ? custody : undefined;
      const name = c?.custodian?.name ?? c?.custodian?.username ?? '';
      qc.invalidateQueries({ queryKey: QK.custodyCurrent });
      toast({
        variant: 'success',
        title: t.custody.toastEndedTitle,
        description: name ? t.custody.toastEndedBody(name) : undefined,
      });
    },
    onError: (e) =>
      toast({ variant: 'error', title: t.toasts.errorTitle, description: getErrorMessage(e) }),
  });

  const rows = (handovers as CustodyHandover[] | undefined) ?? [];
  // Everyone who has ever handed over, so the filter offers real names rather
  // than asking the owner to remember an id.
  const custodians = [
    ...new Map(
      rows
        .filter((h) => h.custodian)
        .map((h) => [h.custodianId, h.custodian!] as const),
    ).values(),
  ];

  const onClose = async (c: StockCustody): Promise<void> => {
    const ok = await confirm({
      title: t.custody.endTitle,
      description: t.custody.endBody,
      confirmLabel: t.custody.endCustody,
    });
    if (ok) close.mutate(c.id);
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.custody.title}</h1>
          <p className="page-sub">{t.custody.subtitle}</p>
        </div>
      </div>

      <div className="flex gap-1 mb-5">
        {(
          [
            ['volume', t.custody.tabVolume],
            ['handovers', t.custody.tabHandovers],
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
          </button>
        ))}
      </div>

      {tab === 'volume' &&
        (loadingCustody ? (
          <div className="skeleton h-40 rounded-xl" />
        ) : custody ? (
          <VolumePanel custody={custody} canWrite={canWrite} onEnd={() => onClose(custody)} />
        ) : (
          <AppointPanel canWrite={canWrite} isAllShops={isAllShops} />
        ))}

      {tab === 'handovers' && (
        <>
          <div className="flex gap-3 flex-wrap mb-4">
            <select
              value={custodianFilter}
              onChange={(e) => setCustodianFilter(e.target.value)}
              className="input"
              style={{ maxWidth: 220 }}
            >
              <option value="">{t.custody.allEmployees}</option>
              {custodians.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? c.username}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as CustodyHandoverStatus | '')}
              className="input"
              style={{ maxWidth: 180 }}
            >
              <option value="">{t.custody.anyState}</option>
              <option value="PENDING">{t.custody.statusPending}</option>
              <option value="APPROVED">{t.custody.statusApproved}</option>
              <option value="REJECTED">{t.custody.statusRejected}</option>
            </select>
          </div>

          {loadingHandovers ? (
            <div className="skeleton h-40 rounded-xl" />
          ) : rows.length === 0 ? (
            <div
              className="card p-10 text-center text-sm"
              style={{ color: 'var(--muted)' }}
            >
              {t.custody.noHandovers}
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>{t.custody.colEmployee}</th>
                    <th>{t.custody.colPeriod}</th>
                    <th className="text-right">{t.custody.colExpected}</th>
                    <th className="text-right">{t.custody.colHandedOver}</th>
                    <th className="text-right">{t.custody.colDifference}</th>
                    <th>{t.custody.colState}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((h) => {
                    const diff = Number(h.cashDeclaredFc) - Number(h.cashExpectedFc);
                    return (
                      <tr
                        key={h.id}
                        onClick={() => setOpenHandover(h.id)}
                        className="cursor-pointer"
                      >
                        <td>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                              style={{ background: 'var(--brand-gradient)', color: '#fff' }}
                            >
                              {initialsOf(h.custodian?.name ?? h.custodian?.username ?? '?')}
                            </div>
                            <span>{h.custodian?.name ?? h.custodian?.username ?? '—'}</span>
                          </div>
                        </td>
                        <td style={{ color: 'var(--muted)' }}>
                          {formatDate(h.periodStart)} → {formatDate(h.periodEnd)}
                        </td>
                        <td className="text-right tabular-nums">
                          {Number(h.cashExpectedFc).toLocaleString('fr-CD')}
                        </td>
                        <td className="text-right tabular-nums">
                          {Number(h.cashDeclaredFc).toLocaleString('fr-CD')}
                        </td>
                        <td
                          className="text-right tabular-nums"
                          style={{
                            color:
                              diff < 0
                                ? 'var(--danger)'
                                : diff > 0
                                  ? 'var(--primary)'
                                  : 'var(--muted)',
                          }}
                        >
                          {diff === 0 ? '—' : diff.toLocaleString('fr-CD')}
                        </td>
                        <td>
                          <span
                            className="px-2 py-0.5 rounded-md text-xs"
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {openHandover && (
        <HandoverDetail
          handoverId={openHandover}
          canWrite={canWrite}
          onClose={() => setOpenHandover(null)}
        />
      )}
    </div>
  );
}
