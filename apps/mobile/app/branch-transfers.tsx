import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Stack } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNetInfo } from '@react-native-community/netinfo';
import {
  branchTransfersApi,
  type BranchBalance,
  type BranchPayment,
  type BranchTransfer,
  type BranchTransferStatus,
} from '../lib/api';
import { QK } from '../lib/query-keys';
import { usePagedList, fromPaginated, MOBILE_PAGE_SIZE } from '../lib/paged-list';
import { ListFooter } from '../components/ui/ListFooter';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { SendBranchTransferModal } from '../components/forms/SendBranchTransferModal';
import { PayBranchModal } from '../components/forms/PayBranchModal';
import { formatDate, getErrorMessage } from '../lib/utils';
import { useFormatCurrency } from '../lib/currency';
import { useRequireService } from '../hooks/use-require-service';
import { usePermissions } from '../lib/permissions';
import { useShopStore } from '../store/shop.store';
import { useOfflineStore } from '../store/offline.store';
import { useT } from '../lib/i18n';
import { useBrand } from '../lib/theme';

type Tab = 'incoming' | 'outgoing' | 'balances';

const STATUS_CLASS: Record<BranchTransferStatus, string> = {
  IN_TRANSIT: 'bg-warning-light text-warning',
  RECEIVED: 'bg-success-light text-success',
  REJECTED: 'bg-danger-light text-danger',
  CANCELLED: 'bg-surface text-muted',
};

const fcAmount = (p: BranchPayment): string =>
  p.currency === 'FC'
    ? `${Math.trunc(Number(p.amount)).toLocaleString('fr-CD')} FC`
    : `${(Math.trunc(Number(p.amount) * 100) / 100).toFixed(2)} USD`;

/**
 * Branch-to-branch stock transfers (BRANCH_TRANSFER_PLAN.md) for the owner and
 * the branch's person in charge.
 *
 * Online only by design: a transfer moves stock between two branches and
 * creates a debt, so it must never be replayed later from an offline queue.
 * Every action is disabled while the phone is offline (or in manual offline
 * mode), with a banner saying why.
 */
export default function BranchTransfersScreen() {
  const allowed = useRequireService('custody.manage', 'custody.hold');
  const t = useT();
  const brand = useBrand();
  const qc = useQueryClient();
  const fmt = useFormatCurrency();
  const { unrestricted } = usePermissions();
  const { selectedId, defaultShopId, organization, employed } = useShopStore();
  const manualOffline = useOfflineStore((s) => s.isOffline);
  const net = useNetInfo();
  const online = !manualOffline && net.isConnected !== false && net.isInternetReachable !== false;

  // An employee is pinned to their branch; an owner has the one they picked.
  const currentShopId = (employed ? defaultShopId : selectedId ?? defaultShopId) ?? null;
  const isOwner = unrestricted && !!organization?.isOwner;

  const [tab, setTab] = useState<Tab>('incoming');
  const [sending, setSending] = useState(false);
  const [paying, setPaying] = useState<BranchBalance | null>(null);
  const [rejecting, setRejecting] = useState<BranchTransfer | null>(null);
  const [reason, setReason] = useState('');

  const listDirection = tab === 'outgoing' ? 'outgoing' : 'incoming';
  // Paged; loaded pages persist, so the list reads offline and reopens instantly.
  const transfers = usePagedList<BranchTransfer>({
    queryKey: QK.branchTransferPages(listDirection),
    fetchPage: async (page) =>
      fromPaginated(await branchTransfersApi.listPage(listDirection, page, MOBILE_PAGE_SIZE)),
    enabled: allowed && tab !== 'balances',
    getId: (tr) => tr.id,
  });
  const balances = useQuery({
    queryKey: QK.branchBalances,
    queryFn: branchTransfersApi.balances,
    enabled: allowed,
  });
  const payments = useQuery({
    queryKey: QK.branchPayments,
    queryFn: branchTransfersApi.payments,
    enabled: allowed && tab === 'balances',
  });

  const refreshAll = (): void => {
    qc.invalidateQueries({ queryKey: QK.branchTransfersAll });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['custody'] });
    qc.invalidateQueries({ queryKey: QK.dashboardAll });
  };
  const fail = (e: unknown): void => Alert.alert(t.branchTransfers.actionFailed, getErrorMessage(e));

  const receive = useMutation({
    mutationFn: (id: string) => branchTransfersApi.receive(id),
    onSuccess: () => {
      refreshAll();
      Alert.alert(t.branchTransfers.receivedTitle);
    },
    onError: fail,
  });
  const reject = useMutation({
    mutationFn: ({ id, why }: { id: string; why: string }) => branchTransfersApi.reject(id, why),
    onSuccess: () => {
      refreshAll();
      setRejecting(null);
      setReason('');
      Alert.alert(t.branchTransfers.rejectedTitle);
    },
    onError: fail,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => branchTransfersApi.cancel(id),
    onSuccess: () => {
      refreshAll();
      Alert.alert(t.branchTransfers.cancelledTitle);
    },
    onError: fail,
  });
  const confirmPay = useMutation({
    mutationFn: (id: string) => branchTransfersApi.confirmPayment(id),
    onSuccess: refreshAll,
    onError: fail,
  });
  const rejectPay = useMutation({
    mutationFn: (id: string) => branchTransfersApi.rejectPayment(id),
    onSuccess: refreshAll,
    onError: fail,
  });
  const busy = receive.isPending || reject.isPending || cancel.isPending || confirmPay.isPending || rejectPay.isPending;

  if (!allowed) return null;

  const balanceRows = balances.data ?? [];
  const owedHere = balanceRows.filter((b) => b.creditorShopId === currentShopId).reduce((n, b) => n + Number(b.outstanding), 0);
  const owesHere = balanceRows.filter((b) => b.debtorShopId === currentShopId).reduce((n, b) => n + Number(b.outstanding), 0);

  const statusLabel = (s: BranchTransferStatus): string =>
    s === 'IN_TRANSIT'
      ? t.branchTransfers.statusInTransit
      : s === 'RECEIVED'
        ? t.branchTransfers.statusReceived
        : s === 'REJECTED'
          ? t.branchTransfers.statusRejected
          : t.branchTransfers.statusCancelled;

  const onReceive = (tr: BranchTransfer): void =>
    Alert.alert(
      t.branchTransfers.receiveConfirmTitle,
      t.branchTransfers.receiveConfirmBody(fmt(tr.totalValue), tr.fromShop.name),
      [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.branchTransfers.receiveAll, onPress: () => receive.mutate(tr.id) },
      ],
    );
  const onCancel = (tr: BranchTransfer): void =>
    Alert.alert(t.branchTransfers.cancelConfirmTitle, t.branchTransfers.cancelConfirmBody, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.branchTransfers.cancelTransfer, style: 'destructive', onPress: () => cancel.mutate(tr.id) },
    ]);
  const onConfirmPayment = (p: BranchPayment): void =>
    Alert.alert(t.branchTransfers.confirmPaymentTitle, t.branchTransfers.confirmPaymentBody(fcAmount(p), p.fromShop.name), [
      { text: t.branchTransfers.rejectPayment, style: 'destructive', onPress: () => rejectPay.mutate(p.id) },
      { text: t.common.cancel, style: 'cancel' },
      { text: t.branchTransfers.confirmPayment, onPress: () => confirmPay.mutate(p.id) },
    ]);

  const renderTransfer = (tr: BranchTransfer) => {
    const units = tr.items.reduce((n, i) => n + i.quantity, 0);
    const inTransit = tr.status === 'IN_TRANSIT';
    const canReceive = inTransit && tr.toShopId === currentShopId;
    const canCancel = inTransit && tr.fromShopId === currentShopId;
    return (
      <View key={tr.id} className="bg-card border border-border rounded-2xl p-4 mb-3">
        <View className="flex-row justify-between items-start mb-2">
          <View className="flex-1 mr-2">
            <Text className="text-text font-semibold">
              {tab === 'incoming' ? t.branchTransfers.fromBranch(tr.fromShop.name) : t.branchTransfers.toBranch(tr.toShop.name)}
            </Text>
            <Text className="text-muted text-xs mt-0.5">
              {formatDate(tr.sentAt)} · {t.branchTransfers.units(units)}
            </Text>
          </View>
          <Text className={`px-2 py-0.5 rounded-md text-xs overflow-hidden ${STATUS_CLASS[tr.status]}`}>
            {statusLabel(tr.status)}
          </Text>
        </View>
        {tr.items.map((i) => (
          <View key={i.id} className="flex-row justify-between py-1">
            <Text className="text-text text-sm flex-1">
              {i.productName}
              {i.variantLabel ? ` — ${i.variantLabel}` : ''}
            </Text>
            <Text className="text-text text-sm">× {i.quantity}</Text>
          </View>
        ))}
        <View className="flex-row justify-between mt-2 pt-2 border-t border-border">
          <Text className="text-muted text-xs">{t.branchTransfers.outstanding}</Text>
          <Text className="text-text font-semibold text-sm">{fmt(tr.totalValue)}</Text>
        </View>
        {tr.note ? <Text className="text-muted text-xs mt-2">“{tr.note}”</Text> : null}
        {tr.rejectionReason ? (
          <Text className="text-danger text-xs mt-2">
            {t.branchTransfers.reasonLabel}: {tr.rejectionReason}
          </Text>
        ) : null}
        {canReceive && (
          <View className="flex-row gap-2 mt-3">
            <View className="flex-1">
              <Button label={t.branchTransfers.reject} variant="outline" disabled={!online || busy} onPress={() => setRejecting(tr)} />
            </View>
            <View className="flex-1">
              <Button label={t.branchTransfers.receiveAll} disabled={!online || busy} onPress={() => onReceive(tr)} />
            </View>
          </View>
        )}
        {canCancel && (
          <View className="mt-3">
            <Button label={t.branchTransfers.cancelTransfer} variant="ghost" disabled={!online || busy} onPress={() => onCancel(tr)} />
          </View>
        )}
      </View>
    );
  };

  const rows = transfers.rows;

  return (
    <>
      <Stack.Screen options={{ title: t.branchTransfers.title }} />
      <View className="flex-1 bg-background">
        {!online && (
          <View className="bg-warning-light px-4 py-2">
            <Text className="text-warning text-xs">{t.branchTransfers.offline}</Text>
          </View>
        )}

        <View className="flex-row gap-3 px-4 pt-4">
          <View className="flex-1 bg-card border border-border rounded-xl p-3">
            <Text className="text-muted text-xs">{t.branchTransfers.owedToBranch}</Text>
            <Text className="text-success font-bold text-base mt-1">{fmt(owedHere)}</Text>
          </View>
          <View className="flex-1 bg-card border border-border rounded-xl p-3">
            <Text className="text-muted text-xs">{t.branchTransfers.branchOwes}</Text>
            <Text className={`font-bold text-base mt-1 ${owesHere > 0 ? 'text-danger' : 'text-text'}`}>{fmt(owesHere)}</Text>
          </View>
        </View>

        <View className="flex-row px-4 pt-3 gap-2 items-center">
          {(
            [
              ['incoming', t.branchTransfers.tabIncoming],
              ['outgoing', t.branchTransfers.tabOutgoing],
              ['balances', t.branchTransfers.tabBalances],
            ] as const
          ).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              className={`px-4 py-2 rounded-full ${tab === key ? 'bg-primary' : 'bg-surface'}`}
            >
              <Text className={tab === key ? 'text-white text-sm' : 'text-muted text-sm'}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <ScrollView
          className="flex-1 px-4 pt-4"
          refreshControl={
            // A user's pull only — background refreshes of cached data stay silent.
            <RefreshControl refreshing={transfers.isRefreshing} onRefresh={refreshAll} />
          }
          // Next page when the reader nears the bottom of the transfers list.
          scrollEventThrottle={200}
          onScroll={({ nativeEvent: e }) => {
            if (tab !== 'balances' && e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 400) {
              transfers.loadMore();
            }
          }}
        >
          {tab !== 'balances' &&
            (transfers.isInitialLoading ? (
              <ActivityIndicator className="mt-10" />
            ) : rows.length === 0 ? (
              <EmptyState emoji="🚚" title={tab === 'incoming' ? t.branchTransfers.noIncoming : t.branchTransfers.noOutgoing} />
            ) : (
              <>
                {rows.map(renderTransfer)}
                <ListFooter
                  isFetchingNextPage={transfers.isFetchingNextPage}
                  hasNextPage={transfers.hasNextPage}
                  offline={!online}
                  count={rows.length}
                />
              </>
            ))}

          {tab === 'balances' && (
            <>
              {balanceRows.length === 0 ? (
                <EmptyState emoji="⚖️" title={t.branchTransfers.noBalances} />
              ) : (
                balanceRows.map((b) => {
                  const weOwe = b.debtorShopId === currentShopId;
                  return (
                    <View key={b.id} className="bg-card border border-border rounded-2xl p-4 mb-3">
                      <Text className="text-text font-semibold">
                        {t.branchTransfers.owes(b.debtorShop.name, b.creditorShop.name)}
                      </Text>
                      <View className="flex-row justify-between mt-2">
                        <Text className="text-muted text-xs">{t.branchTransfers.outstanding}</Text>
                        <Text className={`font-bold text-sm ${weOwe ? 'text-danger' : 'text-success'}`}>{fmt(b.outstanding)}</Text>
                      </View>
                      {weOwe && Number(b.outstanding) > 0 && (
                        <View className="mt-3">
                          <Button label={t.branchTransfers.pay} disabled={!online} onPress={() => setPaying(b)} />
                        </View>
                      )}
                    </View>
                  );
                })
              )}

              <Text className="text-text font-bold text-sm mt-4 mb-2">{t.branchTransfers.payments}</Text>
              {(payments.data ?? []).map((p) => {
                const toConfirm = p.status === 'PENDING' && p.toShopId === currentShopId;
                return (
                  <Pressable
                    key={p.id}
                    disabled={!toConfirm || !online || busy}
                    onPress={() => onConfirmPayment(p)}
                    className="bg-card border border-border rounded-xl p-3 mb-2 flex-row justify-between items-center"
                  >
                    <View className="flex-1 mr-2">
                      <Text className="text-text text-sm">
                        {p.fromShop.name} → {p.toShop.name}
                      </Text>
                      <Text className="text-muted text-xs mt-0.5">{formatDate(p.createdAt)}</Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-text font-semibold text-sm">{fcAmount(p)}</Text>
                      <Text className={`text-xs mt-0.5 ${p.status === 'PENDING' ? 'text-warning' : p.status === 'CONFIRMED' ? 'text-success' : 'text-danger'}`}>
                        {toConfirm
                          ? `${t.branchTransfers.confirmPayment} ›`
                          : p.status === 'PENDING'
                            ? t.branchTransfers.payStatusPending
                            : p.status === 'CONFIRMED'
                              ? t.branchTransfers.payStatusConfirmed
                              : t.branchTransfers.payStatusRejected}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </>
          )}
          <View className="h-24" />
        </ScrollView>

        <View className="absolute bottom-6 left-4 right-4">
          <Button label={t.branchTransfers.send} disabled={!online} onPress={() => setSending(true)} />
        </View>
      </View>

      <SendBranchTransferModal visible={sending} isOwner={isOwner} onClose={() => setSending(false)} />
      <PayBranchModal balance={paying} isOwner={isOwner} onClose={() => setPaying(null)} />

      <Modal visible={!!rejecting} transparent animationType="fade" onRequestClose={() => setRejecting(null)}>
        <View className="flex-1 justify-center px-6" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View className="bg-card rounded-2xl p-5">
            <Text className="text-text font-bold text-base">{t.branchTransfers.rejectTitle}</Text>
            <Text className="text-muted text-xs mt-1 mb-3">{t.branchTransfers.rejectSub}</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              maxLength={255}
              autoFocus
              placeholder={t.branchTransfers.rejectPlaceholder}
              placeholderTextColor={brand.mutedSubtle}
              className="border rounded-xl px-4 py-3 text-text bg-background border-border mb-4"
            />
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button label={t.common.cancel} variant="ghost" onPress={() => setRejecting(null)} />
              </View>
              <View className="flex-1">
                <Button
                  label={t.branchTransfers.rejectSubmit}
                  variant="danger"
                  loading={reject.isPending}
                  disabled={!online || reason.trim().length === 0}
                  onPress={() => rejecting && reject.mutate({ id: rejecting.id, why: reason.trim() })}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
