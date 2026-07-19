import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  ActionSheetIOS,
  Platform,
  Alert,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useFormatCurrency, useExchangeRate, formatMoney } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import { EmptyState } from '../../components/ui/EmptyState';
import { PersonaBanner } from '../../components/ui/PersonaBanner';
import { HandoverStatusBanner } from '../../components/ui/HandoverStatusBanner';
import { usePendingHandover } from '../../hooks/use-pending-handover';
import { AddPersonalModal } from '../../components/forms/AddPersonalModal';
import { ReceiveFromSupplierModal } from '../../components/forms/ReceiveFromSupplierModal';
import { RecordSaleModal } from '../../components/forms/RecordSaleModal';
import { EditMiniPriceModal } from '../../components/forms/EditMiniPriceModal';
import { SellSizedProductModal } from '../../components/forms/SellSizedProductModal';
import { breakdownQuantity, formatBreakdown } from '../../lib/utils';
import { usePersonaStore } from '../../store/persona.store';
import { useAuthStore } from '../../store/auth.store';
import { useOfflineStore } from '../../store/offline.store';
import type { ProductSummary } from '@trading-app/types';

type Modal = 'none' | 'addPersonal' | 'receiveSupplier' | 'recordSale' | 'editPrice' | 'sellSized';

interface SaleTarget { productName: string; unitCost: string; }

function ProductCard({
  item,
  onSell,
  soldOfflinePending,
}: {
  item: ProductSummary;
  onSell: (item: ProductSummary) => void;
  /** Total qty sold offline for this product still awaiting sync. 0 hides the chip. */
  soldOfflinePending: number;
}) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const exchangeRate = useExchangeRate();
  // A mini's consigned stock displays its prices at the consignment's locked
  // rate (carried on the product), so a live-rate change never shifts them.
  const isMini = useAuthStore((s) => s.user?.activeEmployment?.tier === 'SALES_ONLY');
  const money = (v: string) =>
    isMini && item.usdToFcRateSnapshot ? formatMoney(v, item.usdToFcRateSnapshot) : formatCurrency(v);
  const isGroup = item.kind === 'group';
  const groupRate = isMini && item.usdToFcRateSnapshot ? item.usdToFcRateSnapshot : exchangeRate;
  const variantMoney = (vt: { sellingPrice: string; usdToFcRateSnapshot?: string | null }) =>
    formatMoney(vt.sellingPrice, isMini && vt.usdToFcRateSnapshot ? vt.usdToFcRateSnapshot : groupRate);
  const isLowStock = item.totalAvailable > 0 && item.totalAvailable <= 5;
  const isOutOfStock = item.totalAvailable === 0;
  const bd = breakdownQuantity(item.totalAvailable, item.piecesPerCarton);

  return (
    <Pressable
      onPress={() => router.push(`/product/${encodeURIComponent(item.productName)}`)}
      onLongPress={() => onSell(item)}
      className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl p-4 mb-3"
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}
    >
      {/* Name row */}
      <View className="flex-row justify-between items-start mb-1">
        <Text
          className="text-text dark:text-slate-100 font-semibold text-base flex-1 mr-2"
          numberOfLines={2}
        >
          {item.productName.charAt(0).toUpperCase() + item.productName.slice(1)}
        </Text>
        {isOutOfStock ? (
          <Text className="text-muted dark:text-slate-500 text-xs font-medium">Out of stock</Text>
        ) : isLowStock ? (
          <Text className="text-danger text-xs font-semibold">⚠️ {t.inventory.low}</Text>
        ) : null}
      </View>

      {item.category && (
        <Text className="text-muted dark:text-slate-500 text-xs mb-2">{item.category}</Text>
      )}

      {/* Stock + prices row */}
      {isGroup ? (
        <View className="mt-2">
          <View className="flex-row justify-between items-start">
            <View>
              <Text className="text-muted dark:text-slate-500 text-sm mb-0.5">{t.inventory.available}</Text>
              <Text
                className={`text-base font-bold ${
                  isOutOfStock ? 'text-muted dark:text-slate-500' : 'text-text dark:text-slate-100'
                }`}
              >
                {t.sizedSale.cartonsAvailable(item.cartonsAvailable ?? 0)}
              </Text>
              <Text className="text-muted dark:text-slate-500 text-sm">{item.totalAvailable} pcs</Text>
              {soldOfflinePending > 0 && (
                <Text className="text-amber-600 dark:text-amber-400 text-xs mt-1 font-medium">
                  ⏳ {soldOfflinePending} sold · pending sync
                </Text>
              )}
            </View>
            {item.cartonSellingPrice ? (
              <View className="items-end">
                <Text className="text-muted dark:text-slate-500 text-sm">{t.sizedSale.cartonPrice}</Text>
                <Text className="text-text dark:text-slate-100 text-sm font-semibold">
                  {money(item.cartonSellingPrice)}
                </Text>
              </View>
            ) : null}
          </View>
          {/* Per-size prices */}
          <View className="mt-2 gap-1">
            {(item.variants ?? []).map((v) => (
              <View key={v.variantId} className="flex-row justify-between items-center">
                <Text className="text-muted dark:text-slate-500 text-sm capitalize">
                  {v.label} · {v.available} pcs
                </Text>
                <Text className="text-text dark:text-slate-100 text-sm font-medium">
                  {variantMoney(v)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View className="flex-row justify-between items-end mt-2">
          {/* Available breakdown */}
          <View>
            <Text className="text-muted dark:text-slate-500 text-sm mb-0.5">{t.inventory.available}</Text>
            <Text
              className={`text-base font-bold ${
                isOutOfStock
                  ? 'text-muted dark:text-slate-500'
                  : isLowStock
                  ? 'text-danger'
                  : 'text-text dark:text-slate-100'
              }`}
            >
              {formatBreakdown(bd)}
            </Text>
            {item.piecesPerCarton ? (
              <Text className="text-muted dark:text-slate-500 text-sm">
                1 ctn = {item.piecesPerCarton} pcs
              </Text>
            ) : null}
            {soldOfflinePending > 0 && (
              <Text className="text-amber-600 dark:text-amber-400 text-xs mt-1 font-medium">
                ⏳ {soldOfflinePending} sold · pending sync
              </Text>
            )}
          </View>

          {/* Cost · sell + source chips */}
          <View className="items-end">
            <Text className="text-muted dark:text-slate-500 text-sm">{t.inventory.costSell}</Text>
            <Text className="text-text dark:text-slate-100 text-sm font-medium">
              {money(item.latestUnitCost)} · {money(item.latestSellingPrice)}
            </Text>
            <View className="flex-row gap-1.5 mt-1.5 flex-wrap justify-end">
              {item.sourceBreakdown.personal > 0 && (
                <Text className="text-sm bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded px-1.5 py-0.5">
                  P: {item.sourceBreakdown.personal}
                </Text>
              )}
              {item.sourceBreakdown.supplier > 0 && (
                <Text className="text-sm bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 rounded px-1.5 py-0.5">
                  S: {item.sourceBreakdown.supplier}
                </Text>
              )}
              {item.sourceBreakdown.consignedIn > 0 && (
                <Text className="text-sm bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 rounded px-1.5 py-0.5">
                  IN: {item.sourceBreakdown.consignedIn}
                </Text>
              )}
              {item.sourceBreakdown.consignedOut > 0 && (
                <Text className="text-sm bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded px-1.5 py-0.5">
                  OUT: {item.sourceBreakdown.consignedOut}
                </Text>
              )}
            </View>
          </View>
        </View>
      )}

      <Text className="text-muted dark:text-slate-500 text-sm mt-2 italic">
        {t.inventory.longPressToSell}
      </Text>
    </Pressable>
  );
}

export default function InventoryScreen() {
  const t = useT();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<Modal>('none');
  const [saleTarget, setSaleTarget] = useState<SaleTarget | null>(null);
  const [priceTarget, setPriceTarget] = useState<string | null>(null);
  const [sizedTarget, setSizedTarget] = useState<ProductSummary | null>(null);
  // Employees acting on the employer's books shouldn't be adding products to
  // inventory — that's an owner-only action. Hide the FAB entirely in that
  // case. (When persona flips back to Self the FAB returns automatically.)
  const persona = usePersonaStore((s) => s.kind);
  // A mini is identified by a Sales-only employment (covers both legacy synthetic
  // minis and normal users who accepted a sales-only invite).
  const isMini = useAuthStore((s) => s.user?.activeEmployment?.tier === 'SALES_ONLY');
  // Minis manage a consigned pool: no add-stock FAB, but they can re-price.
  const canAddProducts = persona === 'self' && !isMini;
  // Once a handover is submitted the mini has handed the goods back, so selling
  // is off until the employer approves or rejects it.
  const { isBlocked: handoverPending } = usePendingHandover();
  const { isOffline, cachedProducts, pendingSales } = useOfflineStore();

  const { data, isFetching, refetch } = useQuery({
    queryKey: QK.inventoryProducts,
    queryFn: () => inventoryApi.listProducts(),
    staleTime: 30_000,
    // Don't fire the network query offline — the listing comes from the
    // cached snapshot instead.
    enabled: !isOffline,
  });

  // When offline, render from the snapshotted cache so the decremented
  // availableQty (and the dashboard-set selling price + carton metadata
  // captured at offline-entry) drive the listing. Sales recorded offline
  // immediately reduce the displayed availability — preventing oversell.
  const products: ProductSummary[] = isOffline
    ? cachedProducts.map((p) => ({
        productName: p.productName,
        category: p.category ?? null,
        piecesPerCarton: p.piecesPerCarton ?? null,
        latestCartonPrice: p.latestCartonPrice ?? null,
        totalAvailable: p.availableQty,
        sourceBreakdown: { personal: 0, supplier: 0, consignedIn: 0, consignedOut: 0 },
        latestSellingPrice: p.latestSellingPrice ?? p.unitCost,
        latestUnitCost: p.unitCost,
      }))
    : (data as ProductSummary[] | undefined) ?? [];

  // Aggregate offline-sold qty per product so each card can show a "sold,
  // pending sync" chip. Only relevant while offline (or right after toggling
  // back online but before the user has hit Sync).
  const pendingByProduct = pendingSales.reduce<Record<string, number>>((acc, s) => {
    acc[s.productName] = (acc[s.productName] ?? 0) + s.qtySold;
    return acc;
  }, {});

  const searched = search.trim()
    ? products.filter((p) =>
        p.productName.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : products;
  // A mini only ever holds consigned stock; once a product is fully sold and/or
  // returned at handover it's gone from their books — hide these empty shells so
  // the list clears after a handover. Owners keep out-of-stock rows (they
  // restock the same product), so only filter for minis.
  const filtered = isMini ? searched.filter((p) => p.totalAvailable > 0) : searched;

  const openFAB = () => {
    if (!canAddProducts) return;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            t.common.cancel,
            t.inventory.addPersonal,
            t.inventory.receiveFromSupplier,
          ],
          cancelButtonIndex: 0,
        },
        (idx) => {
          if (idx === 1) setModal('addPersonal');
          if (idx === 2) setModal('receiveSupplier');
        },
      );
    } else {
      Alert.alert(t.inventory.addStockTitle, t.inventory.addStockMessage, [
        { text: t.inventory.addPersonal, onPress: () => setModal('addPersonal') },
        { text: t.inventory.receiveFromSupplier, onPress: () => setModal('receiveSupplier') },
        { text: t.common.cancel, style: 'cancel' },
      ]);
    }
  };

  const handleSell = (item: ProductSummary) => {
    // Sized (carton-with-sizes) products use a dedicated modal for carton/size selling.
    if (item.kind === 'group') {
      if (isMini) {
        // While a handover waits for approval the goods are physically back with
        // the employer, so drop Sell from the sheet — but keep Edit price, which
        // moves neither stock nor cash.
        Alert.alert(item.productName, handoverPending ? t.miniEmployee.handoverBlocksSelling : undefined, [
          ...(handoverPending
            ? []
            : [
                {
                  text: t.miniEmployee.actionSell,
                  onPress: () => {
                    setSizedTarget(item);
                    setModal('sellSized');
                  },
                },
              ]),
          {
            text: t.miniEmployee.actionEditPrice,
            onPress: () => {
              setSizedTarget(item);
              setPriceTarget(item.productName);
              setModal('editPrice');
            },
          },
          { text: t.common.cancel, style: 'cancel' },
        ]);
        return;
      }
      setSizedTarget(item);
      setModal('sellSized');
      return;
    }
    // Minis can sell OR re-price their consigned stock — offer the choice.
    if (isMini) {
      Alert.alert(item.productName, handoverPending ? t.miniEmployee.handoverBlocksSelling : undefined, [
        ...(handoverPending
          ? []
          : [
              {
                text: t.miniEmployee.actionSell,
                onPress: () => {
                  setSaleTarget({ productName: item.productName, unitCost: item.latestUnitCost });
                  setModal('recordSale');
                },
              },
            ]),
        {
          text: t.miniEmployee.actionEditPrice,
          onPress: () => {
            setSizedTarget(null);
            setPriceTarget(item.productName);
            setModal('editPrice');
          },
        },
        { text: t.common.cancel, style: 'cancel' },
      ]);
      return;
    }
    setSaleTarget({ productName: item.productName, unitCost: item.latestUnitCost });
    setModal('recordSale');
  };

  return (
    <View className="flex-1 bg-surface dark:bg-slate-900">
      <View className="px-4 pt-4"><PersonaBanner /><HandoverStatusBanner /></View>

      {/* Search bar */}
      <View className="mx-4 mt-4 mb-1">
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t.inventory.searchProducts}
          placeholderTextColor="#94a3b8"
          className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl px-4 py-3 text-text dark:text-slate-100 text-base"
        />
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.productName}
        renderItem={({ item }) => (
          <ProductCard
            item={item}
            onSell={handleSell}
            soldOfflinePending={pendingByProduct[item.productName] ?? 0}
          />
        )}
        contentContainerClassName="px-4 pt-3 pb-32"
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#2563EB" />
        }
        ListHeaderComponent={
          isFetching && filtered.length === 0 ? (
            <ActivityIndicator className="mt-12" color="#2563EB" />
          ) : null
        }
        ListEmptyComponent={
          !isFetching ? (
            <EmptyState
              emoji="📦"
              title={t.inventory.noInventory}
              subtitle={t.inventory.noInventorySub}
            />
          ) : null
        }
      />

      {/* FAB — hidden when in Employer persona (employees can't add stock). */}
      {canAddProducts && (
        <Pressable
          onPress={openFAB}
          className="absolute bottom-8 right-6 bg-primary w-14 h-14 rounded-full items-center justify-center shadow-lg"
          style={({ pressed }) => ({
            elevation: pressed ? 3 : 6,
            transform: [{ scale: pressed ? 0.93 : 1 }],
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Text className="text-white text-3xl font-light leading-none">+</Text>
        </Pressable>
      )}

      {/* Modals */}
      <AddPersonalModal visible={modal === 'addPersonal'} onClose={() => setModal('none')} />
      <ReceiveFromSupplierModal
        visible={modal === 'receiveSupplier'}
        onClose={() => setModal('none')}
      />
      {/* Keep RecordSaleModal mounted at all times so the post-sale receipt
          prompt (which lives in local state inside it) survives the main
          modal closing. Conditionally rendering on `saleTarget` used to unmount
          the component the moment a sale was submitted, racing the
          setReceiptPrompt call and silently dropping the prompt — visibly
          breaking the print-after-sale flow especially offline, where the
          submit branch is fully synchronous and the race fires every time. */}
      <RecordSaleModal
        visible={modal === 'recordSale'}
        onClose={() => {
          setModal('none');
          setSaleTarget(null);
        }}
        prefilledProduct={saleTarget?.productName ?? ''}
        unitCost={saleTarget?.unitCost ?? ''}
      />
      <EditMiniPriceModal
        visible={modal === 'editPrice'}
        onClose={() => {
          setModal('none');
          setPriceTarget(null);
          setSizedTarget(null);
        }}
        productName={priceTarget ?? ''}
        variants={sizedTarget?.variants?.map((v) => ({ variantId: v.variantId, label: v.label }))}
        groupId={sizedTarget?.groupId}
        cartonSellingPrice={sizedTarget?.cartonSellingPrice}
      />
      <SellSizedProductModal
        visible={modal === 'sellSized'}
        onClose={() => {
          setModal('none');
          setSizedTarget(null);
        }}
        group={sizedTarget}
      />
    </View>
  );
}
