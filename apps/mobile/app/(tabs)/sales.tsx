import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { salesApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { formatDate } from '../../lib/utils';
import { useFormatCurrency } from '../../lib/currency';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useT } from '@/lib/i18n';

type View_ = 'history' | 'top';
type HistoryPeriod = '7d' | '30d' | '90d' | 'all';   // maps to SalesHistoryPeriod
type TopPeriod = 'today' | 'week' | 'month';           // maps to SalesPeriod
type RankBy = 'qty' | 'revenue' | 'profit';

interface SaleRow {
  id: string;
  productName: string;
  source: string;
  qtySold: number;
  unitCost: string;
  salePrice: string;
  profit: string;
  isLoss: boolean;
  date: string;
  supplierUsername?: string;
}

interface TopProductRow {
  productName: string;
  totalQtySold: string;
  totalRevenue: string;
  totalProfit: string;
}

function SaleCard({ item }: { item: SaleRow }) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const profitNum = parseFloat(item.profit);
  return (
    <View className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl p-4 mb-3">
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1 mr-2">
          <Text className="text-text dark:text-slate-100 font-semibold text-base" numberOfLines={1}>
            {item.productName.charAt(0).toUpperCase() + item.productName.slice(1)}
          </Text>
          <Text className="text-muted dark:text-slate-500 text-sm">{formatDate(item.date)}</Text>
        </View>
        <Badge
          label={item.isLoss ? t.sales.loss(formatCurrency(Math.abs(profitNum).toFixed(2))) : `+${formatCurrency(item.profit)}`}
          variant={item.isLoss ? 'loss' : 'profit'}
        />
      </View>
      <View className="flex-row justify-between">
        <Text className="text-muted dark:text-slate-500 text-sm">{t.sales.qty}: {item.qtySold}</Text>
        <Text className="text-muted dark:text-slate-500 text-sm">{t.sales.unitCost}: {formatCurrency(item.unitCost)}</Text>
        <Text className="text-muted dark:text-slate-500 text-sm">{t.sales.salePrice}: {formatCurrency(item.salePrice)}</Text>
      </View>
      {item.source === 'SUPPLIER' && item.supplierUsername && (
        <Text className="text-muted dark:text-slate-500 text-sm mt-1">{t.sales.via(item.supplierUsername)}</Text>
      )}
    </View>
  );
}

function TopProductCard({ item, rank, rankBy }: { item: TopProductRow; rank: number; rankBy: RankBy }) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  return (
    <View className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl p-4 mb-3">
      <View className="flex-row items-center mb-2">
        <View className="w-7 h-7 rounded-full bg-primary items-center justify-center mr-3">
          <Text className="text-white text-xs font-bold">#{rank}</Text>
        </View>
        <Text className="text-text dark:text-slate-100 font-semibold flex-1" numberOfLines={1}>
          {item.productName.charAt(0).toUpperCase() + item.productName.slice(1)}
        </Text>
      </View>
      <View className="flex-row justify-between">
        <View className="items-center">
          <Text className="text-muted dark:text-slate-500 text-sm">{t.sales.qtySold}</Text>
          <Text className={`text-base font-bold ${rankBy === 'qty' ? 'text-primary' : 'text-text dark:text-slate-100'}`}>{item.totalQtySold}</Text>
        </View>
        <View className="items-center">
          <Text className="text-muted dark:text-slate-500 text-sm">{t.sales.revenueLabel}</Text>
          <Text className={`text-base font-bold ${rankBy === 'revenue' ? 'text-primary' : 'text-text dark:text-slate-100'}`}>{formatCurrency(item.totalRevenue)}</Text>
        </View>
        <View className="items-center">
          <Text className="text-muted dark:text-slate-500 text-sm">{t.sales.profitLabel}</Text>
          <Text className={`text-base font-bold ${rankBy === 'profit' ? 'text-primary' : 'text-text dark:text-slate-100'}`}>{formatCurrency(item.totalProfit)}</Text>
        </View>
      </View>
    </View>
  );
}

export default function SalesScreen() {
  const t = useT();
  const [view, setView] = useState<View_>('history');
  const formatCurrency = useFormatCurrency();
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>('30d');
  const [topPeriod, setTopPeriod] = useState<TopPeriod>('month');
  const [rankBy, setRankBy] = useState<RankBy>('profit');

  const historyPeriodOptions: { label: string; value: HistoryPeriod }[] = [
    { label: t.sales.period7d, value: '7d' },
    { label: t.sales.period30d, value: '30d' },
    { label: t.sales.period90d, value: '90d' },
    { label: t.sales.periodAll, value: 'all' },
  ];

  const topPeriodOptions: { label: string; value: TopPeriod }[] = [
    { label: t.sales.periodToday, value: 'today' },
    { label: t.sales.periodWeek, value: 'week' },
    { label: t.sales.periodMonth, value: 'month' },
  ];

  const rankLabels: Record<RankBy, string> = {
    qty: t.sales.rankQty,
    revenue: t.sales.rankRevenue,
    profit: t.sales.rankProfit,
  };

  const { data: salesData, isFetching: salesLoading, refetch: refetchSales } = useQuery({
    queryKey: QK.salesHistory({ period: historyPeriod }),
    queryFn: () => salesApi.list({ period: historyPeriod }),
    staleTime: 30_000,
    enabled: view === 'history',
  });

  const { data: topData, isFetching: topLoading, refetch: refetchTop } = useQuery({
    queryKey: QK.topProducts({ rankBy, period: topPeriod }),
    queryFn: () => salesApi.topProducts({ rankBy, period: topPeriod }),
    staleTime: 30_000,
    enabled: view === 'top',
  });

  const sales = (salesData as { data: SaleRow[]; total: number } | undefined)?.data ?? [];
  const topProducts = (topData as TopProductRow[] | undefined) ?? [];

  const isFetching = view === 'history' ? salesLoading : topLoading;
  const refetch = view === 'history' ? refetchSales : refetchTop;

  const totalProfit = sales.reduce((s, x) => s + parseFloat(x.profit), 0);
  const totalRevenue = sales.reduce((s, x) => s + parseFloat(x.salePrice) * Number(x.qtySold), 0);

  return (
    <View className="flex-1 bg-surface dark:bg-slate-900">
      {/* View toggle */}
      <View className="flex-row mx-4 mt-4 mb-3 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
        <TouchableOpacity
          onPress={() => setView('history')}
          className={`flex-1 py-2 rounded-lg items-center ${view === 'history' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''}`}
        >
          <Text className={`text-sm font-semibold ${view === 'history' ? 'text-text dark:text-slate-100' : 'text-muted dark:text-slate-500'}`}>{t.sales.history}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setView('top')}
          className={`flex-1 py-2 rounded-lg items-center ${view === 'top' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''}`}
        >
          <Text className={`text-sm font-semibold ${view === 'top' ? 'text-text dark:text-slate-100' : 'text-muted dark:text-slate-500'}`}>{t.sales.topProducts}</Text>
        </TouchableOpacity>
      </View>

      {/* Period filter — options differ by view */}
      <View className="flex-row px-4 mb-3 gap-2">
        {view === 'history'
          ? historyPeriodOptions.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setHistoryPeriod(opt.value)}
                className={`px-3.5 py-2 rounded-full border ${historyPeriod === opt.value ? 'bg-primary border-primary' : 'bg-card dark:bg-slate-800 border-border dark:border-slate-700'}`}
                style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}
              >
                <Text className={`text-sm font-medium ${historyPeriod === opt.value ? 'text-white' : 'text-text dark:text-slate-100'}`}>{opt.label}</Text>
              </Pressable>
            ))
          : topPeriodOptions.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setTopPeriod(opt.value)}
                className={`px-3.5 py-2 rounded-full border ${topPeriod === opt.value ? 'bg-primary border-primary' : 'bg-card dark:bg-slate-800 border-border dark:border-slate-700'}`}
                style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}
              >
                <Text className={`text-sm font-medium ${topPeriod === opt.value ? 'text-white' : 'text-text dark:text-slate-100'}`}>{opt.label}</Text>
              </Pressable>
            ))}
      </View>

      {/* RankBy (Top Products only) */}
      {view === 'top' && (
        <View className="flex-row px-4 mb-3 gap-2">
          {(['qty', 'revenue', 'profit'] as RankBy[]).map((r) => (
            <Pressable
              key={r}
              onPress={() => setRankBy(r)}
              className={`px-3.5 py-2 rounded-full border ${rankBy === r ? 'bg-slate-700 dark:bg-slate-500 border-slate-700 dark:border-slate-500' : 'bg-card dark:bg-slate-800 border-border dark:border-slate-700'}`}
              style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}
            >
              <Text className={`text-sm font-medium capitalize ${rankBy === r ? 'text-white' : 'text-text dark:text-slate-100'}`}>{rankLabels[r]}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* History summary */}
      {view === 'history' && sales.length > 0 && (
        <View className="mx-4 mb-3 flex-row gap-3">
          <View className="flex-1 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 rounded-xl px-3 py-2.5">
            <Text className="text-success text-sm">{t.sales.profitLabel}</Text>
            <Text className="text-success font-bold text-base">{formatCurrency(totalProfit.toFixed(2))}</Text>
          </View>
          <View className="flex-1 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-xl px-3 py-2.5">
            <Text className="text-primary text-sm">{t.sales.revenueLabel}</Text>
            <Text className="text-primary font-bold text-base">{formatCurrency(totalRevenue.toFixed(2))}</Text>
          </View>
        </View>
      )}

      {/* Content */}
      {view === 'history' ? (
        <FlatList
          data={sales}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SaleCard item={item} />}
          contentContainerClassName="px-4 pb-8"
          refreshControl={<RefreshControl refreshing={salesLoading} onRefresh={refetch} tintColor="#2563EB" />}
          ListHeaderComponent={salesLoading && sales.length === 0 ? <ActivityIndicator className="mt-12" color="#2563EB" /> : null}
          ListEmptyComponent={
            !salesLoading ? (
              <EmptyState emoji="💰" title={t.sales.noSales} subtitle={t.sales.noSalesSub} />
            ) : null
          }
        />
      ) : (
        <FlatList
          data={topProducts}
          keyExtractor={(item) => item.productName}
          renderItem={({ item, index }) => <TopProductCard item={item} rank={index + 1} rankBy={rankBy} />}
          contentContainerClassName="px-4 pb-8"
          refreshControl={<RefreshControl refreshing={topLoading} onRefresh={refetch} tintColor="#2563EB" />}
          ListHeaderComponent={topLoading && topProducts.length === 0 ? <ActivityIndicator className="mt-12" color="#2563EB" /> : null}
          ListEmptyComponent={
            !topLoading ? (
              <EmptyState emoji="🏆" title={t.sales.noData} subtitle={t.sales.noDataSub} />
            ) : null
          }
        />
      )}
    </View>
  );
}
