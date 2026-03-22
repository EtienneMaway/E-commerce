import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { externalContactsApi } from '../lib/api';
import { QK } from '../lib/query-keys';
import { useFormatCurrency } from '../lib/currency';
import { useT } from '../lib/i18n';
import { EmptyState } from '../components/ui/EmptyState';
import { CreateExternalContactModal } from '../components/forms/CreateExternalContactModal';

type RoleFilter = 'ALL' | 'DEBTOR' | 'SUPPLIER';

interface ExternalContact {
  id: string;
  name: string;
  phone: string | null;
  role: 'DEBTOR' | 'SUPPLIER' | 'BOTH';
  debtorBalance: string;
  supplierBalance: string;
}

function ContactCard({ item }: { item: ExternalContact }) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const isDebtor = item.role === 'DEBTOR' || item.role === 'BOTH';
  const isSupplier = item.role === 'SUPPLIER' || item.role === 'BOTH';

  const roleLabel: Record<string, string> = {
    DEBTOR: t.externalContacts.roleDebtor,
    SUPPLIER: t.externalContacts.roleSupplier,
    BOTH: t.externalContacts.roleBoth,
  };

  return (
    <TouchableOpacity
      onPress={() => router.push(`/external-contact/${item.id}`)}
      className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl p-4 mb-3"
      activeOpacity={0.85}
    >
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1 mr-3">
          <Text className="text-text dark:text-slate-100 font-semibold text-base">{item.name}</Text>
          {item.phone && (
            <Text className="text-muted dark:text-slate-500 text-xs mt-0.5">{item.phone}</Text>
          )}
        </View>
        <View className="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
          <Text className="text-muted dark:text-slate-400 text-xs font-medium">{roleLabel[item.role]}</Text>
        </View>
      </View>
      <View className="flex-row gap-4">
        {isDebtor && (
          <View>
            <Text className="text-muted dark:text-slate-500 text-xs">{t.externalContacts.debtorBalance}</Text>
            <Text className="text-success font-bold text-sm">{formatCurrency(item.debtorBalance)}</Text>
          </View>
        )}
        {isSupplier && (
          <View>
            <Text className="text-muted dark:text-slate-500 text-xs">{t.externalContacts.supplierBalance}</Text>
            <Text className="text-danger font-bold text-sm">{formatCurrency(item.supplierBalance)}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function ExternalContactsScreen() {
  const t = useT();
  const [filter, setFilter] = useState<RoleFilter>('ALL');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isFetching, refetch } = useQuery({
    queryKey: QK.externalContacts,
    queryFn: () => externalContactsApi.list(),
    staleTime: 30_000,
  });

  const contacts = (data as ExternalContact[] | undefined) ?? [];

  const filtered = contacts.filter((c) => {
    if (filter === 'ALL') return true;
    if (filter === 'DEBTOR') return c.role === 'DEBTOR' || c.role === 'BOTH';
    return c.role === 'SUPPLIER' || c.role === 'BOTH';
  });

  const filters: { key: RoleFilter; label: string }[] = [
    { key: 'ALL', label: t.externalContacts.tabAll },
    { key: 'DEBTOR', label: t.externalContacts.tabDebtors },
    { key: 'SUPPLIER', label: t.externalContacts.tabSuppliers },
  ];

  return (
    <View className="flex-1 bg-surface dark:bg-slate-900">
      {/* Filter tabs */}
      <View className="flex-row mx-4 mt-4 mb-3 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
        {filters.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            onPress={() => setFilter(key)}
            className={`flex-1 py-2 rounded-lg items-center ${filter === key ? 'bg-white dark:bg-slate-600 shadow-sm' : ''}`}
          >
            <Text className={`text-sm font-semibold ${filter === key ? 'text-text dark:text-slate-100' : 'text-muted dark:text-slate-500'}`}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ContactCard item={item} />}
        contentContainerClassName="px-4 pb-24"
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#2563EB" />}
        ListHeaderComponent={isFetching && contacts.length === 0 ? <ActivityIndicator className="mt-12" color="#2563EB" /> : null}
        ListEmptyComponent={
          !isFetching ? (
            <EmptyState emoji="👤" title={t.externalContacts.noContacts} subtitle={t.externalContacts.noContactsSub} />
          ) : null
        }
      />

      {/* FAB */}
      <TouchableOpacity
        onPress={() => setShowCreate(true)}
        className="absolute bottom-8 right-6 w-14 h-14 rounded-full bg-primary items-center justify-center shadow-lg"
        activeOpacity={0.85}
      >
        <Text className="text-white text-3xl font-light leading-none">+</Text>
      </TouchableOpacity>

      <CreateExternalContactModal visible={showCreate} onClose={() => setShowCreate(false)} />
    </View>
  );
}
