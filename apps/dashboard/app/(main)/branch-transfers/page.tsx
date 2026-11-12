'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PAGE_SIZE } from '../../../lib/api';
import { Pagination, useClampPage } from '../../../components/ui/Pagination';
import {
  branchTransfersApi,
  type BranchBalance,
  type BranchPayment,
  type BranchTransfer,
} from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { formatDate, getErrorMessage } from '../../../lib/utils';
import { useFormatCurrency } from '../../../lib/currency';
import { usePageAccess } from '../../../hooks/use-page-access';
import { usePermissions } from '../../../lib/permissions';
import { useShopScope } from '../../../hooks/use-shop-scope';
import { useShopStore } from '../../../store/shop.store';
import { useConfirm } from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../components/ui/Toast';
import { useT } from '../../../lib/i18n';
import SendTransferDialog from './SendTransferDialog';
import TransferDetail from './TransferDetail';
import PayBranchDialog from './PayBranchDialog';
import { PaymentStatusPill, TransferStatusPill } from './StatusPills';

type Tab = 'incoming' | 'outgoing' | 'balances';

/** FC is whole notes; USD keeps the ledger's precision. Amount as handed over, not converted. */
function formatPaid(p: BranchPayment): string {
  const n = Number(p.amount);
  return p.currency === 'FC'
    ? `${Math.trunc(n).toLocaleString('fr-CD')} FC`
    : `${(Math.trunc(n * 100) / 100).toFixed(2)} USD`;
}

const personName = (p: BranchPayment['paidBy']): string => p?.name ?? p?.username ?? '—';

/**
 * Moving stock between two branches of one business (BRANCH_TRANSFER_PLAN.md).
 *
 * Two audiences on one route, like /custody: the owner (`custody.manage`), and
 * the branch's person in charge (`custody.hold`). Both act only for the branch
 * they are in — the API refuses anything else — so every action below is shown
 * only when the transfer or payment concerns the current branch.
 */
export default function BranchTransfersPage() {
  const allowed = usePageAccess('custody.manage', 'custody.hold');
  if (!allowed) return null;
  return <BranchTransfersView />;
}

function BranchTransfersView() {
  const t = useT();
  const fmt = useFormatCurrency();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = usePermissions();
  const isOwner = can('custody.manage');
  const { canWrite, isAllShops, shopId } = useShopScope();
  const { shops } = useShopStore();
  // Null under "All branches"; otherwise the selected branch, or the default
  // one the API resolves when nothing is selected (an employee's only branch).
  const currentShopId = isAllShops
    ? null
    : (shopId ?? shops.find((s) => s.isDefault)?.id ?? shops[0]?.id ?? null);

  const [tab, setTab] = useState<Tab>('incoming');
  const [sending, setSending] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [paying, setPaying] = useState<BranchBalance | null>(null);

  const direction = isAllShops || tab === 'balances' ? undefined : tab;
  const [page, setPage] = useState(1);
  // A different tab or branch is a different list: start it from the top.
  useEffect(() => setPage(1), [direction, currentShopId]);
  const { data: transferPage, isLoading } = useQuery({
    queryKey: QK.branchTransfers({ direction, shop: currentShopId, page }),
    queryFn: () => branchTransfersApi.listPage(page, direction ? { direction } : undefined),
    enabled: tab !== 'balances',
    staleTime: 10_000,
    // Keep the rows on screen when paging through the SAME tab; a different
    // tab is a different list and must not show the other tab's rows.
    placeholderData: (prev, prevQuery) =>
      (prevQuery?.queryKey[2] as { direction?: string } | undefined)?.direction === direction ? prev : undefined,
  });
  const transfers = transferPage?.data;
  useClampPage(page, transferPage?.pagination.totalPages, setPage);
  const { data: balances } = useQuery({
    queryKey: QK.branchBalances,
    queryFn: branchTransfersApi.balances,
    staleTime: 10_000,
  });
  const { data: payments, isLoading: loadingPayments } = useQuery({
    queryKey: QK.branchPayments,
    queryFn: branchTransfersApi.payments,
    enabled: tab === 'balances',
    staleTime: 10_000,
  });

  const refresh = (): void => {
    qc.invalidateQueries({ queryKey: QK.branchTransfersAll });
    qc.invalidateQueries({ queryKey: QK.alerts });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const onError = (e: unknown): void =>
    toast({ variant: 'error', title: t.toasts.errorTitle, description: getErrorMessage(e) });

  const confirmPay = useMutation({
    mutationFn: (id: string) => branchTransfersApi.confirmPayment(id),
    onSuccess: () => {
      toast({ variant: 'success', title: t.branchTransfers.toastPaymentConfirmed });
      refresh();
    },
    onError,
  });
  const rejectPay = useMutation({
    mutationFn: (id: string) => branchTransfersApi.rejectPayment(id),
    onSuccess: () => {
      toast({ variant: 'success', title: t.branchTransfers.toastPaymentRejected });
      refresh();
    },
    onError,
  });

  const rows = transfers ?? [];
  const balanceRows = balances ?? [];
  const owedHere = balanceRows
    .filter((b) => b.creditorShopId === currentShopId)
    .reduce((n, b) => n + Number(b.outstanding), 0);
  const owesHere = balanceRows
    .filter((b) => b.debtorShopId === currentShopId)
    .reduce((n, b) => n + Number(b.outstanding), 0);
  const opened = rows.find((r) => r.id === openId) ?? null;

  const unitsOf = (tr: BranchTransfer): number => tr.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.branchTransfers.title}</h1>
          <p className="page-sub">{t.branchTransfers.subtitle}</p>
        </div>
        {canWrite && (
          <button className="btn btn-primary" onClick={() => setSending(true)}>
            {t.branchTransfers.send}
          </button>
        )}
      </div>

      {isAllShops && (
        <p className="text-xs mb-4 px-3 py-2 rounded-lg" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
          {t.branchTransfers.allBranchesReadOnly}
        </p>
      )}

      {!isAllShops && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          <div className="card p-4">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{t.branchTransfers.owedToBranch}</p>
            <p className="text-lg font-bold tabular-nums mt-1" style={{ color: 'var(--primary)' }}>
              {fmt(String(owedHere))}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{t.branchTransfers.branchOwes}</p>
            <p
              className="text-lg font-bold tabular-nums mt-1"
              style={{ color: owesHere > 0 ? 'var(--danger)' : 'var(--foreground)' }}
            >
              {fmt(String(owesHere))}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-1 mb-5 overflow-x-auto">
        {(isAllShops
          ? ([
              ['incoming', t.branchTransfers.tabAll],
              ['balances', t.branchTransfers.tabBalances],
            ] as const)
          : ([
              ['incoming', t.branchTransfers.tabIncoming],
              ['outgoing', t.branchTransfers.tabOutgoing],
              ['balances', t.branchTransfers.tabBalances],
            ] as const)
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="px-4 py-2 text-sm rounded-lg transition-colors whitespace-nowrap"
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

      {tab !== 'balances' &&
        (isLoading ? (
          <div className="skeleton h-40 rounded-xl" />
        ) : rows.length === 0 ? (
          <div className="card p-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
            {isAllShops
              ? t.branchTransfers.noTransfers
              : tab === 'incoming'
                ? t.branchTransfers.noIncoming
                : t.branchTransfers.noOutgoing}
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>{t.branchTransfers.colDate}</th>
                  {(isAllShops || tab === 'incoming') && <th>{t.branchTransfers.colFrom}</th>}
                  {(isAllShops || tab === 'outgoing') && <th>{t.branchTransfers.colTo}</th>}
                  <th>{t.branchTransfers.colItems}</th>
                  <th className="text-right">{t.branchTransfers.colValue}</th>
                  <th>{t.branchTransfers.colStatus}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((tr) => (
                  <tr key={tr.id} onClick={() => setOpenId(tr.id)} className="cursor-pointer">
                    <td style={{ color: 'var(--muted)' }}>{formatDate(tr.sentAt)}</td>
                    {(isAllShops || tab === 'incoming') && <td>{tr.fromShop.name}</td>}
                    {(isAllShops || tab === 'outgoing') && <td>{tr.toShop.name}</td>}
                    <td>
                      <div className="truncate max-w-[260px]">
                        {tr.items.map((i) => (i.variantLabel ? `${i.productName} ${i.variantLabel}` : i.productName)).join(', ')}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>
                        {t.branchTransfers.itemsSummary(tr.items.length, unitsOf(tr))}
                      </div>
                    </td>
                    <td className="text-right tabular-nums">{fmt(tr.totalValue)}</td>
                    <td>
                      <TransferStatusPill status={tr.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {transferPage && (
              <Pagination
                page={transferPage.pagination.page}
                totalPages={transferPage.pagination.totalPages}
                total={transferPage.pagination.total}
                pageSize={PAGE_SIZE}
                onChange={setPage}
              />
            )}
          </div>
        ))}

      {tab === 'balances' && (
        <div className="space-y-6">
          <section>
            <h2 className="font-bold text-sm mb-3" style={{ color: 'var(--foreground)' }}>
              {t.branchTransfers.balancesTitle}
            </h2>
            {balanceRows.length === 0 ? (
              <div className="card p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
                {t.branchTransfers.noBalances}
              </div>
            ) : (
              <div className="card overflow-x-auto">
                <table className="data-table w-full">
                  <thead>
                    <tr>
                      <th>{isAllShops ? t.branchTransfers.colDirection : t.branchTransfers.colBranch}</th>
                      {!isAllShops && <th>{t.branchTransfers.colDirection}</th>}
                      <th className="text-right">{t.branchTransfers.colGiven}</th>
                      <th className="text-right">{t.branchTransfers.colPaid}</th>
                      <th className="text-right">{t.branchTransfers.colOutstanding}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {balanceRows.map((b) => {
                      const weOwe = b.debtorShopId === currentShopId;
                      const other = weOwe ? b.creditorShop.name : b.debtorShop.name;
                      return (
                        <tr key={b.id}>
                          {isAllShops ? (
                            <td>{t.branchTransfers.owesBranch(b.debtorShop.name, b.creditorShop.name)}</td>
                          ) : (
                            <>
                              <td>{other}</td>
                              <td style={{ color: weOwe ? 'var(--danger)' : 'var(--primary)' }}>
                                {weOwe ? t.branchTransfers.thisBranchOwes : t.branchTransfers.owesThisBranch}
                              </td>
                            </>
                          )}
                          <td className="text-right tabular-nums">{fmt(b.totalGiven)}</td>
                          <td className="text-right tabular-nums">{fmt(b.totalPaid)}</td>
                          <td className="text-right tabular-nums font-semibold">{fmt(b.outstanding)}</td>
                          <td className="text-right">
                            {canWrite && weOwe && Number(b.outstanding) > 0 && (
                              <button className="btn btn-primary text-xs" onClick={() => setPaying(b)}>
                                {t.branchTransfers.pay}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="font-bold text-sm mb-3" style={{ color: 'var(--foreground)' }}>
              {t.branchTransfers.paymentsTitle}
            </h2>
            {loadingPayments ? (
              <div className="skeleton h-32 rounded-xl" />
            ) : (payments ?? []).length === 0 ? (
              <div className="card p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
                {t.branchTransfers.noPayments}
              </div>
            ) : (
              <div className="card overflow-x-auto">
                <table className="data-table w-full">
                  <thead>
                    <tr>
                      <th>{t.branchTransfers.colDate}</th>
                      <th>{t.branchTransfers.colFrom}</th>
                      <th>{t.branchTransfers.colTo}</th>
                      <th className="text-right">{t.branchTransfers.colAmount}</th>
                      <th className="text-right">{t.branchTransfers.colLedger}</th>
                      <th>{t.branchTransfers.colBy}</th>
                      <th>{t.branchTransfers.colStatus}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(payments ?? []).map((p) => {
                      const toConfirm = canWrite && p.status === 'PENDING' && p.toShopId === currentShopId;
                      return (
                        <tr key={p.id}>
                          <td style={{ color: 'var(--muted)' }}>{formatDate(p.createdAt)}</td>
                          <td>{p.fromShop.name}</td>
                          <td>{p.toShop.name}</td>
                          <td className="text-right tabular-nums">{formatPaid(p)}</td>
                          <td className="text-right tabular-nums">{fmt(p.amountUsd)}</td>
                          <td>{personName(p.paidBy)}</td>
                          <td>
                            <PaymentStatusPill status={p.status} />
                          </td>
                          <td className="text-right whitespace-nowrap">
                            {toConfirm && (
                              <div className="flex gap-1 justify-end">
                                <button
                                  className="btn btn-ghost text-xs"
                                  disabled={rejectPay.isPending || confirmPay.isPending}
                                  onClick={async () => {
                                    const ok = await confirm({
                                      title: t.branchTransfers.rejectPaymentTitle,
                                      description: t.branchTransfers.rejectPaymentBody,
                                      confirmLabel: t.branchTransfers.rejectPayment,
                                      variant: 'danger',
                                    });
                                    if (ok) rejectPay.mutate(p.id);
                                  }}
                                >
                                  {t.branchTransfers.rejectPayment}
                                </button>
                                <button
                                  className="btn btn-primary text-xs"
                                  disabled={rejectPay.isPending || confirmPay.isPending}
                                  onClick={async () => {
                                    const ok = await confirm({
                                      title: t.branchTransfers.confirmPaymentTitle,
                                      description: t.branchTransfers.confirmPaymentBody(formatPaid(p), p.fromShop.name),
                                      confirmLabel: t.branchTransfers.confirmPayment,
                                    });
                                    if (ok) confirmPay.mutate(p.id);
                                  }}
                                >
                                  {t.branchTransfers.confirmPayment}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {sending && <SendTransferDialog isOwner={isOwner} onClose={() => setSending(false)} />}
      {opened && (
        <TransferDetail
          transfer={opened}
          currentShopId={currentShopId}
          canWrite={canWrite}
          onClose={() => setOpenId(null)}
        />
      )}
      {paying && <PayBranchDialog balance={paying} isOwner={isOwner} onClose={() => setPaying(null)} />}
    </div>
  );
}
