import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
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
import { inventoryApi, consignmentsApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import { EmptyState } from '../../components/ui/EmptyState';
import { AddPersonalModal } from '../../components/forms/AddPersonalModal';
import { ReceiveFromSupplierModal } from '../../components/forms/ReceiveFromSupplierModal';
import { ConsignToDebtorModal } from '../../components/forms/ConsignToDebtorModal';
import { RecordSaleModal } from '../../components/forms/RecordSaleModal';
import { breakdownQuantity, formatBreakdown } from '../../lib/utils';
import type { ProductSummary, ConsignmentRequest } from '@trading-app/types';

type Modal = 'none' | 'addPersonal' | 'receiveSupplier' | 'consignDebtor' | 'recordSale';

interface SaleTarget { productName: string; unitCost: string; }

function ProductCard({
  item,
  onSell,
}: {
  item: ProductSummary;
  onSell: (item: ProductSummary) => void;
}) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
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
        </View>

        {/* Cost · sell + source chips */}
        <View className="items-end">
          <Text className="text-muted dark:text-slate-500 text-sm">{t.inventory.costSell}</Text>
          <Text className="text-text dark:text-slate-100 text-sm font-medium">
            {formatCurrency(item.latestUnitCost)} · {formatCurrency(item.latestSellingPrice)}
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

  const { data, isFetching, refetch } = useQuery({
    queryKey: QK.inventoryProducts,
    queryFn: () => inventoryApi.listProducts(),
    staleTime: 30_000,
  });

  const { data: incomingData } = useQuery({
    queryKey: QK.consignmentsIncoming,
    queryFn: () => consignmentsApi.incoming(),
    staleTime: 30_000,
  });

  const pendingCount = ((incomingData as ConsignmentRequest[] | undefined) ?? []).filter(
    (r) => r.status === 'PENDING',
  ).length;

  const products = (data as ProductSummary[] | undefined) ?? [];

  const filtered = search.trim()
    ? products.filter((p) =>
        p.productName.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : products;

  const openFAB = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            t.common.cancel,
            t.inventory.addPersonal,
            t.inventory.receiveFromSupplier,
            t.inventory.consignToDebtor,
          ],
          cancelButtonIndex: 0,
        },
        (idx) => {
          if (idx === 1) setModal('addPersonal');
          if (idx === 2) setModal('receiveSupplier');
          if (idx === 3) setModal('consignDebtor');
        },
      );
    } else {
      Alert.alert(t.inventory.addStockTitle, t.inventory.addStockMessage, [
        { text: t.inventory.addPersonal, onPress: () => setModal('addPersonal') },
        { text: t.inventory.receiveFromSupplier, onPress: () => setModal('receiveSupplier') },
        { text: t.inventory.consignToDebtor, onPress: () => setModal('consignDebtor') },
        { text: t.common.cancel, style: 'cancel' },
      ]);
    }
  };

  const handleSell = (item: ProductSummary) => {
    setSaleTarget({ productName: item.productName, unitCost: item.latestUnitCost });
    setModal('recordSale');
  };

  return (
    <View className="flex-1 bg-surface dark:bg-slate-900">
      {/* Pending consignments banner */}
      {pendingCount > 0 && (
        <Pressable
          onPress={() => router.push('/(tabs)/consignments')}
          className="mx-4 mt-4 bg-primary/10 border border-primary rounded-xl px-4 py-3 flex-row items-center justify-between"
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
        >
          <View className="flex-row items-center gap-2">
            <Text className="text-xl">📬</Text>
            <View>
              <Text className="text-primary font-semibold text-sm">
                {t.inventory.pendingCount(pendingCount)}
              </Text>
              <Text className="text-primary/70 text-sm">{t.inventory.tapToConfirm}</Text>
            </View>
          </View>
          <Text className="text-primary font-bold text-lg">›</Text>
        </Pressable>
      )}

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
        renderItem={({ item }) => <ProductCard item={item} onSell={handleSell} />}
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

      {/* FAB */}
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

      {/* Modals */}
      <AddPersonalModal visible={modal === 'addPersonal'} onClose={() => setModal('none')} />
      <ReceiveFromSupplierModal
        visible={modal === 'receiveSupplier'}
        onClose={() => setModal('none')}
      />
      <ConsignToDebtorModal
        visible={modal === 'consignDebtor'}
        onClose={() => setModal('none')}
      />
      {saleTarget && (
        <RecordSaleModal
          visible={modal === 'recordSale'}
          onClose={() => {
            setModal('none');
            setSaleTarget(null);
          }}
          prefilledProduct={saleTarget.productName}
          unitCost={saleTarget.unitCost}
        />
      )}
    </View>
  );
}
