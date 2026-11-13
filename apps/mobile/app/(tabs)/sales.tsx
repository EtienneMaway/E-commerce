import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { salesApi } from '../../lib/api';
import { usePagedList, fromDataTotal, MOBILE_PAGE_SIZE } from '../../lib/paged-list';
import { useIsOnline } from '../../lib/connectivity';
import { ListFooter } from '../../components/ui/ListFooter';
import { QK } from '../../lib/query-keys';
import { useBrand } from '../../lib/theme';
import { formatDate } from '../../lib/utils';
import { useFormatCurrency } from '../../lib/currency';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { CARD_SHADOW } from '../../components/ui/Card';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PersonaBanner } from '../../components/ui/PersonaBanner';
import { ReprintReceiptModal } from '../../components/forms/ReprintReceiptModal';
import { RejectSaleModal, type RejectTarget } from '../../components/forms/RejectSaleModal';
import { useOfflineStore } from '../../store/offline.store';
import { useT } from '@/lib/i18n';
import { personHandle } from '@/lib/person';
import { PullRefreshControl } from '../../components/ui/PullRefreshControl';

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
      className={`bg-card border rounded-3xl p-4 mb-3 ${isRejected ? 'border-danger/50' : 'border-border'}`}
      style={({ pressed }) => ({ boxShadow: CARD_SHADOW, opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}
    >
      <View className="flex-row justify-between items-start mb-3">
        <View className="flex-1 mr-2">
          <Text className="font-mono text-[10px] uppercase tracking-widest text-muted mb-1">{formatDate(item.date)}</Text>
          <Text className={`font-semibold text-[17px] ${isRejected ? 'text-muted line-through' : 'text-text'}`} numberOfLines={1}>
            {item.productName.charAt(0).toUpperCase() + item.productName.slice(1)}
            {item.variantLabel ? ` · ${item.variantLabel}` : ''}
          </Text>
        </View>
        <Badge
          label={item.isLoss ? t.sales.loss(formatCurrency(Math.abs(profitNum).toFixed(4))) : `+${formatCurrency(item.profit)}`}
          variant={item.isLoss ? 'loss' : 'profit'}
        />
      </View>
      {/* A ledger line: quantity, cost, price */}
      <View className="flex-row bg-surface rounded-2xl px-3 py-2.5">
        <View className="flex-1">
          <Text className="font-mono text-[9px] uppercase tracking-widest text-muted">{t.sales.qty}</Text>
          <Text className="font-mono-bold text-text text-[13px] mt-0.5">×{item.qtySold}</Text>
        </View>
        <View className="flex-1">
          <Text className="font-mono text-[9px] uppercase tracking-widest text-muted">{t.sales.unitCost}</Text>
          <Text className="font-mono text-text text-[13px] mt-0.5" numberOfLines={1}>{formatCurrency(item.unitCost)}</Text>
        </View>
        <View className="flex-1 items-end">
          <Text className="font-mono text-[9px] uppercase tracking-widest text-muted">{t.sales.salePrice}</Text>
          <Text className="font-mono-bold text-text text-[13px] mt-0.5" numberOfLines={1}>{formatCurrency(item.salePrice)}</Text>
        </View>
      </View>
      {item.source === 'SUPPLIER' && item.supplierUsername && (
        <Text className="text-muted text-xs mt-2">{t.sales.via(item.supplierUsername)}</Text>
      )}
      {(item.clientName || item.clientPhone) && (
        <View className="mt-2 pt-2 border-t border-border flex-row items-center gap-2 flex-wrap">
          <Icon name="user" size={12} tone="muted" />
          <Text className="text-muted text-xs">{t.sales.clientLabel}:</Text>
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
            <Icon name="slash" size={12} tone="danger" />
            <Text className="text-danger font-mono text-[10px] uppercase tracking-wider">{t.sales.rejectedBadge}</Text>
            <Text className="text-muted text-xs">
              {t.sales.rejectedOn(formatDate(item.rejectedAt as string))}
              {item.rejectedBy ? ` ${t.sales.rejectedBy(personHandle(item.rejectedBy, t.common.formerEmployee))}` : ''}
            </Text>
          </View>
          {item.rejectionReason ? (
            <Text className="text-muted text-xs mt-0.5 italic">“{item.rejectionReason}”</Text>
          ) : null}
        </View>
      ) : (
        <View className="flex-row items-center gap-1.5 mt-3">
          <Icon name="printer" size={12} tone="muted" />
          <Text className="text-muted text-[11px]">{onReject ? t.sales.tapToReprintHold : t.sales.tapToReprint}</Text>
        </View>
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
      className="bg-warning-light border border-warning/40 rounded-3xl p-4 mb-3"
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
    >
      <View className="flex-row justify-between items-start">
        <Text className="text-text font-semibold text-base flex-1 mr-2" numberOfLines={1}>
          {productName.charAt(0).toUpperCase() + productName.slice(1)}
        </Text>
        <View className="flex-row items-center gap-1">
          <Icon name="clock" size={12} tone="warning" />
          <Text className="text-warning font-mono text-[10px] uppercase tracking-wider">{t.sales.pendingSyncBadge}</Text>
        </View>
      </View>
      <Text className="text-muted text-sm mt-1">{t.sales.qty} {qtySold}</Text>
      <Text className="text-warning text-[11px] mt-2 opacity-80">{t.sales.tapToReprintHold}</Text>
    </Pressable>
  );
}

function TopProductCard({ item, rank, rankBy }: { item: TopProductRow; rank: number; rankBy: RankBy }) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  return (
    <View className="bg-card border border-border rounded-3xl p-4 mb-3" style={{ boxShadow: CARD_SHADOW }}>
      <View className="flex-row items-center mb-3">
        <Text className={`font-bold italic text-3xl mr-3 w-11 ${rank <= 3 ? 'text-accent' : 'text-muted-subtle'}`}>
          {String(rank).padStart(2, '0')}
        </Text>
        <Text className="font-semibold text-text text-[17px] flex-1" numberOfLines={1}>
          {item.productName.charAt(0).toUpperCase() + item.productName.slice(1)}
        </Text>
      </View>
      <View className="flex-row justify-between">
        <View className="items-center">
          <Text className="font-mono text-[9px] uppercase tracking-widest text-muted">{t.sales.qtySold}</Text>
          <Text className={`font-mono-bold text-sm mt-0.5 ${rankBy === 'qty' ? 'text-primary' : 'text-text'}`}>{item.totalQtySold}</Text>
        </View>
        <View className="items-center">
          <Text className="font-mono text-[9px] uppercase tracking-widest text-muted">{t.sales.revenueLabel}</Text>
          <Text className={`font-mono-bold text-sm mt-0.5 ${rankBy === 'revenue' ? 'text-primary' : 'text-text'}`}>{formatCurrency(item.totalRevenue)}</Text>
        </View>
        <View className="items-center">
          <Text className="font-mono text-[9px] uppercase tracking-widest text-muted">{t.sales.profitLabel}</Text>
          <Text className={`font-mono-bold text-sm mt-0.5 ${rankBy === 'profit' ? 'text-primary' : 'text-text'}`}>{formatCurrency(item.totalProfit)}</Text>
        </View>
      </View>
    </View>
  );
}

export default function SalesScreen() {
  const insets = useSafeAreaInsets();
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
  const online = useIsOnline();
  // History and rejected sales scroll page by page. Loaded pages persist with
  // the rest of the cache, so the list is readable offline as far as it was
  // scrolled, and opens instantly on the next launch while it refreshes behind.
  const historyFilters = { period: historyPeriod, ...(trimmedQuery ? { clientQuery: trimmedQuery } : {}) };
  const history = usePagedList<SaleRow>({
    queryKey: QK.salesHistoryPages(historyFilters),
    fetchPage: async (page) =>
      fromDataTotal<SaleRow>(await salesApi.list({ ...historyFilters, page, limit: MOBILE_PAGE_SIZE })),
    enabled: view === 'history',
    getId: (r) => r.id,
    // A period/search change keeps the current rows up until the new ones land.
    keepPrevious: true,
  });
  const rejected = usePagedList<SaleRow>({
    queryKey: QK.salesHistoryPages({ period: historyPeriod, status: 'rejected' }),
    fetchPage: async (page) =>
      fromDataTotal<SaleRow>(
        await salesApi.list({ period: historyPeriod, status: 'rejected', page, limit: MOBILE_PAGE_SIZE }),
      ),
    enabled: view === 'rejected',
    getId: (r) => r.id,
    keepPrevious: true,
  });
  const salesLoading = history.isInitialLoading;
  const rejectedLoading = rejected.isInitialLoading;
  const refetchSales = history.refetch;
  const refetchRejected = rejected.refetch;

  const { data: topData, isFetching: topLoading, refetch: refetchTop } = useQuery({
    queryKey: QK.topProducts({ rankBy, period: topPeriod }),
    queryFn: () => salesApi.topProducts({ rankBy, period: topPeriod }),
    staleTime: 30_000,
    enabled: view === 'top',
    placeholderData: keepPreviousData,
  });

  const sales = history.rows;
  const rejectedSales = rejected.rows;
  const topProducts = (topData as TopProductRow[] | undefined) ?? [];

  const refetch =
    view === 'history' ? refetchSales : view === 'rejected' ? refetchRejected : refetchTop;

  // Whole-period totals from the API (sent with page 1), not a sum of the rows
  // loaded so far — which used to cover only the 10 most recent sales.
  // Falls back to summing the rows against an API that predates `totals`.
  const apiTotals = (history.firstPageExtra as { totals?: { revenue: string; profit: string } } | undefined)?.totals;
  const totalProfit = apiTotals
    ? parseFloat(apiTotals.profit)
    : sales.reduce((s, x) => s + parseFloat(x.profit), 0);
  const totalRevenue = apiTotals
    ? parseFloat(apiTotals.revenue)
    : sales.reduce((s, x) => s + parseFloat(x.salePrice) * Number(x.qtySold), 0);

  return (
    <View className="flex-1 bg-background">
      <View className="px-5" style={{ paddingTop: insets.top + 16 }}>
        <ScreenHeader kicker={view === 'top' ? t.sales.topProducts : view === 'rejected' ? t.sales.rejectedTab : t.sales.history} title={t.tabs.sales} />
        <PersonaBanner />
      </View>
      {/* View toggle — a segmented track */}
      <View className="flex-row mx-5 mb-3 bg-surface rounded-full p-1">
        <TouchableOpacity
          onPress={() => setView('history')}
          className={`flex-1 py-2.5 rounded-full items-center ${view === 'history' ? 'bg-card' : ''}`}
          style={view === 'history' ? { boxShadow: CARD_SHADOW } : undefined}
        >
          <Text className={`text-sm font-semibold ${view === 'history' ? 'text-text' : 'text-muted'}`}>{t.sales.history}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setView('top')}
          className={`flex-1 py-2.5 rounded-full items-center ${view === 'top' ? 'bg-card' : ''}`}
          style={view === 'top' ? { boxShadow: CARD_SHADOW } : undefined}
        >
          <Text className={`text-sm font-semibold ${view === 'top' ? 'text-text' : 'text-muted'}`}>{t.sales.topProducts}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setView('rejected')}
          className={`flex-1 py-2.5 rounded-full items-center ${view === 'rejected' ? 'bg-card' : ''}`}
          style={view === 'rejected' ? { boxShadow: CARD_SHADOW } : undefined}
        >
          <Text className={`text-sm font-semibold ${view === 'rejected' ? 'text-text' : 'text-muted'}`}>{t.sales.rejectedTab}</Text>
        </TouchableOpacity>
      </View>

      {/* Period filter — options differ by view */}
      <View className="flex-row px-5 mb-3 gap-2">
        {view !== 'top'
          ? historyPeriodOptions.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setHistoryPeriod(opt.value)}
                className={`px-4 py-2 rounded-full border ${historyPeriod === opt.value ? 'bg-text border-text' : 'bg-card border-border'}`}
                style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}
              >
                <Text className={`font-mono text-xs ${historyPeriod === opt.value ? 'text-background' : 'text-text'}`}>{opt.label}</Text>
              </Pressable>
            ))
          : topPeriodOptions.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setTopPeriod(opt.value)}
                className={`px-4 py-2 rounded-full border ${topPeriod === opt.value ? 'bg-text border-text' : 'bg-card border-border'}`}
                style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}
              >
                <Text className={`font-mono text-xs ${topPeriod === opt.value ? 'text-background' : 'text-text'}`}>{opt.label}</Text>
              </Pressable>
            ))}
      </View>

      {/* RankBy (Top Products only) */}
      {view === 'top' && (
        <View className="flex-row px-5 mb-3 gap-2">
          {(['qty', 'revenue', 'profit'] as RankBy[]).map((r) => (
            <Pressable
              key={r}
              onPress={() => setRankBy(r)}
              className={`px-4 py-2 rounded-full border ${rankBy === r ? 'bg-primary-light border-primary/40' : 'bg-card border-border'}`}
              style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}
            >
              <Text className={`text-sm font-medium capitalize ${rankBy === r ? 'text-primary' : 'text-text'}`}>{rankLabels[r]}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Client search — only on history view */}
      {view === 'history' && (
        <View className="mx-5 mb-3 flex-row items-center bg-card border border-border rounded-full px-4">
          <Icon name="search" size={16} tone="muted" />
          <TextInput
            value={clientQuery}
            onChangeText={setClientQuery}
            placeholder={t.sales.searchClientPlaceholder}
            placeholderTextColor={brand.mutedSubtle}
            className="flex-1 px-3 py-2.5 text-text text-sm"
          />
        </View>
      )}

      {/* History summary — whole-period figures, one ledger card */}
      {view === 'history' && sales.length > 0 && (
        <View className="mx-5 mb-3 flex-row bg-card border border-border rounded-3xl px-4 py-3.5" style={{ boxShadow: CARD_SHADOW }}>
          <View className="flex-1">
            <Text className="font-mono text-[10px] uppercase tracking-widest text-muted">{t.sales.profitLabel}</Text>
            <Text className={`font-bold text-2xl mt-1 ${totalProfit < 0 ? 'text-danger' : 'text-success'}`} numberOfLines={1} adjustsFontSizeToFit>
              {formatCurrency(totalProfit.toFixed(4))}
            </Text>
          </View>
          <View className="w-px bg-border mx-4" />
          <View className="flex-1">
            <Text className="font-mono text-[10px] uppercase tracking-widest text-muted">{t.sales.revenueLabel}</Text>
            <Text className="font-bold text-2xl text-text mt-1" numberOfLines={1} adjustsFontSizeToFit>
              {formatCurrency(totalRevenue.toFixed(4))}
            </Text>
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
          contentContainerClassName="px-5 pb-8"
          refreshControl={<PullRefreshControl onRefresh={refetch} tintColor={brand.primary} />}
          onEndReached={history.loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            <ListFooter
              isFetchingNextPage={history.isFetchingNextPage}
              hasNextPage={history.hasNextPage}
              offline={!online}
              count={sales.length}
            />
          }
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
          contentContainerClassName="px-5 pb-8"
          refreshControl={<PullRefreshControl onRefresh={refetch} tintColor={brand.primary} />}
          onEndReached={rejected.loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            <ListFooter
              isFetchingNextPage={rejected.isFetchingNextPage}
              hasNextPage={rejected.hasNextPage}
              offline={!online}
              count={rejectedSales.length}
            />
          }
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
          contentContainerClassName="px-5 pb-8"
          refreshControl={<PullRefreshControl onRefresh={refetch} tintColor={brand.primary} />}
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
