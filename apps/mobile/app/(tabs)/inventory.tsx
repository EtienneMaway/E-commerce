import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ActionSheetIOS,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi, consignmentsApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { AddPersonalModal } from '../../components/forms/AddPersonalModal';
import { ReceiveFromSupplierModal } from '../../components/forms/ReceiveFromSupplierModal';
import { ConsignToDebtorModal } from '../../components/forms/ConsignToDebtorModal';
import { RecordSaleModal } from '../../components/forms/RecordSaleModal';
import type { InventoryEntry, ConsignmentRequest } from '@trading-app/types';

type SourceFilter = 'ALL' | 'PERSONAL' | 'SUPPLIER' | 'CONSIGNED_OUT' | 'CONSIGNED_IN';
type Modal = 'none' | 'addPersonal' | 'receiveSupplier' | 'consignDebtor' | 'recordSale';

function InventoryCard({ item, onSell }: { item: InventoryEntry; onSell: (item: InventoryEntry) => void }) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const isLowStock = item.quantityRemaining <= 5;
  return (
    <TouchableOpacity
      onLongPress={() => {
        if (item.source !== 'CONSIGNED_OUT') onSell(item);
      }}
      // CONSIGNED_OUT = sent to someone else, not available to sell
      // CONSIGNED_IN = received from supplier, debtor can sell it
      className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl p-4 mb-3"
      activeOpacity={0.85}
    >
      <View className="flex-row justify-between items-start mb-2">
        <Text className="text-text dark:text-slate-100 font-semibold text-base flex-1 mr-2" numberOfLines={2}>
          {item.productName.charAt(0).toUpperCase() + item.productName.slice(1)}
        </Text>
        <Badge
          label={
            item.source === 'PERSONAL' ? t.inventory.badgePersonal
            : item.source === 'SUPPLIER' ? t.inventory.badgeSupplier
            : item.source === 'CONSIGNED_IN' ? t.inventory.badgeReceived
            : t.inventory.badgeSentOut
          }
          variant={
            item.source === 'PERSONAL' ? 'personal'
            : item.source === 'SUPPLIER' ? 'supplier'
            : 'consigned'
          }
        />
      </View>

      {item.category && (
        <Text className="text-muted dark:text-slate-500 text-xs mb-2">{item.category}</Text>
      )}

      <View className="flex-row justify-between items-end">
        <View>
          <Text className="text-muted dark:text-slate-500 text-xs">{t.inventory.costSell}</Text>
          <Text className="text-text dark:text-slate-100 text-sm font-medium">
            {formatCurrency(item.unitCost)} · {formatCurrency(item.sellingPrice)}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-muted dark:text-slate-500 text-xs">{t.inventory.remaining}</Text>
          <Text className={`text-lg font-bold ${isLowStock ? 'text-danger' : 'text-text dark:text-slate-100'}`}>
            {item.quantityRemaining}
            {isLowStock && <Text className="text-xs"> {t.inventory.low}</Text>}
          </Text>
        </View>
      </View>

      {item.source !== 'CONSIGNED_OUT' && (
        <Text className="text-muted dark:text-slate-500 text-xs mt-2 italic">
          {item.source === 'CONSIGNED_IN' ? t.inventory.longPressToSellReceived : t.inventory.longPressToSell}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function InventoryScreen() {
  const t = useT();
  const [filter, setFilter] = useState<SourceFilter>('ALL');
  const [modal, setModal] = useState<Modal>('none');
  const [selectedItem, setSelectedItem] = useState<InventoryEntry | null>(null);

  const filterOptions: { label: string; value: SourceFilter }[] = [
    { label: t.inventory.filterAll, value: 'ALL' },
    { label: t.inventory.filterPersonal, value: 'PERSONAL' },
    { label: t.inventory.filterSupplier, value: 'SUPPLIER' },
    { label: t.inventory.filterSentOut, value: 'CONSIGNED_OUT' },
    { label: t.inventory.filterReceived, value: 'CONSIGNED_IN' },
  ];

  const filterParams = filter === 'ALL' ? undefined : { source: filter };

  const { data, isFetching, refetch } = useQuery({
    queryKey: QK.inventory(filterParams),
    queryFn: () => inventoryApi.list(filterParams),
    staleTime: 30_000,
  });

  const { data: incomingData } = useQuery({
    queryKey: QK.consignmentsIncoming,
    queryFn: () => consignmentsApi.incoming(),
    staleTime: 30_000,
  });

  const pendingCount = ((incomingData as ConsignmentRequest[] | undefined) ?? [])
    .filter((r) => r.status === 'PENDING').length;

  const entries = (data as InventoryEntry[] | undefined) ?? [];

  const openFAB = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t.common.cancel, t.inventory.addPersonal, t.inventory.receiveFromSupplier, t.inventory.consignToDebtor],
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

  const handleSell = (item: InventoryEntry) => {
    setSelectedItem(item);
    setModal('recordSale');
  };

  return (
    <View className="flex-1 bg-surface dark:bg-slate-900">
      {/* Pending consignments banner */}
      {pendingCount > 0 && (
        <TouchableOpacity
          onPress={() => router.push('/consignments')}
          className="mx-4 mt-4 bg-primary/10 border border-primary rounded-xl px-4 py-3 flex-row items-center justify-between"
        >
          <View className="flex-row items-center gap-2">
            <Text className="text-xl">📬</Text>
            <View>
              <Text className="text-primary font-semibold text-sm">
                {t.inventory.pendingCount(pendingCount)}
              </Text>
              <Text className="text-primary/70 text-xs">{t.inventory.tapToConfirm}</Text>
            </View>
          </View>
          <Text className="text-primary font-bold text-lg">›</Text>
        </TouchableOpacity>
      )}

      {/* Filter bar */}
      <View className="flex-row px-4 pt-4 pb-2 gap-2">
        {filterOptions.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            onPress={() => setFilter(opt.value)}
            className={`px-3 py-1.5 rounded-full border ${
              filter === opt.value
                ? 'bg-primary border-primary'
                : 'bg-card dark:bg-slate-800 border-border dark:border-slate-700'
            }`}
          >
            <Text className={`text-xs font-medium ${filter === opt.value ? 'text-white' : 'text-text dark:text-slate-100'}`}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <InventoryCard item={item} onSell={handleSell} />}
        contentContainerClassName="px-4 pb-32"
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#2563EB" />}
        ListHeaderComponent={
          isFetching && entries.length === 0 ? (
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
      <TouchableOpacity
        onPress={openFAB}
        className="absolute bottom-8 right-6 bg-primary w-14 h-14 rounded-full items-center justify-center shadow-lg"
        style={{ elevation: 6 }}
      >
        <Text className="text-white text-3xl font-light leading-none">+</Text>
      </TouchableOpacity>

      {/* Modals */}
      <AddPersonalModal visible={modal === 'addPersonal'} onClose={() => setModal('none')} />
      <ReceiveFromSupplierModal visible={modal === 'receiveSupplier'} onClose={() => setModal('none')} />
      <ConsignToDebtorModal visible={modal === 'consignDebtor'} onClose={() => setModal('none')} />
      {selectedItem && (
        <RecordSaleModal
          visible={modal === 'recordSale'}
          onClose={() => { setModal('none'); setSelectedItem(null); }}
          prefilledProduct={selectedItem.productName}
          unitCost={selectedItem.unitCost}
        />
      )}
    </View>
  );
}
