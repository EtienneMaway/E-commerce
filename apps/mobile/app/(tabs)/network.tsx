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
import { router } from 'expo-router';
import { dashboardApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import { EmptyState } from '../../components/ui/EmptyState';

type Tab = 'suppliers' | 'debtors';

interface SupplierRow {
  supplierUserId: string;
  supplierUsername: string;
  outstandingBalance: string;
  totalCreditReceived: string;
  totalPaid: string;
}

interface DebtorRow {
  debtorUserId: string;
  debtorUsername: string;
  outstandingBalance: string;
  totalCreditGiven: string;
  totalReceived: string;
}

function SupplierCard({ item }: { item: SupplierRow }) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  return (
    <Pressable
      onPress={() => router.push(`/supplier/${item.supplierUserId}`)}
      className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl p-4 mb-3"
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}
    >
      <View className="flex-row justify-between items-center mb-1.5">
        <Text className="text-text dark:text-slate-100 font-semibold text-base">@{item.supplierUsername}</Text>
        <Text className="text-danger font-bold text-base">{formatCurrency(item.outstandingBalance)}</Text>
      </View>
      <View className="flex-row justify-between">
        <Text className="text-muted dark:text-slate-500 text-sm">{t.network.totalReceived} {formatCurrency(item.totalCreditReceived)}</Text>
        <Text className="text-muted dark:text-slate-500 text-sm">{t.network.paid} {formatCurrency(item.totalPaid)}</Text>
      </View>
    </Pressable>
  );
}

function DebtorCard({ item }: { item: DebtorRow }) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  return (
    <Pressable
      onPress={() => router.push(`/debtor/${item.debtorUserId}`)}
      className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl p-4 mb-3"
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}
    >
      <View className="flex-row justify-between items-center mb-1.5">
        <Text className="text-text dark:text-slate-100 font-semibold text-base">@{item.debtorUsername}</Text>
        <Text className="text-success font-bold text-base">{formatCurrency(item.outstandingBalance)}</Text>
      </View>
      <View className="flex-row justify-between">
        <Text className="text-muted dark:text-slate-500 text-sm">{t.network.totalGiven} {formatCurrency(item.totalCreditGiven)}</Text>
        <Text className="text-muted dark:text-slate-500 text-sm">{t.network.received} {formatCurrency(item.totalReceived)}</Text>
      </View>
    </Pressable>
  );
}

function ExternalContactsBanner() {
  const t = useT();
  return (
    <Pressable
      onPress={() => router.push('/external-contacts')}
      className="mx-4 mb-3 bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl px-4 py-3 flex-row items-center justify-between"
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
    >
      <View className="flex-row items-center gap-3">
        <Text className="text-xl">👤</Text>
        <View>
          <Text className="text-text dark:text-slate-100 font-semibold text-base">{t.externalContacts.screenTitle}</Text>
          <Text className="text-muted dark:text-slate-500 text-sm">{t.externalContacts.noContactsSub.slice(0, 40)}…</Text>
        </View>
      </View>
      <Text className="text-primary text-lg">›</Text>
    </Pressable>
  );
}

export default function NetworkScreen() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('suppliers');
  const formatCurrency = useFormatCurrency();

  const { data: suppliers, isFetching: suppliersLoading, refetch: refetchSuppliers } = useQuery({
    queryKey: QK.suppliers,
    queryFn: () => dashboardApi.suppliers(),
    staleTime: 30_000,
  });

  const { data: debtors, isFetching: debtorsLoading, refetch: refetchDebtors } = useQuery({
    queryKey: QK.debtors,
    queryFn: () => dashboardApi.debtors(),
    staleTime: 30_000,
  });

  const supplierList = (suppliers as SupplierRow[] | undefined) ?? [];
  const debtorList = (debtors as DebtorRow[] | undefined) ?? [];

  const isLoading = tab === 'suppliers' ? suppliersLoading : debtorsLoading;
  const refetch = tab === 'suppliers' ? refetchSuppliers : refetchDebtors;

  return (
    <View className="flex-1 bg-surface dark:bg-slate-900">
      {/* External contacts entry */}
      <ExternalContactsBanner />

      {/* Segmented control */}
      <View className="flex-row mx-4 mt-4 mb-3 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
        <TouchableOpacity
          onPress={() => setTab('suppliers')}
          className={`flex-1 py-2 rounded-lg items-center ${tab === 'suppliers' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''}`}
        >
          <Text className={`text-sm font-semibold ${tab === 'suppliers' ? 'text-text dark:text-slate-100' : 'text-muted dark:text-slate-500'}`}>
            {t.network.suppliers(supplierList.length)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('debtors')}
          className={`flex-1 py-2 rounded-lg items-center ${tab === 'debtors' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''}`}
        >
          <Text className={`text-sm font-semibold ${tab === 'debtors' ? 'text-text dark:text-slate-100' : 'text-muted dark:text-slate-500'}`}>
            {t.network.debtors(debtorList.length)}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Summary row */}
      {tab === 'suppliers' && supplierList.length > 0 && (
        <View className="mx-4 mb-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-2.5">
          <Text className="text-danger text-sm font-medium">
            {t.network.totalOwedToSuppliers}{' '}
            <Text className="font-bold">
              {formatCurrency(
                supplierList.reduce((s, x) => s + parseFloat(x.outstandingBalance), 0).toFixed(2),
              )}
            </Text>
          </Text>
        </View>
      )}
      {tab === 'debtors' && debtorList.length > 0 && (
        <View className="mx-4 mb-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 rounded-xl px-4 py-2.5">
          <Text className="text-success text-sm font-medium">
            {t.network.totalOwedToYou}{' '}
            <Text className="font-bold">
              {formatCurrency(
                debtorList.reduce((s, x) => s + parseFloat(x.outstandingBalance), 0).toFixed(2),
              )}
            </Text>
          </Text>
        </View>
      )}

      {/* List */}
      {tab === 'suppliers' ? (
        <FlatList
          data={supplierList}
          keyExtractor={(item) => item.supplierUserId}
          renderItem={({ item }) => <SupplierCard item={item} />}
          contentContainerClassName="px-4 pb-8"
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#2563EB" />}
          ListHeaderComponent={isLoading && supplierList.length === 0 ? <ActivityIndicator className="mt-12" color="#2563EB" /> : null}
          ListEmptyComponent={
            !suppliersLoading ? (
              <EmptyState emoji="🤝" title={t.network.noSuppliers} subtitle={t.network.noSuppliersSub} />
            ) : null
          }
        />
      ) : (
        <FlatList
          data={debtorList}
          keyExtractor={(item) => item.debtorUserId}
          renderItem={({ item }) => <DebtorCard item={item} />}
          contentContainerClassName="px-4 pb-8"
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#2563EB" />}
          ListHeaderComponent={isLoading && debtorList.length === 0 ? <ActivityIndicator className="mt-12" color="#2563EB" /> : null}
          ListEmptyComponent={
            !debtorsLoading ? (
              <EmptyState emoji="📤" title={t.network.noDebtors} subtitle={t.network.noDebtorsSub} />
            ) : null
          }
        />
      )}
    </View>
  );
}
