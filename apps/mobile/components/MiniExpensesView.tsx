import { useState } from 'react';
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
import { miniSettlementsApi, type MiniExpenseSummary } from '../lib/api';
import { QK } from '../lib/query-keys';
import { Card } from './ui/Card';
import { EmptyState } from './ui/EmptyState';
import { MiniExpenseModal } from './forms/MiniExpenseModal';
import { formatDate, getErrorMessage } from '../lib/utils';
import { formatFcValue } from '../lib/currency';
import { useOfflineStore } from '../store/offline.store';
import { useT } from '../lib/i18n';

/**
 * Mini-employee expense history. Lists every expense the mini has recorded — both
 * pending (counted in the next handover) and already handed over — plus any still
 * queued offline. The single "+" entry point records a mini expense (FC), which
 * is what surfaces in the handover report. This replaces the owner/full-employee
 * expenses page for minis, whose `/expenses` endpoints they can't access.
 */
export function MiniExpensesView() {
  const t = useT();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const isOffline = useOfflineStore((s) => s.isOffline);
  const removeSyncedExpenses = useOfflineStore((s) => s.removeSyncedExpenses);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: QK.miniExpensesAll,
    queryFn: () => miniSettlementsApi.listAllExpenses(),
    enabled: !isOffline,
  });
  const expenses = (data as MiniExpenseSummary[] | undefined) ?? [];

  // Expenses recorded offline (queued, not yet synced to the server).
  const queued = useOfflineStore((s) => s.pendingExpenses).filter((e) => e.kind === 'mini');

  const catLabel = (c: string): string =>
    t.miniEmployee.expenseCat[c as keyof typeof t.miniEmployee.expenseCat] ?? c;

  // Total of everything the mini has spent (synced + queued), in FC.
  const totalFc =
    expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0) +
    queued.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => miniSettlementsApi.deleteExpense(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.miniExpensesAll });
      qc.invalidateQueries({ queryKey: QK.miniExpenses });
      qc.invalidateQueries({ queryKey: ['mini-settlements', 'handover-preview'] });
    },
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });

  const confirmDelete = (e: MiniExpenseSummary) => {
    // Handed-over expenses are part of a submitted settlement — not deletable.
    if (e.settlementId) return;
    Alert.alert(t.expenses.deleteConfirmTitle, t.expenses.deleteConfirmBody, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.expenses.deleteBtn, style: 'destructive', onPress: () => deleteMutation.mutate(e.id) },
    ]);
  };

  const StatusBadge = ({ label, tone }: { label: string; tone: 'pending' | 'done' | 'sync' }) => {
    const cls =
      tone === 'done'
        ? 'bg-emerald-100 dark:bg-emerald-900'
        : tone === 'sync'
          ? 'bg-blue-100 dark:bg-blue-900'
          : 'bg-amber-100 dark:bg-amber-900';
    const txt =
      tone === 'done'
        ? 'text-emerald-700 dark:text-emerald-300'
        : tone === 'sync'
          ? 'text-blue-700 dark:text-blue-300'
          : 'text-amber-700 dark:text-amber-300';
    return (
      <View className={`px-2 py-0.5 rounded-full ${cls}`}>
        <Text className={`text-[10px] font-bold uppercase tracking-wide ${txt}`}>{label}</Text>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-surface dark:bg-slate-900">
      <ScrollView
        contentContainerClassName="px-4 pt-4 pb-24"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} enabled={!isOffline} />}
      >
        {/* Total card */}
        <Card>
          <Text className="text-muted dark:text-slate-500 text-xs font-medium uppercase tracking-wide">
            {t.miniEmployee.expensesTotalSpent}
          </Text>
          <Text className="text-3xl font-bold text-text dark:text-slate-100 mt-1">{formatFcValue(totalFc)}</Text>
          <Text className="text-muted dark:text-slate-500 text-xs mt-1">
            {expenses.length + queued.length} {t.expenses.countLabel}
          </Text>
        </Card>

        {/* Queued offline — recorded but not yet synced */}
        {queued.length > 0 && (
          <Card className="mt-4 border border-blue-300 dark:border-blue-800">
            <Text className="text-blue-600 dark:text-blue-400 text-xs font-semibold uppercase tracking-wide mb-2">
              🔄 {t.expenses.pendingSyncLabel(queued.length)}
            </Text>
            {queued.map((e) => (
              <Pressable
                key={e.id}
                onLongPress={() => removeSyncedExpenses([e.id])}
                className="flex-row justify-between items-center py-1.5"
              >
                <View className="flex-1 pr-3">
                  <Text className="text-text dark:text-slate-200 text-sm">{catLabel(e.category)}</Text>
                  {e.description ? (
                    <Text className="text-muted dark:text-slate-400 text-xs" numberOfLines={1}>{e.description}</Text>
                  ) : null}
                </View>
                <View className="items-end gap-1">
                  <Text className="text-text dark:text-slate-100 font-semibold text-sm">{formatFcValue(e.amount)}</Text>
                  <StatusBadge label={t.miniEmployee.expenseStatusSyncing} tone="sync" />
                </View>
              </Pressable>
            ))}
          </Card>
        )}

        {/* Synced history */}
        <View className="mt-4">
          {isLoading ? (
            <View className="py-8 items-center">
              <ActivityIndicator />
            </View>
          ) : expenses.length === 0 && queued.length === 0 ? (
            <EmptyState title={t.miniEmployee.expensesEmpty} />
          ) : (
            expenses.map((e) => {
              const handedOver = !!e.settlementId;
              return (
                <Pressable
                  key={e.id}
                  onLongPress={() => confirmDelete(e)}
                  className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl px-4 py-3 mb-2"
                >
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1 pr-3">
                      <Text className="text-text dark:text-slate-100 font-semibold text-sm">{catLabel(e.category)}</Text>
                      {e.description ? (
                        <Text className="text-muted dark:text-slate-400 text-xs mt-0.5" numberOfLines={2}>
                          {e.description}
                        </Text>
                      ) : null}
                      <Text className="text-muted dark:text-slate-500 text-xs mt-1">{formatDate(e.createdAt)}</Text>
                    </View>
                    <View className="items-end gap-1">
                      <Text className="text-text dark:text-slate-100 font-bold text-base">{formatFcValue(e.amount)}</Text>
                      <StatusBadge
                        label={handedOver ? t.miniEmployee.expenseStatusHandedOver : t.miniEmployee.expenseStatusPending}
                        tone={handedOver ? 'done' : 'pending'}
                      />
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* FAB */}
      <Pressable
        onPress={() => setModalOpen(true)}
        className="absolute right-5 bottom-6 bg-primary rounded-full w-14 h-14 items-center justify-center shadow-lg"
        style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.92 : 1 }] })}
      >
        <Text className="text-white text-3xl leading-7">+</Text>
      </Pressable>

      <MiniExpenseModal visible={modalOpen} onClose={() => setModalOpen(false)} />
    </View>
  );
}
