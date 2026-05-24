import { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  expensesApi,
  dashboardApi,
  currencyApi,
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseListParams,
  type ExpenseListResponse,
  type ExpensePeriod,
} from '../lib/api';
import { QK } from '../lib/query-keys';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { AddExpenseModal } from '../components/forms/AddExpenseModal';
import { formatDate, getErrorMessage } from '../lib/utils';
import { useT } from '../lib/i18n';

type FilterKey = 'all' | 'today' | 'week' | 'month' | 'lastN';

const PAGE_SIZE = 20;

export default function ExpensesScreen() {
  const t = useT();
  const qc = useQueryClient();

  const [filter, setFilter] = useState<FilterKey>('month');
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | ''>('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const listParams = useMemo<ExpenseListParams>(() => {
    const p: ExpenseListParams = { page, limit: PAGE_SIZE };
    if (categoryFilter) p.category = categoryFilter;
    if (filter === 'lastN') {
      p.period = 'lastNDays';
      p.days = 7;
    } else if (filter !== 'all') {
      p.period = filter as ExpensePeriod;
    }
    return p;
  }, [filter, categoryFilter, page]);

  const { data: listData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: QK.expenses(listParams),
    queryFn: () => expensesApi.list(listParams),
  });

  const { data: cash } = useQuery({
    queryKey: QK.cashPosition,
    queryFn: dashboardApi.cashPosition,
  });

  const { data: rate } = useQuery({
    queryKey: QK.exchangeRate,
    queryFn: currencyApi.getRate,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const buyingRate = rate?.sellingRate ? parseFloat(rate.sellingRate) : null;

  // FC value of an expense at the Current Market Rate — the realistic amount
  // of FC drained from the till for the booked USD-equivalent. Mirrors the
  // dashboard's `fmtExpenseUsdAtBuyingRate`, restricted to FC display since
  // mobile always renders FC.
  const fmtAtBuyingRate = (value: string | number): string => {
    const usd = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(usd)) return '—';
    if (!buyingRate || buyingRate <= 0) {
      const truncated = Math.trunc(usd * 10000) / 10000;
      return (
        '$' +
        new Intl.NumberFormat('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        }).format(truncated)
      );
    }
    const fc = Math.floor(usd * buyingRate);
    return new Intl.NumberFormat('fr-CD').format(fc) + ' FC';
  };

  // Reset to page 1 when filters change.
  useMemo(() => setPage(1), [filter, categoryFilter]);

  const list: ExpenseListResponse =
    listData ?? {
      data: [],
      totals: { totalAmountUsd: '0.0000', byCategory: [], count: 0 },
      pagination: { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 },
    };

  const catLabel = (c: ExpenseCategory): string =>
    (t.expenses as unknown as Record<string, string>)[`cat${c}`] ?? c;

  const filterTabs: { key: FilterKey; label: string }[] = [
    { key: 'today', label: t.expenses.filterToday },
    { key: 'week', label: t.expenses.filterWeek },
    { key: 'month', label: t.expenses.filterMonth },
    { key: 'lastN', label: t.expenses.filterLastN.replace('{n}', '7') },
    { key: 'all', label: t.expenses.filterAll },
  ];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => expensesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: QK.cashPosition });
    },
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });

  const confirmDelete = (id: string) => {
    Alert.alert(t.expenses.deleteConfirmTitle, t.expenses.deleteConfirmBody, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.expenses.deleteBtn, style: 'destructive', onPress: () => deleteMutation.mutate(id) },
    ]);
  };

  return (
    <View className="flex-1 bg-surface dark:bg-slate-900">
      <ScrollView
        contentContainerClassName="px-4 pt-4 pb-24"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {/* Total card */}
        <Card>
          <Text className="text-muted dark:text-slate-500 text-xs font-medium uppercase tracking-wide">
            {t.expenses.totalLabel}
          </Text>
          <Text className="text-3xl font-bold text-text dark:text-slate-100 mt-1">
            {fmtAtBuyingRate(
              cash?.totalExpensesAtBuyingRate ?? cash?.totalExpenses ?? '0',
            )}
          </Text>
          <Text className="text-muted dark:text-slate-500 text-xs mt-1">
            {list.totals.count} {t.expenses.countLabel}
          </Text>
        </Card>

        {/* Period filter chips */}
        <View className="mt-4">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
            <View className="flex-row gap-2 px-1">
              {filterTabs.map((tab) => (
                <Pressable
                  key={tab.key}
                  onPress={() => setFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-full border ${
                    filter === tab.key
                      ? 'bg-primary border-primary'
                      : 'bg-card dark:bg-slate-800 border-border dark:border-slate-700'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      filter === tab.key ? 'text-white' : 'text-muted dark:text-slate-300'
                    }`}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Category filter chips */}
        <View className="mt-3">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
            <View className="flex-row gap-2 px-1">
              <Pressable
                onPress={() => setCategoryFilter('')}
                className={`px-3 py-1.5 rounded-full border ${
                  categoryFilter === ''
                    ? 'bg-primary border-primary'
                    : 'bg-card dark:bg-slate-800 border-border dark:border-slate-700'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    categoryFilter === '' ? 'text-white' : 'text-muted dark:text-slate-300'
                  }`}
                >
                  {t.expenses.filterAllCategories}
                </Text>
              </Pressable>
              {EXPENSE_CATEGORIES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCategoryFilter(c)}
                  className={`px-3 py-1.5 rounded-full border ${
                    categoryFilter === c
                      ? 'bg-primary border-primary'
                      : 'bg-card dark:bg-slate-800 border-border dark:border-slate-700'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      categoryFilter === c ? 'text-white' : 'text-muted dark:text-slate-300'
                    }`}
                  >
                    {catLabel(c)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* By-category breakdown */}
        {list.totals.byCategory.length > 0 && (
          <Card className="mt-4">
            <Text className="text-muted dark:text-slate-500 text-xs font-medium uppercase tracking-wide mb-2">
              {t.expenses.byCategory}
            </Text>
            {list.totals.byCategory.map((c) => (
              <View key={c.category} className="flex-row justify-between py-1.5">
                <Text className="text-text dark:text-slate-200 text-sm">{catLabel(c.category)}</Text>
                <Text className="text-text dark:text-slate-100 font-semibold text-sm">
                  {fmtAtBuyingRate(c.totalUsd)}
                </Text>
              </View>
            ))}
          </Card>
        )}

        {/* List */}
        <View className="mt-4">
          {isLoading ? (
            <View className="py-8 items-center">
              <ActivityIndicator />
            </View>
          ) : list.data.length === 0 ? (
            <EmptyState title={t.expenses.noExpenses} />
          ) : (
            list.data.map((e) => (
              <Pressable
                key={e.id}
                onLongPress={() => confirmDelete(e.id)}
                className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl px-4 py-3 mb-2"
              >
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 pr-3">
                    <Text className="text-text dark:text-slate-100 font-semibold text-sm">
                      {catLabel(e.category)}
                    </Text>
                    {e.description ? (
                      <Text className="text-muted dark:text-slate-400 text-xs mt-0.5" numberOfLines={2}>
                        {e.description}
                      </Text>
                    ) : null}
                    <Text className="text-muted dark:text-slate-500 text-xs mt-1">
                      {formatDate(e.date)}
                      {e.actor ? ` · @${e.actor.username}` : ''}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-text dark:text-slate-100 font-bold text-base">
                      {fmtAtBuyingRate(e.amountUsd)}
                    </Text>
                    <Text className="text-muted dark:text-slate-500 text-xs">
                      {e.currency === 'USD'
                        ? `$${e.amount}`
                        : `${new Intl.NumberFormat('fr-CD').format(parseFloat(e.amount))} FC`}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))
          )}
        </View>

        {/* Pagination */}
        {list.pagination.totalPages > 1 && (
          <View className="flex-row justify-between items-center mt-4">
            <Button
              label="‹"
              variant="outline"
              disabled={page <= 1}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
            />
            <Text className="text-muted dark:text-slate-400 text-sm">
              {list.pagination.page} / {list.pagination.totalPages}
            </Text>
            <Button
              label="›"
              variant="outline"
              disabled={page >= list.pagination.totalPages}
              onPress={() => setPage((p) => Math.min(list.pagination.totalPages, p + 1))}
            />
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <Pressable
        onPress={() => setModalOpen(true)}
        className="absolute right-5 bottom-6 bg-primary rounded-full w-14 h-14 items-center justify-center shadow-lg"
        style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.92 : 1 }] })}
      >
        <Text className="text-white text-3xl leading-7">+</Text>
      </Pressable>

      <AddExpenseModal visible={modalOpen} onClose={() => setModalOpen(false)} />
    </View>
  );
}
