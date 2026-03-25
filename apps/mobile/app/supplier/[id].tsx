import { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Linking } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { formatDate } from '../../lib/utils';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { PaySupplierModal } from '../../components/forms/PaySupplierModal';

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
  remainingBalance: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface SupplierDetail {
  supplierUserId: string;
  supplierUsername: string;
  supplierEmail: string | null;
  supplierPhone: string | null;
  debt: {
    outstandingBalance: string;
    totalCreditReceived: string;
    totalPaid: string;
  };
  productsReceived: InventoryRow[];
  payments: PaymentRow[];
}

type Section = 'products' | 'payments';

export default function SupplierDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [section, setSection] = useState<Section>('products');
  const [payModal, setPayModal] = useState(false);
  const formatCurrency = useFormatCurrency();
  const t = useT();

  const { data, isFetching, refetch } = useQuery({
    queryKey: QK.supplierDetail(id),
    queryFn: () => dashboardApi.supplierDetail(id),
    staleTime: 30_000,
    enabled: !!id,
  });

  const detail = data as SupplierDetail | undefined;

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
        <EmptyState emoji="❓" title="Supplier not found" subtitle="This supplier could not be loaded." />
      </View>
    );
  }

  const balance = parseFloat(detail.debt.outstandingBalance);
  const hasPendingPayment = detail.payments.some((p) => p.status === 'PENDING');

  return (
    <View className="flex-1 bg-surface dark:bg-slate-900">
      {/* Header */}
      <View className="bg-card dark:bg-slate-800 border-b border-border dark:border-slate-700 px-6 pt-14 pb-4">
        <TouchableOpacity onPress={() => router.back()} className="mb-3">
          <Text className="text-primary font-medium">{t.common.back}</Text>
        </TouchableOpacity>
        <View className="flex-row justify-between items-start">
          <View className="flex-1 mr-3">
            <Text className="text-2xl font-bold text-text dark:text-slate-100">@{detail.supplierUsername}</Text>
            <Text className="text-muted dark:text-slate-500 text-sm mt-0.5">Supplier</Text>
            {(detail.supplierEmail || detail.supplierPhone) && (
              <View className="mt-2 gap-1">
                {detail.supplierEmail && (
                  <Text className="text-muted dark:text-slate-400 text-sm">✉️ {detail.supplierEmail}</Text>
                )}
                {detail.supplierPhone && (
                  <TouchableOpacity onPress={() => void Linking.openURL(`tel:${detail.supplierPhone}`)}>
                    <Text className="text-primary text-sm font-medium">📞 {detail.supplierPhone}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
          <TouchableOpacity
            onPress={() => setPayModal(true)}
            disabled={balance <= 0 || hasPendingPayment}
            className={`px-4 py-2 rounded-xl ${balance > 0 && !hasPendingPayment ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'}`}
          >
            <Text className={`font-semibold text-sm ${balance > 0 && !hasPendingPayment ? 'text-white' : 'text-muted dark:text-slate-500'}`}>{t.supplierDetail.pay}</Text>
          </TouchableOpacity>
        </View>

        {/* Balance summary */}
        <View className="flex-row mt-4 gap-3">
          <View className="flex-1 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-3 py-2">
            <Text className="text-danger text-xs">{t.supplierDetail.iOwe}</Text>
            <Text className="text-danger font-bold text-lg">{formatCurrency(detail.debt.outstandingBalance)}</Text>
          </View>
          <View className="flex-1 bg-surface dark:bg-slate-900 border border-border dark:border-slate-700 rounded-xl px-3 py-2">
            <Text className="text-muted dark:text-slate-500 text-xs">{t.supplierDetail.totalReceived}</Text>
            <Text className="text-text dark:text-slate-100 font-bold text-lg">{formatCurrency(detail.debt.totalCreditReceived)}</Text>
          </View>
          <View className="flex-1 bg-surface dark:bg-slate-900 border border-border dark:border-slate-700 rounded-xl px-3 py-2">
            <Text className="text-muted dark:text-slate-500 text-xs">{t.supplierDetail.totalPaid}</Text>
            <Text className="text-text dark:text-slate-100 font-bold text-lg">{formatCurrency(detail.debt.totalPaid)}</Text>
          </View>
        </View>

        {/* Pending payment warning */}
        {hasPendingPayment && (
          <View className="mt-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2.5 flex-row items-start gap-2">
            <Text style={{ fontSize: 14 }}>⏳</Text>
            <Text className="text-amber-700 dark:text-amber-300 text-sm flex-1">{t.supplierDetail.pendingPaymentWarning}</Text>
          </View>
        )}

        {/* Section toggle */}
        <View className="flex-row mt-4 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          <TouchableOpacity
            onPress={() => setSection('products')}
            className={`flex-1 py-2 rounded-lg items-center ${section === 'products' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''}`}
          >
            <Text className={`text-sm font-semibold ${section === 'products' ? 'text-text dark:text-slate-100' : 'text-muted dark:text-slate-500'}`}>
              {t.supplierDetail.products(detail.productsReceived.length)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSection('payments')}
            className={`flex-1 py-2 rounded-lg items-center ${section === 'payments' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''}`}
          >
            <Text className={`text-sm font-semibold ${section === 'payments' ? 'text-text dark:text-slate-100' : 'text-muted dark:text-slate-500'}`}>
              {t.supplierDetail.payments(detail.payments.length)}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      {section === 'products' ? (
        <FlatList
          data={detail.productsReceived}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#2563EB" />}
          contentContainerClassName="px-4 pt-4 pb-8"
          renderItem={({ item }) => {
            const isLowStock = item.quantityRemaining <= 5;
            return (
              <View className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl p-4 mb-3">
                <View className="flex-row justify-between items-start mb-2">
                  <Text className="text-text dark:text-slate-100 font-semibold flex-1 mr-2" numberOfLines={2}>
                    {item.productName.charAt(0).toUpperCase() + item.productName.slice(1)}
                  </Text>
                  <Badge label={t.inventory.badgeSupplier} variant="supplier" />
                </View>
                <View className="flex-row justify-between">
                  <View>
                    <Text className="text-muted dark:text-slate-500 text-xs">{t.supplierDetail.costSell}</Text>
                    <Text className="text-text dark:text-slate-100 text-sm">{formatCurrency(item.unitCost)} · {formatCurrency(item.sellingPrice)}</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-muted dark:text-slate-500 text-xs">{t.supplierDetail.remainingOriginal}</Text>
                    <Text className={`text-sm font-bold ${isLowStock ? 'text-danger' : 'text-text dark:text-slate-100'}`}>
                      {item.quantityRemaining} / {item.quantityOriginal}
                    </Text>
                  </View>
                </View>
                <Text className="text-muted dark:text-slate-500 text-xs mt-1">{formatDate(item.createdAt)}</Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState emoji="📦" title={t.supplierDetail.noProducts} subtitle={t.supplierDetail.noProductsSub} />
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
                <Badge
                  variant={item.status === 'PENDING' ? 'pending' : item.status === 'REJECTED' ? 'rejected' : 'approved'}
                  label={item.status === 'PENDING' ? t.supplierDetail.statusPending : item.status === 'REJECTED' ? t.supplierDetail.statusRejected : t.supplierDetail.statusApproved}
                />
              </View>
              <Text className="text-muted dark:text-slate-500 text-xs mb-1">{formatDate(item.date)}</Text>
              {item.note && <Text className="text-muted dark:text-slate-500 text-sm mb-1">{item.note}</Text>}
              {item.remainingBalance !== null && (
                <View className="flex-row justify-between">
                  <Text className="text-muted dark:text-slate-500 text-xs">{t.supplierDetail.balanceAfter}</Text>
                  <Text className={`text-xs font-bold ${parseFloat(item.remainingBalance) > 0 ? 'text-danger' : 'text-success'}`}>
                    {formatCurrency(item.remainingBalance)}
                  </Text>
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={
            <EmptyState emoji="💳" title={t.supplierDetail.noPayments} subtitle={t.supplierDetail.noPaymentsSub} />
          }
        />
      )}

      {/* Pay Modal */}
      <PaySupplierModal
        visible={payModal}
        onClose={() => setPayModal(false)}
        supplierId={detail.supplierUserId}
        supplierUsername={detail.supplierUsername}
        outstandingBalance={detail.debt.outstandingBalance}
      />
    </View>
  );
}
