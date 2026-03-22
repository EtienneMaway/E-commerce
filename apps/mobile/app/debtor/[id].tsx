import { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { formatDate } from '../../lib/utils';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { RecordDebtorPaymentModal } from '../../components/forms/RecordDebtorPaymentModal';

interface InventoryRow {
  id: string;
  productName: string;
  unitCost: string;
  sellingPrice: string;
  quantityOriginal: number;
  quantityRemaining: number;
  createdAt: string;
}

interface PaymentRow {
  id: string;
  amount: string;
  note: string | null;
  date: string;
  remainingBalance: string;
}

interface DebtorDetail {
  debtorUserId: string;
  debtorUsername: string;
  credit: {
    outstandingBalance: string;
    totalCreditGiven: string;
    totalReceived: string;
  };
  productsConsigned: InventoryRow[];
  payments: PaymentRow[];
}

type Section = 'products' | 'payments';

export default function DebtorDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [section, setSection] = useState<Section>('products');
  const [payModal, setPayModal] = useState(false);
  const formatCurrency = useFormatCurrency();
  const t = useT();

  const { data, isFetching, refetch } = useQuery({
    queryKey: QK.debtorDetail(id),
    queryFn: () => dashboardApi.debtorDetail(id),
    staleTime: 30_000,
    enabled: !!id,
  });

  const detail = data as DebtorDetail | undefined;

  if (isFetching && !detail) {
    return (
      <View className="flex-1 bg-surface dark:bg-slate-900 items-center justify-center">
        <ActivityIndicator color="#2563EB" />
      </View>
    );
  }

  if (!detail) {
    return (
      <View className="flex-1 bg-surface dark:bg-slate-900 items-center justify-center px-6">
        <EmptyState emoji="❓" title="Debtor not found" subtitle="This debtor could not be loaded." />
      </View>
    );
  }

  const balance = parseFloat(detail.credit.outstandingBalance);

  return (
    <View className="flex-1 bg-surface dark:bg-slate-900">
      {/* Header */}
      <View className="bg-card dark:bg-slate-800 border-b border-border dark:border-slate-700 px-6 pt-14 pb-4">
        <TouchableOpacity onPress={() => router.back()} className="mb-3">
          <Text className="text-primary font-medium">{t.common.back}</Text>
        </TouchableOpacity>
        <View className="flex-row justify-between items-start">
          <View>
            <Text className="text-2xl font-bold text-text dark:text-slate-100">@{detail.debtorUsername}</Text>
            <Text className="text-muted dark:text-slate-500 text-sm mt-0.5">Debtor</Text>
          </View>
          <TouchableOpacity
            onPress={() => setPayModal(true)}
            disabled={balance <= 0}
            className={`px-4 py-2 rounded-xl ${balance > 0 ? 'bg-success' : 'bg-slate-200 dark:bg-slate-700'}`}
          >
            <Text className={`font-semibold text-sm ${balance > 0 ? 'text-white' : 'text-muted dark:text-slate-500'}`}>{t.debtorDetail.recordPayment}</Text>
          </TouchableOpacity>
        </View>

        {/* Balance summary */}
        <View className="flex-row mt-4 gap-3">
          <View className="flex-1 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 rounded-xl px-3 py-2">
            <Text className="text-success text-xs">{t.debtorDetail.owesMe}</Text>
            <Text className="text-success font-bold text-lg">{formatCurrency(detail.credit.outstandingBalance)}</Text>
          </View>
          <View className="flex-1 bg-surface dark:bg-slate-900 border border-border dark:border-slate-700 rounded-xl px-3 py-2">
            <Text className="text-muted dark:text-slate-500 text-xs">{t.debtorDetail.totalGiven}</Text>
            <Text className="text-text dark:text-slate-100 font-bold text-lg">{formatCurrency(detail.credit.totalCreditGiven)}</Text>
          </View>
          <View className="flex-1 bg-surface dark:bg-slate-900 border border-border dark:border-slate-700 rounded-xl px-3 py-2">
            <Text className="text-muted dark:text-slate-500 text-xs">{t.debtorDetail.received}</Text>
            <Text className="text-text dark:text-slate-100 font-bold text-lg">{formatCurrency(detail.credit.totalReceived)}</Text>
          </View>
        </View>

        {/* Section toggle */}
        <View className="flex-row mt-4 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          <TouchableOpacity
            onPress={() => setSection('products')}
            className={`flex-1 py-2 rounded-lg items-center ${section === 'products' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''}`}
          >
            <Text className={`text-sm font-semibold ${section === 'products' ? 'text-text dark:text-slate-100' : 'text-muted dark:text-slate-500'}`}>
              {t.debtorDetail.products(detail.productsConsigned.length)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSection('payments')}
            className={`flex-1 py-2 rounded-lg items-center ${section === 'payments' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''}`}
          >
            <Text className={`text-sm font-semibold ${section === 'payments' ? 'text-text dark:text-slate-100' : 'text-muted dark:text-slate-500'}`}>
              {t.debtorDetail.payments(detail.payments.length)}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      {section === 'products' ? (
        <FlatList
          data={detail.productsConsigned}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#2563EB" />}
          contentContainerClassName="px-4 pt-4 pb-8"
          renderItem={({ item }) => (
            <View className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl p-4 mb-3">
              <View className="flex-row justify-between items-start mb-2">
                <Text className="text-text dark:text-slate-100 font-semibold flex-1 mr-2" numberOfLines={2}>
                  {item.productName.charAt(0).toUpperCase() + item.productName.slice(1)}
                </Text>
                <Badge label="Consigned" variant="consigned" />
              </View>
              <View className="flex-row justify-between">
                <View>
                  <Text className="text-muted dark:text-slate-500 text-xs">{t.debtorDetail.agreedPrice}</Text>
                  <Text className="text-text dark:text-slate-100 text-sm font-medium">{formatCurrency(item.sellingPrice)}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-muted dark:text-slate-500 text-xs">{t.debtorDetail.qty}</Text>
                  <Text className="text-text dark:text-slate-100 text-sm font-bold">{item.quantityOriginal}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-muted dark:text-slate-500 text-xs">{t.debtorDetail.value}</Text>
                  <Text className="text-success text-sm font-bold">
                    {formatCurrency((parseFloat(item.sellingPrice) * item.quantityOriginal).toFixed(2))}
                  </Text>
                </View>
              </View>
              <Text className="text-muted dark:text-slate-500 text-xs mt-1">{formatDate(item.createdAt)}</Text>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState emoji="📤" title={t.debtorDetail.noProducts} subtitle={t.debtorDetail.noProductsSub} />
          }
        />
      ) : (
        <FlatList
          data={detail.payments}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#2563EB" />}
          contentContainerClassName="px-4 pt-4 pb-8"
          renderItem={({ item }) => (
            <View className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl p-4 mb-3">
              <View className="flex-row justify-between items-center mb-1">
                <Text className="text-text dark:text-slate-100 font-semibold text-base">{formatCurrency(item.amount)}</Text>
                <Text className="text-muted dark:text-slate-500 text-xs">{formatDate(item.date)}</Text>
              </View>
              {item.note && <Text className="text-muted dark:text-slate-500 text-sm mb-1">{item.note}</Text>}
              <View className="flex-row justify-between">
                <Text className="text-muted dark:text-slate-500 text-xs">{t.debtorDetail.balanceAfter}</Text>
                <Text className={`text-xs font-bold ${parseFloat(item.remainingBalance) > 0 ? 'text-success' : 'text-muted dark:text-slate-500'}`}>
                  {formatCurrency(item.remainingBalance)}
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState emoji="💳" title={t.debtorDetail.noPayments} subtitle={t.debtorDetail.noPaymentsSub} />
          }
        />
      )}

      {/* Payment Modal */}
      <RecordDebtorPaymentModal
        visible={payModal}
        onClose={() => setPayModal(false)}
        debtorId={detail.debtorUserId}
        debtorUsername={detail.debtorUsername}
        outstandingBalance={detail.credit.outstandingBalance}
      />
    </View>
  );
}
