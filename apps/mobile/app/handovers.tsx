import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { miniSettlementsApi, type MiniSettlementSummary } from '../lib/api';
import { QK } from '../lib/query-keys';
import { EmptyState } from '../components/ui/EmptyState';
import { formatDate, getErrorMessage } from '../lib/utils';
import { formatFcValue, useExchangeRate } from '../lib/currency';
import { useAuthStore } from '../store/auth.store';
import { useT } from '../lib/i18n';
import {
  printApprovedHandover,
  shareApprovedHandoverPdf,
  toApprovedHandoverSlip,
} from '../lib/handover-receipt';

/**
 * Mini-employee handover history. Lists every past handover (newest first) with
 * its status; approved ones can be re-printed / shared as the same "handover
 * receipt" record produced at approval time. Shares the outgoing query cache
 * with `usePendingHandover`, so opening this screen is usually instant.
 */
export default function HandoverHistoryScreen() {
  const t = useT();
  const qc = useQueryClient();
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
    try {
      await printApprovedHandover(toApprovedHandoverSlip(s, self, rate));
    } catch (err) {
      Alert.alert(t.printer.printFailed, getErrorMessage(err));
    } finally {
      setPrintingId(null);
    }
  };

  return (
    <View className="flex-1 bg-surface dark:bg-slate-900">
      <Stack.Screen options={{ title: t.miniEmployee.historyTitle, headerBackTitle: t.screens.back }} />

      {isLoading ? (
        <ActivityIndicator className="mt-10" />
      ) : handovers.length === 0 ? (
        <EmptyState emoji="🤲" title={t.miniEmployee.historyTitle} subtitle={t.miniEmployee.historyEmpty} />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-4 pt-3 pb-8"
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
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
      )}
    </View>
  );
}

interface CardProps {
  settlement: MiniSettlementSummary;
  rate: string;
  printing: boolean;
  onPrint: () => void;
  onShare: () => void;
}

function HandoverCard({ settlement: s, rate, printing, onPrint, onShare }: CardProps) {
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
        {s.status === 'APPROVED' && s.approvedAt ? (
          <Text className="text-emerald-600 dark:text-emerald-400 text-xs">
            {t.miniEmployee.statusApproved} · {formatDate(s.approvedAt)}
          </Text>
        ) : null}
      </View>

      {s.status === 'APPROVED' && (
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
      )}
    </View>
  );
}
