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
import { useBrand } from '../../lib/theme';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import { EmptyState } from '../../components/ui/EmptyState';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { CARD_SHADOW } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
      className="bg-card border border-border rounded-3xl p-4 mb-3"
      style={({ pressed }) => ({ boxShadow: CARD_SHADOW, opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}
    >
      <View className="flex-row items-center mb-3">
        <View className="w-11 h-11 rounded-full bg-accent-light items-center justify-center mr-3">
          <Text className="font-display text-lg text-accent">{item.supplierUsername.slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text className="text-text font-semibold text-[15px] flex-1" numberOfLines={1}>@{item.supplierUsername}</Text>
        <Text className="font-mono-bold text-danger text-[15px]">{formatCurrency(item.outstandingBalance)}</Text>
      </View>
      {/* Progress of what has been paid back against what was received on credit. */}
      <View className="h-1.5 rounded-full bg-surface overflow-hidden mb-2">
        <View
          className="h-full rounded-full bg-primary"
          style={{
            width: `${Math.min(100, Math.max(0, (parseFloat(item.totalPaid) / Math.max(parseFloat(item.totalCreditReceived), 0.0001)) * 100))}%`,
          }}
        />
      </View>
      <View className="flex-row justify-between">
        <Text className="font-mono text-[11px] text-muted">{t.network.totalReceived} {formatCurrency(item.totalCreditReceived)}</Text>
        <Text className="font-mono text-[11px] text-muted">{t.network.paid} {formatCurrency(item.totalPaid)}</Text>
      </View>
    </Pressable>
  );
}

export default function NetworkScreen() {
  const insets = useSafeAreaInsets();
  const brand = useBrand();
  const t = useT();
  const formatCurrency = useFormatCurrency();

  const { data: suppliers, isFetching, refetch } = useQuery({
    queryKey: QK.suppliers,
    queryFn: () => dashboardApi.suppliers(),
    staleTime: 30_000,
  });

  const supplierList = (suppliers as SupplierRow[] | undefined) ?? [];

  return (
    <View className="flex-1 bg-background">
      <View className="px-5" style={{ paddingTop: insets.top + 16 }}>
        <ScreenHeader kicker={t.network.suppliers(supplierList.length)} title={t.tabs.network} />
        <PersonaBanner />
      </View>

      {/* What is owed across every supplier */}
      {supplierList.length > 0 && (
        <View className="mx-5 mb-4 bg-danger-light border border-danger/20 rounded-3xl px-4 py-3.5 flex-row items-center">
          <View className="w-9 h-9 rounded-2xl bg-danger/10 items-center justify-center mr-3">
            <Icon name="arrow-up-right" size={17} tone="danger" />
          </View>
          <Text className="text-danger text-sm flex-1">{t.network.totalOwedToSuppliers}</Text>
          <Text className="font-display text-xl text-danger">
            {formatCurrency(supplierList.reduce((s, x) => s + parseFloat(x.outstandingBalance), 0).toFixed(4))}
          </Text>
        </View>
      )}

      <FlatList
        data={supplierList}
        keyExtractor={(item) => item.supplierUserId}
        renderItem={({ item }) => <SupplierCard item={item} />}
        contentContainerClassName="px-5 pb-8"
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={brand.primary} />}
        ListHeaderComponent={isFetching && supplierList.length === 0 ? <ActivityIndicator className="mt-12" color={brand.primary} /> : null}
        ListEmptyComponent={
          !isFetching ? (
            <EmptyState emoji="🤝" title={t.network.noSuppliers} subtitle={t.network.noSuppliersSub} />
          ) : null
        }
      />
    </View>
  );
}
