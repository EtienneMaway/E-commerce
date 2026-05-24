import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { dashboardApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import { EmptyState } from '../../components/ui/EmptyState';
import { PersonaBanner } from '../../components/ui/PersonaBanner';

interface SupplierRow {
  supplierUserId: string;
  supplierUsername: string;
  outstandingBalance: string;
  totalCreditReceived: string;
  totalPaid: string;
}

function SupplierCard({ item }: { item: SupplierRow }) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  return (
    <Pressable
      onPress={() => router.push(`/supplier/${item.supplierUserId}`)}
      className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl p-4 mb-3"
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}
    >
      <View className="flex-row justify-between items-center mb-1.5">
        <Text className="text-text dark:text-slate-100 font-semibold text-base">@{item.supplierUsername}</Text>
        <Text className="text-danger font-bold text-base">{formatCurrency(item.outstandingBalance)}</Text>
      </View>
      <View className="flex-row justify-between">
        <Text className="text-muted dark:text-slate-500 text-sm">{t.network.totalReceived} {formatCurrency(item.totalCreditReceived)}</Text>
        <Text className="text-muted dark:text-slate-500 text-sm">{t.network.paid} {formatCurrency(item.totalPaid)}</Text>
      </View>
    </Pressable>
  );
}

export default function NetworkScreen() {
  const t = useT();
  const formatCurrency = useFormatCurrency();

  const { data: suppliers, isFetching, refetch } = useQuery({
    queryKey: QK.suppliers,
    queryFn: () => dashboardApi.suppliers(),
    staleTime: 30_000,
  });

  const supplierList = (suppliers as SupplierRow[] | undefined) ?? [];

  return (
    <View className="flex-1 bg-surface dark:bg-slate-900">
      <View className="px-4 pt-4"><PersonaBanner /></View>

      {/* Header label */}
      <View className="mx-4 mt-4 mb-3">
        <Text className="text-text dark:text-slate-100 font-bold text-lg">
          {t.network.suppliers(supplierList.length)}
        </Text>
      </View>

      {/* Summary row */}
      {supplierList.length > 0 && (
        <View className="mx-4 mb-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-2.5">
          <Text className="text-danger text-sm font-medium">
            {t.network.totalOwedToSuppliers}{' '}
            <Text className="font-bold">
              {formatCurrency(
                supplierList.reduce((s, x) => s + parseFloat(x.outstandingBalance), 0).toFixed(4),
              )}
            </Text>
          </Text>
        </View>
      )}

      <FlatList
        data={supplierList}
        keyExtractor={(item) => item.supplierUserId}
        renderItem={({ item }) => <SupplierCard item={item} />}
        contentContainerClassName="px-4 pb-8"
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#2563EB" />}
        ListHeaderComponent={isFetching && supplierList.length === 0 ? <ActivityIndicator className="mt-12" color="#2563EB" /> : null}
        ListEmptyComponent={
          !isFetching ? (
            <EmptyState emoji="🤝" title={t.network.noSuppliers} subtitle={t.network.noSuppliersSub} />
          ) : null
        }
      />
    </View>
  );
}
