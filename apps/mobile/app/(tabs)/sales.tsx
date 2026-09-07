import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { salesApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useBrand } from '../../lib/theme';
import { formatDate } from '../../lib/utils';
import { useFormatCurrency } from '../../lib/currency';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { PersonaBanner } from '../../components/ui/PersonaBanner';
import { ReprintReceiptModal } from '../../components/forms/ReprintReceiptModal';
import { RejectSaleModal, type RejectTarget } from '../../components/forms/RejectSaleModal';
import { useOfflineStore } from '../../store/offline.store';
import { useT } from '@/lib/i18n';

type View_ = 'history' | 'top' | 'rejected';
type HistoryPeriod = '7d' | '30d' | '90d' | 'all';   // maps to SalesHistoryPeriod
type TopPeriod = 'today' | 'week' | 'month';           // maps to SalesPeriod
type RankBy = 'qty' | 'revenue' | 'profit';

interface SaleRow {
  id: string;
  productName: string;
  /** Size sold, for a sized (carton-with-sizes) product. Null for simple ones. */
  variantLabel?: string | null;
  source: string;
  qtySold: number;
  unitCost: string;
  salePrice: string;
  profit: string;
  isLoss: boolean;
  date: string;
  supplierUsername?: string;
  clientName?: string | null;
  clientPhone?: string | null;
  receiptId?: string | null;
  actor?: { id: string; username: string } | null;
  /** Set once the sale has been rejected as a mistake — it stays in history. */
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  rejectedBy?: { id: string; username: string } | null;
}

interface TopProductRow {
  productName: string;
  totalQtySold: string;
  totalRevenue: string;
  totalProfit: string;
}

function SaleCard({
  item,
  onReprint,
  onReject,
}: {
  item: SaleRow;
  onReprint: (row: SaleRow) => void;
  /** Omitted on the rejected list — a rejected sale cannot be rejected again. */
  onReject?: (row: SaleRow) => void;
}) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const profitNum = parseFloat(item.profit);
  const isRejected = !!item.rejectedAt;
  return (
    <Pressable
      onPress={() => onReprint(item)}
      onLongPress={onReject && !isRejected ? () => onReject(item) : undefined}
      className={`bg-card border rounded-2xl p-4 mb-3 ${isRejected ? 'border-danger' : 'border-border'}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
    >
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1 mr-2">
          <Text className="text-text font-semibold text-base" numberOfLines={1}>
            {item.productName.charAt(0).toUpperCase() + item.productName.slice(1)}
            {item.variantLabel ? ` · ${item.variantLabel}` : ''}
          </Text>
          <Text className="text-muted text-sm">{formatDate(item.date)}</Text>
        </View>
        <Badge
          label={item.isLoss ? t.sales.loss(formatCurrency(Math.abs(profitNum).toFixed(4))) : `+${formatCurrency(item.profit)}`}
          variant={item.isLoss ? 'loss' : 'profit'}
        />
      </View>
      <View className="flex-row justify-between">
        <Text className="text-muted text-sm">{t.sales.qty} {item.qtySold}</Text>
        <Text className="text-muted text-sm">{t.sales.unitCost} {formatCurrency(item.unitCost)}</Text>
        <Text className="text-muted text-sm">{t.sales.salePrice} {formatCurrency(item.salePrice)}</Text>
      </View>
      {item.source === 'SUPPLIER' && item.supplierUsername && (
        <Text className="text-muted text-sm mt-1">{t.sales.via(item.supplierUsername)}</Text>
      )}
      {(item.clientName || item.clientPhone) && (
        <View className="mt-2 pt-2 border-t border-border flex-row items-center gap-2 flex-wrap">
          <Text className="text-muted text-xs">👤 {t.sales.clientLabel}:</Text>
          {item.clientName && (
            <Text className="text-text text-xs font-medium">{item.clientName}</Text>
          )}
          {item.clientPhone && (
            <Text className="text-muted text-xs">{item.clientPhone}</Text>
          )}
        </View>
      )}
      {isRejected ? (
        <View className="mt-2 pt-2 border-t border-border">
          <View className="flex-row items-center flex-wrap gap-x-2">
            <Text className="text-danger text-[11px] font-bold">⛔ {t.sales.rejectedBadge}</Text>
            <Text className="text-muted text-xs">
              {t.sales.rejectedOn(formatDate(item.rejectedAt as string))}
              {item.rejectedBy ? ` ${t.sales.rejectedBy(`@${item.rejectedBy.username}`)}` : ''}
            </Text>
          </View>
          {item.rejectionReason ? (
            <Text className="text-muted text-xs mt-0.5 italic">“{item.rejectionReason}”</Text>
          ) : null}
        </View>
      ) : (
        <Text className="text-primary text-xs mt-2 italic">
          {onReject ? t.sales.tapToReprintHold : t.sales.tapToReprint}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * A sale still sitting in the offline queue. Shown at the top of the history so
 * a mistake made offline can be corrected before it ever reaches the server —
 * it is the only place these rows are visible one by one.
 */
function PendingSaleCard({
  productName,
  qtySold,
  onReject,
}: {
  productName: string;
  qtySold: number;
  onReject: () => void;
}) {
  const t = useT();
  return (
    <Pressable
      onLongPress={onReject}
      className="bg-card border border-amber-300 dark:border-amber-800 rounded-2xl p-4 mb-3"
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
    >
      <View className="flex-row justify-between items-start">
        <Text className="text-text font-semibold text-base flex-1 mr-2" numberOfLines={1}>
          {productName.charAt(0).toUpperCase() + productName.slice(1)}
        </Text>
        <Text className="text-amber-700 dark:text-amber-300 text-[11px] font-bold">
          ⏳ {t.sales.pendingSyncBadge}
        </Text>
      </View>
      <Text className="text-muted text-sm mt-1">{t.sales.qty} {qtySold}</Text>
      <Text className="text-primary text-xs mt-2 italic">{t.sales.tapToReprintHold}</Text>
    </Pressable>
  );
}

function TopProductCard({ item, rank, rankBy }: { item: TopProductRow; rank: number; rankBy: RankBy }) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  return (
    <View className="bg-card border border-border rounded-2xl p-4 mb-3">
      <View className="flex-row items-center mb-2">
        <View className="w-7 h-7 rounded-full bg-primary items-center justify-center mr-3">
          <Text className="text-white text-xs font-bold">#{rank}</Text>
        </View>
        <Text className="text-text font-semibold flex-1" numberOfLines={1}>
          {item.productName.charAt(0).toUpperCase() + item.productName.slice(1)}
        </Text>
      </View>
      <View className="flex-row justify-between">
        <View className="items-center">
          <Text className="text-muted text-sm">{t.sales.qtySold}</Text>
          <Text className={`text-base font-bold ${rankBy === 'qty' ? 'text-primary' : 'text-text'}`}>{item.totalQtySold}</Text>
        </View>
        <View className="items-center">
          <Text className="text-muted text-sm">{t.sales.revenueLabel}</Text>
          <Text className={`text-base font-bold ${rankBy === 'revenue' ? 'text-primary' : 'text-text'}`}>{formatCurrency(item.totalRevenue)}</Text>
        </View>
        <View className="items-center">
          <Text className="text-muted text-sm">{t.sales.profitLabel}</Text>
          <Text className={`text-base font-bold ${rankBy === 'profit' ? 'text-primary' : 'text-text'}`}>{formatCurrency(item.totalProfit)}</Text>
        </View>
      </View>
    </View>
  );
}

export default function SalesScreen() {
  const brand = useBrand();
  const t = useT();
  const [view, setView] = useState<View_>('history');
  const formatCurrency = useFormatCurrency();
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>('30d');
  const [topPeriod, setTopPeriod] = useState<TopPeriod>('month');
  const [rankBy, setRankBy] = useState<RankBy>('profit');
  const [clientQuery, setClientQuery] = useState('');
  const [reprintSource, setReprintSource] = useState<SaleRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  // Sales made offline that have not synced yet — listed above the history so
  // they can be corrected before they reach the server. Ones already rejected
  // offline drop out of the list (they are on their way to the rejected list).
  const pendingSales = useOfflineStore((st) => st.pendingSales).filter(
    (p) => !p.rejectedOffline,
  );

  const rejectServerSale = (row: SaleRow): void =>
    setRejectTarget({
      kind: 'server',
      id: row.id,
      productName: row.productName,
      variantLabel: row.variantLabel,
      qtySold: row.qtySold,
    });

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

  // Empty string → omit the query param (no server-side filter); otherwise
  // pass it through. React Query keeps a separate cache per (period, query)
  // pair; `placeholderData: keepPreviousData` below is what actually prevents
  // the flash while the new pair loads.
  const trimmedQuery = clientQuery.trim();
  const { data: salesData, isFetching: salesLoading, refetch: refetchSales } = useQuery({
    queryKey: QK.salesHistory({ period: historyPeriod, clientQuery: trimmedQuery }),
    queryFn: () =>
      salesApi.list({
        period: historyPeriod,
        ...(trimmedQuery ? { clientQuery: trimmedQuery } : {}),
      }),
    staleTime: 30_000,
    enabled: view === 'history',
    // Keep the previous period's rows on screen while the new period loads.
    // Without this every filter tap blanked the list to a spinner — on a 3s
    // network that reads as the app losing the data.
    placeholderData: keepPreviousData,
  });

  // Rejected sales — the same endpoint, asked for the other side of the line.
  const { data: rejectedData, isFetching: rejectedLoading, refetch: refetchRejected } = useQuery({
    queryKey: QK.salesHistory({ period: historyPeriod, status: 'rejected' }),
    queryFn: () => salesApi.list({ period: historyPeriod, status: 'rejected' }),
    staleTime: 30_000,
    enabled: view === 'rejected',
    placeholderData: keepPreviousData,
  });

  const { data: topData, isFetching: topLoading, refetch: refetchTop } = useQuery({
    queryKey: QK.topProducts({ rankBy, period: topPeriod }),
    queryFn: () => salesApi.topProducts({ rankBy, period: topPeriod }),
    staleTime: 30_000,
    enabled: view === 'top',
    placeholderData: keepPreviousData,
  });

  const sales = (salesData as { data: SaleRow[]; total: number } | undefined)?.data ?? [];
  const rejectedSales =
    (rejectedData as { data: SaleRow[]; total: number } | undefined)?.data ?? [];
  const topProducts = (topData as TopProductRow[] | undefined) ?? [];

  const refetch =
    view === 'history' ? refetchSales : view === 'rejected' ? refetchRejected : refetchTop;

  const totalProfit = sales.reduce((s, x) => s + parseFloat(x.profit), 0);
  const totalRevenue = sales.reduce((s, x) => s + parseFloat(x.salePrice) * Number(x.qtySold), 0);

  return (
    <View className="flex-1 bg-background">
      <View className="px-4 pt-4"><PersonaBanner /></View>
      {/* View toggle */}
      <View className="flex-row mx-4 mt-4 mb-3 bg-background rounded-xl p-1">
        <TouchableOpacity
          onPress={() => setView('history')}
          className={`flex-1 py-2 rounded-lg items-center ${view === 'history' ? 'bg-card shadow-sm' : ''}`}
        >
          <Text className={`text-sm font-semibold ${view === 'history' ? 'text-text' : 'text-muted'}`}>{t.sales.history}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setView('top')}
          className={`flex-1 py-2 rounded-lg items-center ${view === 'top' ? 'bg-card shadow-sm' : ''}`}
        >
          <Text className={`text-sm font-semibold ${view === 'top' ? 'text-text' : 'text-muted'}`}>{t.sales.topProducts}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setView('rejected')}
          className={`flex-1 py-2 rounded-lg items-center ${view === 'rejected' ? 'bg-card shadow-sm' : ''}`}
        >
          <Text className={`text-sm font-semibold ${view === 'rejected' ? 'text-text' : 'text-muted'}`}>{t.sales.rejectedTab}</Text>
        </TouchableOpacity>
      </View>

      {/* Period filter — options differ by view */}
      <View className="flex-row px-4 mb-3 gap-2">
        {view !== 'top'
          ? historyPeriodOptions.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setHistoryPeriod(opt.value)}
                className={`px-3.5 py-2 rounded-full border ${historyPeriod === opt.value ? 'bg-primary border-primary' : 'bg-card border-border'}`}
                style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}
              >
                <Text className={`text-sm font-medium ${historyPeriod === opt.value ? 'text-white' : 'text-text'}`}>{opt.label}</Text>
              </Pressable>
            ))
          : topPeriodOptions.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setTopPeriod(opt.value)}
                className={`px-3.5 py-2 rounded-full border ${topPeriod === opt.value ? 'bg-primary border-primary' : 'bg-card border-border'}`}
                style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}
              >
                <Text className={`text-sm font-medium ${topPeriod === opt.value ? 'text-white' : 'text-text'}`}>{opt.label}</Text>
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
              className={`px-3.5 py-2 rounded-full border ${rankBy === r ? 'bg-primary border-primary' : 'bg-card border-border'}`}
              style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}
            >
              <Text className={`text-sm font-medium capitalize ${rankBy === r ? 'text-white' : 'text-text'}`}>{rankLabels[r]}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Client search — only on history view */}
      {view === 'history' && (
        <View className="px-4 mb-3">
          <TextInput
            value={clientQuery}
            onChangeText={setClientQuery}
            placeholder={t.sales.searchClientPlaceholder}
            placeholderTextColor={brand.mutedSubtle}
            className="bg-card border border-border rounded-xl px-4 py-2.5 text-text text-sm"
          />
        </View>
      )}

      {/* History summary */}
      {view === 'history' && sales.length > 0 && (
        <View className="mx-4 mb-3 flex-row gap-3">
          <View className="flex-1 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 rounded-xl px-3 py-2.5">
            <Text className="text-success text-sm">{t.sales.profitLabel}</Text>
            <Text className="text-success font-bold text-base">{formatCurrency(totalProfit.toFixed(4))}</Text>
          </View>
          <View className="flex-1 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-xl px-3 py-2.5">
            <Text className="text-primary text-sm">{t.sales.revenueLabel}</Text>
            <Text className="text-primary font-bold text-base">{formatCurrency(totalRevenue.toFixed(4))}</Text>
          </View>
        </View>
      )}

      {/* Content */}
      {view === 'history' ? (
        <FlatList
          data={sales}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SaleCard item={item} onReprint={setReprintSource} onReject={rejectServerSale} />
          )}
          contentContainerClassName="px-4 pb-8"
          refreshControl={<RefreshControl refreshing={salesLoading} onRefresh={refetch} tintColor={brand.primary} />}
          ListHeaderComponent={
            <>
              {pendingSales.length > 0 && (
                <View className="mb-1">
                  <Text className="text-muted text-xs font-semibold mb-2 uppercase">
                    {t.sales.pendingSection}
                  </Text>
                  {pendingSales.map((p) => (
                    <PendingSaleCard
                      key={p.id}
                      productName={p.productName}
                      qtySold={p.qtySold}
                      onReject={() =>
                        setRejectTarget({
                          kind: 'pending',
                          id: p.id,
                          productName: p.productName,
                          qtySold: p.qtySold,
                        })
                      }
                    />
                  ))}
                </View>
              )}
              {salesLoading && sales.length === 0 ? (
                <ActivityIndicator className="mt-12" color={brand.primary} />
              ) : null}
            </>
          }
          ListEmptyComponent={
            !salesLoading && pendingSales.length === 0 ? (
              <EmptyState emoji="💰" title={t.sales.noSales} subtitle={t.sales.noSalesSub} />
            ) : null
          }
        />
      ) : view === 'rejected' ? (
        <FlatList
          data={rejectedSales}
          keyExtractor={(item) => item.id}
          // No onReject: these are already rejected, and the stock is back.
          renderItem={({ item }) => <SaleCard item={item} onReprint={setReprintSource} />}
          contentContainerClassName="px-4 pb-8"
          refreshControl={<RefreshControl refreshing={rejectedLoading} onRefresh={refetch} tintColor={brand.primary} />}
          ListHeaderComponent={
            rejectedLoading && rejectedSales.length === 0 ? (
              <ActivityIndicator className="mt-12" color={brand.primary} />
            ) : null
          }
          ListEmptyComponent={
            !rejectedLoading ? (
              <EmptyState emoji="⛔" title={t.sales.noRejected} subtitle={t.sales.noRejectedSub} />
            ) : null
          }
        />
      ) : (
        <FlatList
          data={topProducts}
          keyExtractor={(item) => item.productName}
          renderItem={({ item, index }) => <TopProductCard item={item} rank={index + 1} rankBy={rankBy} />}
          contentContainerClassName="px-4 pb-8"
          refreshControl={<RefreshControl refreshing={topLoading} onRefresh={refetch} tintColor={brand.primary} />}
          ListHeaderComponent={topLoading && topProducts.length === 0 ? <ActivityIndicator className="mt-12" color={brand.primary} /> : null}
          ListEmptyComponent={
            !topLoading ? (
              <EmptyState emoji="🏆" title={t.sales.noData} subtitle={t.sales.noDataSub} />
            ) : null
          }
        />
      )}

      <ReprintReceiptModal source={reprintSource} onClose={() => setReprintSource(null)} />
      <RejectSaleModal target={rejectTarget} onClose={() => setRejectTarget(null)} />
    </View>
  );
}
