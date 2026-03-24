import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { formatDate, breakdownQuantity, formatBreakdown } from '../../lib/utils';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { RecordSaleModal } from '../../components/forms/RecordSaleModal';
import type { InventoryEntry } from '@trading-app/types';

const LOW_STOCK = 5;

function sourceBadgeProps(
  source: string,
  t: ReturnType<typeof useT>,
): { label: string; variant: 'personal' | 'supplier' | 'consigned' } {
  if (source === 'PERSONAL') return { label: t.productDetail.personal, variant: 'personal' };
  if (source === 'SUPPLIER') return { label: t.productDetail.supplier, variant: 'supplier' };
  if (source === 'CONSIGNED_IN') return { label: t.productDetail.received, variant: 'consigned' };
  return { label: t.productDetail.sentOut, variant: 'consigned' };
}

function EntryCard({ entry }: { entry: InventoryEntry }) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const isLowStock = entry.quantityRemaining <= LOW_STOCK;
  const bd = breakdownQuantity(entry.quantityRemaining, entry.piecesPerCarton);
  const bdOrig = breakdownQuantity(entry.quantityOriginal, entry.piecesPerCarton);
  const badge = sourceBadgeProps(entry.source, t);
  const counterparty =
    entry.source === 'SUPPLIER'
      ? entry.supplierUser?.username
      : entry.source === 'CONSIGNED_OUT' || entry.source === 'CONSIGNED_IN'
      ? entry.debtorUser?.username ?? entry.supplierUser?.username
      : null;

  return (
    <View className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl p-4 mb-3">
      {/* Top row: badge + counterparty + date */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2 flex-1">
          <Badge label={badge.label} variant={badge.variant} />
          {counterparty && (
            <Text className="text-muted dark:text-slate-500 text-xs">
              {t.productDetail.counterparty} @{counterparty}
            </Text>
          )}
        </View>
        <Text className="text-muted dark:text-slate-500 text-xs ml-2">{formatDate(entry.createdAt)}</Text>
      </View>

      {/* Quantity row */}
      <View className="flex-row justify-between items-end">
        <View>
          <Text className="text-muted dark:text-slate-500 text-xs mb-0.5">
            {t.productDetail.remaining} / {t.productDetail.original}
          </Text>
          <Text
            className={`text-base font-bold ${
              isLowStock ? 'text-danger' : 'text-text dark:text-slate-100'
            }`}
          >
            {formatBreakdown(bd)}
          </Text>
          <Text className="text-muted dark:text-slate-500 text-xs">
            {entry.quantityRemaining} / {entry.quantityOriginal} pcs
            {isLowStock && <Text className="text-danger"> · ⚠️ {t.inventory.low}</Text>}
          </Text>
        </View>

        <View className="items-end">
          <Text className="text-muted dark:text-slate-500 text-xs">{t.inventory.costSell}</Text>
          <Text className="text-text dark:text-slate-100 text-sm font-medium">
            {formatCurrency(entry.unitCost)} · {formatCurrency(entry.sellingPrice)}
          </Text>
          {entry.piecesPerCarton && (
            <Text className="text-muted dark:text-slate-500 text-xs mt-0.5">
              1 ctn = {entry.piecesPerCarton} pcs
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

export default function ProductDetailScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const productName = decodeURIComponent(name ?? '');
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const [saleOpen, setSaleOpen] = useState(false);

  const { data, isFetching, refetch } = useQuery({
    queryKey: QK.inventory({ productName }),
    queryFn: () => inventoryApi.list({ productName }),
    staleTime: 30_000,
    enabled: !!productName,
  });

  const entries = (data as InventoryEntry[] | undefined) ?? [];

  // Aggregate available (PERSONAL + SUPPLIER + CONSIGNED_IN)
  const totalAvailable = entries
    .filter((e) => e.source !== 'CONSIGNED_OUT')
    .reduce((s, e) => s + e.quantityRemaining, 0);

  const piecesPerCarton = entries.find((e) => e.piecesPerCarton !== null)?.piecesPerCarton ?? null;
  const latestUnitCost = entries.find((e) => e.source !== 'CONSIGNED_OUT')?.unitCost ?? '0.00';
  const bd = breakdownQuantity(totalAvailable, piecesPerCarton);

  if (isFetching && entries.length === 0) {
    return (
      <View className="flex-1 bg-surface dark:bg-slate-900 items-center justify-center">
        <ActivityIndicator color="#2563EB" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface dark:bg-slate-900">
      {/* Header */}
      <View className="bg-card dark:bg-slate-800 border-b border-border dark:border-slate-700 px-6 pt-14 pb-4">
        <TouchableOpacity onPress={() => router.back()} className="mb-3">
          <Text className="text-primary font-medium">{t.common.back}</Text>
        </TouchableOpacity>

        <View className="flex-row justify-between items-start">
          <Text className="text-2xl font-bold text-text dark:text-slate-100 flex-1 mr-3" numberOfLines={2}>
            {productName.charAt(0).toUpperCase() + productName.slice(1)}
          </Text>
          <TouchableOpacity
            onPress={() => setSaleOpen(true)}
            className="bg-primary px-4 py-2 rounded-xl"
          >
            <Text className="text-white font-semibold text-sm">{t.productDetail.sellBtn}</Text>
          </TouchableOpacity>
        </View>

        {/* Available summary */}
        <View className="mt-3 bg-surface dark:bg-slate-900 border border-border dark:border-slate-700 rounded-xl px-4 py-3">
          <Text className="text-muted dark:text-slate-500 text-xs mb-0.5">
            {t.productDetail.totalAvailable}
          </Text>
          <Text className="text-text dark:text-slate-100 text-lg font-bold">
            {formatBreakdown(bd)}
          </Text>
          {piecesPerCarton && (
            <Text className="text-muted dark:text-slate-500 text-xs mt-0.5">
              1 ctn = {piecesPerCarton} pcs
            </Text>
          )}
        </View>
      </View>

      {/* Entries list */}
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <EntryCard entry={item} />}
        contentContainerClassName="px-4 pt-4 pb-8"
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#2563EB" />
        }
        ListHeaderComponent={
          <Text className="text-text dark:text-slate-100 font-semibold text-sm mb-3 uppercase tracking-wide">
            {t.productDetail.stockLedger} ({entries.length})
          </Text>
        }
        ListEmptyComponent={
          !isFetching ? (
            <EmptyState
              emoji="📦"
              title={t.productDetail.noEntries}
              subtitle={t.productDetail.noEntriesSub}
            />
          ) : null
        }
      />

      <RecordSaleModal
        visible={saleOpen}
        onClose={() => setSaleOpen(false)}
        prefilledProduct={productName}
        unitCost={latestUnitCost}
      />
    </View>
  );
}
