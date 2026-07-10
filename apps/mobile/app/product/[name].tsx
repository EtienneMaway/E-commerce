import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { formatDate, breakdownQuantity, formatBreakdown } from '../../lib/utils';
import { useFormatCurrency, useExchangeRate, formatMoney } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { RecordSaleModal } from '../../components/forms/RecordSaleModal';
import { SellSizedProductModal } from '../../components/forms/SellSizedProductModal';
import { EditMiniPriceModal } from '../../components/forms/EditMiniPriceModal';
import { useAuthStore } from '../../store/auth.store';
import type { InventoryEntry, ProductSummary } from '@trading-app/types';

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
  const badge = sourceBadgeProps(entry.source, t);
  const counterparty =
    entry.source === 'SUPPLIER'
      ? entry.supplierUser?.username
      : entry.source === 'CONSIGNED_OUT' || entry.source === 'CONSIGNED_IN'
      ? entry.debtorUser?.username ?? entry.supplierUser?.username
      : null;

  return (
    <View className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl p-4 mb-3">
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
  const exchangeRate = useExchangeRate();
  const isMini = useAuthStore((s) => s.user?.activeEmployment?.tier === 'SALES_ONLY');
  const [saleOpen, setSaleOpen] = useState(false);
  const [sizedSellOpen, setSizedSellOpen] = useState(false);
  const [editPriceOpen, setEditPriceOpen] = useState(false);

  // Product summaries — used to detect a composite (sized) product.
  const { data: productsData } = useQuery({
    queryKey: QK.inventoryProducts,
    queryFn: () => inventoryApi.listProducts(),
    staleTime: 30_000,
  });
  const group =
    ((productsData as ProductSummary[] | undefined) ?? []).find(
      (p) => p.kind === 'group' && p.productName === productName,
    ) ?? null;

  const { data, isFetching, refetch } = useQuery({
    queryKey: QK.inventory({ productName }),
    queryFn: () => inventoryApi.list({ productName, page: 1, limit: 500 }),
    staleTime: 30_000,
    enabled: !!productName && !group,
  });

  const entries =
    ((data as { data?: InventoryEntry[] } | InventoryEntry[] | undefined) as { data?: InventoryEntry[] } | undefined)?.data ??
    ((data as InventoryEntry[] | undefined) ?? []);

  const titleCased = productName.charAt(0).toUpperCase() + productName.slice(1);

  // ── Composite (sized) product view ─────────────────────────────────────────
  if (group) {
    const variants = group.variants ?? [];
    const groupRate = isMini && group.usdToFcRateSnapshot ? group.usdToFcRateSnapshot : exchangeRate;
    const cartonPriceUsd = group.cartonSellingPrice ? parseFloat(group.cartonSellingPrice) : null;
    const money = (usd: string, r?: string | null) =>
      formatMoney(usd, isMini && r ? r : groupRate);

    return (
      <View className="flex-1 bg-surface dark:bg-slate-900">
        <View className="bg-card dark:bg-slate-800 border-b border-border dark:border-slate-700 px-6 pt-14 pb-4">
          <TouchableOpacity onPress={() => router.back()} className="mb-3">
            <Text className="text-primary font-medium">{t.common.back}</Text>
          </TouchableOpacity>
          <View className="flex-row justify-between items-start">
            <Text className="text-2xl font-bold text-text dark:text-slate-100 flex-1 mr-3" numberOfLines={2}>
              {titleCased}
            </Text>
            <View className="flex-row gap-2">
              {isMini && (
                <TouchableOpacity
                  onPress={() => setEditPriceOpen(true)}
                  className="px-3 py-2 rounded-xl border border-primary"
                >
                  <Text className="text-primary font-semibold text-sm">{t.miniEmployee.actionEditPrice}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setSizedSellOpen(true)} className="bg-primary px-4 py-2 rounded-xl">
                <Text className="text-white font-semibold text-sm">{t.productDetail.sellBtn}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Carton summary */}
          <View className="mt-3 bg-surface dark:bg-slate-900 border border-border dark:border-slate-700 rounded-xl px-4 py-3">
            <View className="flex-row justify-between items-center">
              <View>
                <Text className="text-muted dark:text-slate-500 text-xs mb-0.5">{t.productDetail.totalAvailable}</Text>
                <Text className="text-text dark:text-slate-100 text-lg font-bold">
                  {t.sizedSale.cartonCount(group.cartonsAvailable ?? 0)}
                </Text>
                <Text className="text-muted dark:text-slate-500 text-xs">{group.totalAvailable} pcs</Text>
              </View>
              {cartonPriceUsd != null && (
                <View className="items-end">
                  <Text className="text-muted dark:text-slate-500 text-xs">{t.sizedSale.cartonPrice}</Text>
                  <Text className="text-text dark:text-slate-100 text-base font-semibold">
                    {money(cartonPriceUsd.toString())}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Per-size breakdown */}
        <ScrollView
          contentContainerClassName="px-4 pt-4 pb-8"
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#2563EB" />}
        >
          <Text className="text-text dark:text-slate-100 font-semibold text-sm mb-3 uppercase tracking-wide">
            {t.sizedSale.sizesHeader}
          </Text>
          {variants.map((v) => (
            <View
              key={v.variantId}
              className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl px-4 py-3 mb-2 flex-row justify-between items-center"
            >
              <View>
                <Text className="text-text dark:text-slate-100 font-semibold capitalize">{v.label}</Text>
                <Text className="text-muted dark:text-slate-500 text-xs">
                  {v.available} pcs · {t.sizedSale.perCartonPieces(v.piecesPerCarton)}
                </Text>
              </View>
              <Text className="text-text dark:text-slate-100 text-sm font-medium">
                {money(v.sellingPrice, v.usdToFcRateSnapshot)} {t.sizedSale.perPiece}
              </Text>
            </View>
          ))}
        </ScrollView>

        <SellSizedProductModal visible={sizedSellOpen} onClose={() => setSizedSellOpen(false)} group={group} />
        <EditMiniPriceModal
          visible={editPriceOpen}
          onClose={() => setEditPriceOpen(false)}
          productName={productName}
          variants={variants.map((v) => ({ variantId: v.variantId, label: v.label }))}
          groupId={group.groupId}
          cartonSellingPrice={group.cartonSellingPrice}
        />
      </View>
    );
  }

  // ── Simple product view ────────────────────────────────────────────────────
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
      <View className="bg-card dark:bg-slate-800 border-b border-border dark:border-slate-700 px-6 pt-14 pb-4">
        <TouchableOpacity onPress={() => router.back()} className="mb-3">
          <Text className="text-primary font-medium">{t.common.back}</Text>
        </TouchableOpacity>

        <View className="flex-row justify-between items-start">
          <Text className="text-2xl font-bold text-text dark:text-slate-100 flex-1 mr-3" numberOfLines={2}>
            {titleCased}
          </Text>
          <TouchableOpacity onPress={() => setSaleOpen(true)} className="bg-primary px-4 py-2 rounded-xl">
            <Text className="text-white font-semibold text-sm">{t.productDetail.sellBtn}</Text>
          </TouchableOpacity>
        </View>

        <View className="mt-3 bg-surface dark:bg-slate-900 border border-border dark:border-slate-700 rounded-xl px-4 py-3">
          <Text className="text-muted dark:text-slate-500 text-xs mb-0.5">{t.productDetail.totalAvailable}</Text>
          <Text className="text-text dark:text-slate-100 text-lg font-bold">{formatBreakdown(bd)}</Text>
          {piecesPerCarton && (
            <Text className="text-muted dark:text-slate-500 text-xs mt-0.5">1 ctn = {piecesPerCarton} pcs</Text>
          )}
        </View>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <EntryCard entry={item} />}
        contentContainerClassName="px-4 pt-4 pb-8"
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#2563EB" />}
        ListHeaderComponent={
          <Text className="text-text dark:text-slate-100 font-semibold text-sm mb-3 uppercase tracking-wide">
            {t.productDetail.stockLedger} ({entries.length})
          </Text>
        }
        ListEmptyComponent={
          !isFetching ? (
            <EmptyState emoji="📦" title={t.productDetail.noEntries} subtitle={t.productDetail.noEntriesSub} />
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
