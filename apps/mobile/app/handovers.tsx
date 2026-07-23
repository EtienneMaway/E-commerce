import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  miniSettlementsApi,
  consignmentsApi,
  type MiniSettlementSummary,
  type ConsignmentSummary,
} from '../lib/api';
import { QK } from '../lib/query-keys';
import { EmptyState } from '../components/ui/EmptyState';
import { formatDate, getErrorMessage } from '../lib/utils';
import { formatFcValue, useExchangeRate } from '../lib/currency';
import { useAuthStore } from '../store/auth.store';
import { usePrinterStore } from '../store/printer.store';
import { useT } from '../lib/i18n';
import {
  printApprovedHandover,
  printApprovedHandoverViaSystem,
  shareApprovedHandoverPdf,
  toApprovedHandoverSlip,
  printReceivedGoods,
  printReceivedGoodsViaSystem,
  shareReceivedGoodsPdf,
  toReceivedGoodsSlip,
} from '../lib/handover-receipt';

type Tab = 'handovers' | 'received';

/**
 * Mini-employee history, two tabs:
 *  - Handovers: every past handover with status; approved ones reprint the
 *    "handover receipt" (cash + itemised sales + returns).
 *  - Received: consignments the employer assigned; accepted ones reprint the
 *    "goods received" slip.
 * Both share the query caches used elsewhere, so switching tabs is instant.
 */
export default function HistoryScreen() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('handovers');

  return (
    <View className="flex-1 bg-surface dark:bg-slate-900">
      <Stack.Screen options={{ title: t.miniEmployee.historyTitle, headerBackTitle: t.screens.back }} />

      {/* Tabs */}
      <View className="flex-row px-4 pt-3 gap-2">
        <TabButton
          active={tab === 'handovers'}
          onPress={() => setTab('handovers')}
          label={t.miniEmployee.tabHandovers}
        />
        <TabButton
          active={tab === 'received'}
          onPress={() => setTab('received')}
          label={t.miniEmployee.tabReceived}
        />
      </View>

      {tab === 'handovers' ? <HandoversTab /> : <ReceivedTab />}
    </View>
  );
}

function HandoversTab() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const rate = useExchangeRate();
  const [printingId, setPrintingId] = useState<string | null>(null);

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: QK.miniSettlementsOutgoing,
    queryFn: miniSettlementsApi.outgoing,
    staleTime: 15_000,
  });
  const handovers = (data as MiniSettlementSummary[] | undefined) ?? [];
  const self = { name: user?.name ?? undefined, handle: user?.username };

  const handlePrint = async (s: MiniSettlementSummary) => {
    setPrintingId(s.id);
    const slip = toApprovedHandoverSlip(s, self, rate);
    try {
      await printApprovedHandover(slip);
    } catch (err) {
      if (usePrinterStore.getState().printer) {
        Alert.alert(t.printer.printFailed, getErrorMessage(err), [
          { text: t.common.cancel, style: 'cancel' },
          { text: t.printer.fallbackUsed, onPress: () => void printApprovedHandoverViaSystem(slip) },
        ]);
      } else {
        Alert.alert(t.printer.printFailed, getErrorMessage(err));
      }
    } finally {
      setPrintingId(null);
    }
  };

  if (isLoading) return <ActivityIndicator className="mt-10" />;
  if (handovers.length === 0)
    return <EmptyState emoji="🤲" title={t.miniEmployee.historyTitle} subtitle={t.miniEmployee.historyEmpty} />;

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-4 pt-3 pb-8"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
    >
      {handovers.map((s) => (
        <HandoverCard
          key={s.id}
          settlement={s}
          rate={rate}
          printing={printingId === s.id}
          onPrint={() => void handlePrint(s)}
          onShare={() => void shareApprovedHandoverPdf(toApprovedHandoverSlip(s, self, rate))}
        />
      ))}
    </ScrollView>
  );
}

function ReceivedTab() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const rate = useExchangeRate();
  const [printingId, setPrintingId] = useState<string | null>(null);

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: QK.consignmentsIncoming,
    queryFn: consignmentsApi.incoming,
    staleTime: 15_000,
  });
  // Received = accepted consignments; also surface rejected/cancelled for the
  // record. Pending ones live in the Receive inbox, not history.
  const received = ((data as ConsignmentSummary[] | undefined) ?? []).filter(
    (c) => c.status !== 'PENDING',
  );
  const self = { name: user?.name ?? undefined, handle: user?.username };

  const handlePrint = async (c: ConsignmentSummary) => {
    setPrintingId(c.id);
    const slip = toReceivedGoodsSlip(c, self, rate);
    try {
      await printReceivedGoods(slip);
    } catch (err) {
      if (usePrinterStore.getState().printer) {
        Alert.alert(t.printer.printFailed, getErrorMessage(err), [
          { text: t.common.cancel, style: 'cancel' },
          { text: t.printer.fallbackUsed, onPress: () => void printReceivedGoodsViaSystem(slip) },
        ]);
      } else {
        Alert.alert(t.printer.printFailed, getErrorMessage(err));
      }
    } finally {
      setPrintingId(null);
    }
  };

  if (isLoading) return <ActivityIndicator className="mt-10" />;
  if (received.length === 0)
    return <EmptyState emoji="📥" title={t.miniEmployee.tabReceived} subtitle={t.miniEmployee.receivedHistoryEmpty} />;

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-4 pt-3 pb-8"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
    >
      {received.map((c) => (
        <ReceivedCard
          key={c.id}
          consignment={c}
          rate={rate}
          printing={printingId === c.id}
          onPrint={() => void handlePrint(c)}
          onShare={() => void shareReceivedGoodsPdf(toReceivedGoodsSlip(c, self, rate))}
        />
      ))}
    </ScrollView>
  );
}

/* ── Tabs + cards ────────────────────────────────────────────────────────────── */

// Same theme-aware styling as the salary screen's tabs, so dark/light toggles
// look identical across the app.
function TabButton({ active, onPress, label }: { active: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 py-2.5 rounded-xl items-center ${
        active ? 'bg-primary' : 'bg-card dark:bg-slate-800 border border-border dark:border-slate-700'
      }`}
    >
      <Text className={`font-semibold text-sm ${active ? 'text-white' : 'text-text dark:text-slate-200'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function HandoverCard({
  settlement: s,
  rate,
  printing,
  onPrint,
  onShare,
}: {
  settlement: MiniSettlementSummary;
  rate: string;
  printing: boolean;
  onPrint: () => void;
  onShare: () => void;
}) {
  const t = useT();
  const cashFc = s.cashAmountFc
    ? parseFloat(s.cashAmountFc) || 0
    : (parseFloat(s.cashAmount) || 0) * (parseFloat(rate) || 1);
  const returnsCount = s.items.reduce((n, it) => n + it.quantity, 0);
  const badge =
    s.status === 'APPROVED'
      ? { label: t.miniEmployee.statusApproved, cls: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300' }
      : s.status === 'REJECTED'
        ? { label: t.miniEmployee.statusRejected, cls: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300' }
        : { label: t.miniEmployee.statusPending, cls: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' };

  return (
    <View className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl px-4 py-4 mb-3">
      <View className="flex-row justify-between items-start">
        <View className="flex-1">
          <Text className="text-text dark:text-slate-100 font-semibold">
            {t.miniEmployee.handoverTotalCash}: {formatFcValue(cashFc)}
          </Text>
          <Text className="text-muted dark:text-slate-500 text-xs mt-0.5">{formatDate(s.createdAt)}</Text>
        </View>
        <View className={`rounded-full px-2.5 py-1 ${badge.cls}`}>
          <Text className={`text-xs font-semibold ${badge.cls}`}>{badge.label}</Text>
        </View>
      </View>

      <View className="mt-2 gap-0.5">
        {s.owner?.username ? (
          <Text className="text-muted dark:text-slate-400 text-xs">
            {t.miniEmployee.handoverSlipTo} @{s.owner.username}
          </Text>
        ) : null}
        <Text className="text-muted dark:text-slate-400 text-xs">
          {t.miniEmployee.historyReturns(returnsCount)}
        </Text>
      </View>

      {s.status === 'APPROVED' && (
        <PrintRow printing={printing} onPrint={onPrint} onShare={onShare} />
      )}
    </View>
  );
}

function ReceivedCard({
  consignment: c,
  rate,
  printing,
  onPrint,
  onShare,
}: {
  consignment: ConsignmentSummary;
  rate: string;
  printing: boolean;
  onPrint: () => void;
  onShare: () => void;
}) {
  const t = useT();
  const r = parseFloat(rate) || 1;
  const owedFc = c.items.reduce((s, it) => s + (parseFloat(it.agreedUnitPrice) || 0) * it.quantity * r, 0);
  const itemsCount = c.items.reduce((n, it) => n + it.quantity, 0);
  const badge =
    c.status === 'ACCEPTED'
      ? { label: t.miniEmployee.statusReceived, cls: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300' }
      : c.status === 'REJECTED'
        ? { label: t.miniEmployee.statusRejected, cls: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300' }
        : { label: t.miniEmployee.statusCancelled, cls: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300' };

  return (
    <View className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl px-4 py-4 mb-3">
      <View className="flex-row justify-between items-start">
        <View className="flex-1">
          <Text className="text-text dark:text-slate-100 font-semibold">
            {t.miniEmployee.receiveFrom} @{c.supplier?.username ?? '—'}
          </Text>
          <Text className="text-muted dark:text-slate-500 text-xs mt-0.5">{formatDate(c.createdAt)}</Text>
        </View>
        <View className={`rounded-full px-2.5 py-1 ${badge.cls}`}>
          <Text className={`text-xs font-semibold ${badge.cls}`}>{badge.label}</Text>
        </View>
      </View>

      <View className="mt-2 gap-0.5">
        <Text className="text-muted dark:text-slate-400 text-xs">
          {t.miniEmployee.receivedItemsCount(itemsCount)} · {t.miniEmployee.receivedTotalOwed}: {formatFcValue(owedFc)}
        </Text>
        {c.note ? (
          <Text className="text-muted dark:text-slate-500 text-xs italic">{c.note}</Text>
        ) : null}
      </View>

      {c.status === 'ACCEPTED' && (
        <PrintRow printing={printing} onPrint={onPrint} onShare={onShare} />
      )}
    </View>
  );
}

function PrintRow({
  printing,
  onPrint,
  onShare,
}: {
  printing: boolean;
  onPrint: () => void;
  onShare: () => void;
}) {
  const t = useT();
  return (
    <View className="flex-row gap-2 mt-3">
      <TouchableOpacity
        onPress={onPrint}
        disabled={printing}
        className="flex-1 bg-emerald-600 rounded-xl py-2.5 flex-row items-center justify-center gap-2"
        style={{ opacity: printing ? 0.6 : 1 }}
      >
        {printing && <ActivityIndicator size="small" color="#fff" />}
        <Text className="text-white font-semibold text-sm">{t.miniEmployee.printBtn}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onShare}
        className="px-4 rounded-xl py-2.5 items-center justify-center border border-emerald-600"
      >
        <Text className="text-emerald-700 dark:text-emerald-300 font-semibold text-sm">
          {t.miniEmployee.shareBtn}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
