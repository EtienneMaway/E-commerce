import { useState } from 'react';
import { Modal, ScrollView, View, Text, TouchableOpacity, Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  miniSettlementsApi,
  MINI_EXPENSE_CATEGORIES,
  type MiniExpenseAllowance,
} from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { formatFcValue } from '../../lib/currency';
import { useOfflineStore } from '../../store/offline.store';
import { computeOfflineAllowance } from '../../lib/mini-allowance';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Mini-employee records an expense (in FC) incurred while selling. It stays
 * pending until their next handover, where it's deducted from the cash and
 * booked as the owner's business expense. Works offline — queued and synced
 * alongside sales.
 */
export function MiniExpenseModal({ visible, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const isOffline = useOfflineStore((s) => s.isOffline);
  const recordOfflineExpense = useOfflineStore((s) => s.recordOfflineExpense);
  const offline = useOfflineStore();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>('TRANSPORT');
  const [description, setDescription] = useState('');

  // What the employer still lets them spend this round — a share of what they
  // have sold, so it climbs as they sell. The API enforces it; showing it here
  // means they find out before typing an amount, not after submitting.
  const { data: allowanceData } = useQuery({
    queryKey: QK.miniExpenseAllowance,
    queryFn: miniSettlementsApi.expenseAllowance,
    enabled: visible && !isOffline,
    staleTime: 10_000,
  });
  // Offline the same ceiling still applies, recomputed from the snapshot taken
  // at go-offline plus the queue since — offline sales raise the budget, offline
  // expenses consume it.
  const offlineAllowance = isOffline
    ? computeOfflineAllowance({
        snapshot: offline.allowanceSnapshot,
        cachedProducts: offline.cachedProducts,
        pendingSales: offline.pendingSales,
        pendingExpenses: offline.pendingExpenses,
        snapshotRate: offline.snapshotRate,
      })
    : null;
  const allowance = isOffline
    ? offlineAllowance ?? undefined
    : (allowanceData as MiniExpenseAllowance | undefined);
  const remainingFc = allowance ? parseFloat(allowance.remainingFc) : null;
  const typed = parseInt(amount, 10) || 0;
  const overBudget = remainingFc !== null && typed > remainingFc;

  const reset = () => {
    setAmount('');
    setCategory('TRANSPORT');
    setDescription('');
  };

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      miniSettlementsApi.createExpense({
        amount: (parseInt(amount, 10) || 0).toString(),
        category,
        description: description.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.miniExpenses });
      qc.invalidateQueries({ queryKey: QK.miniExpensesAll });
      qc.invalidateQueries({ queryKey: ['mini-settlements', 'handover-preview'] });
      qc.invalidateQueries({ queryKey: ['mini-settlements', 'stats'] });
      qc.invalidateQueries({ queryKey: QK.miniExpenseAllowance });
      reset();
      onClose();
    },
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });

  const handleSubmit = () => {
    if (!(parseInt(amount, 10) > 0)) {
      Alert.alert(t.common.error, t.miniEmployee.expenseInvalidAmount);
      return;
    }
    // The ceiling is enforced offline too, so an expense that would break it is
    // refused now rather than queueing up to fail when the queue drains.
    if (overBudget) {
      Alert.alert(t.common.error, t.miniEmployee.expenseOverBudget(formatFcValue(remainingFc ?? 0)));
      return;
    }
    // Offline → queue for sync; online → submit now.
    if (isOffline) {
      recordOfflineExpense(String(parseInt(amount, 10)), category, description.trim() || undefined);
      reset();
      onClose();
      Alert.alert('✅', t.miniEmployee.expenseQueued);
      return;
    }
    mutate();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView className="flex-1 bg-surface dark:bg-slate-900" contentContainerClassName="px-6 py-8" keyboardShouldPersistTaps="handled">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-xl font-bold text-text dark:text-slate-100">{t.miniEmployee.expenseTitle}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text className="text-primary font-medium">{t.common.cancel}</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-muted dark:text-slate-500 text-sm mb-5">{t.miniEmployee.expenseSubtitle}</Text>

        {allowance && (
          <View className="bg-primary/10 border border-primary/30 rounded-2xl px-4 py-3 mb-4">
            <View className="flex-row justify-between">
              <Text className="text-muted dark:text-slate-400 text-sm">
                {t.miniEmployee.expenseAllowanceLeft}
              </Text>
              <Text className="text-text dark:text-slate-100 font-bold">
                {formatFcValue(allowance.remainingFc)}
              </Text>
            </View>
            <Text className="text-muted dark:text-slate-500 text-xs mt-1">
              {t.miniEmployee.expenseAllowanceHint(
                allowance.pct,
                formatFcValue(allowance.soldFc),
              )}
            </Text>
          </View>
        )}

        <Input
          label={t.miniEmployee.expenseAmount}
          value={amount}
          onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ''))}
          placeholder="0"
          keyboardType="number-pad"
        />

        <Text className="text-xs font-medium mb-1 mt-2 text-text dark:text-slate-300">{t.miniEmployee.expenseCategory}</Text>
        <View className="flex-row flex-wrap gap-2 mb-3">
          {MINI_EXPENSE_CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-lg border ${category === c ? 'bg-primary border-primary' : 'border-border dark:border-slate-700'}`}
            >
              <Text className={`text-xs font-medium ${category === c ? 'text-white' : 'text-text dark:text-slate-300'}`}>
                {t.miniEmployee.expenseCat[c as keyof typeof t.miniEmployee.expenseCat]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Input
          label={t.miniEmployee.expenseNote}
          value={description}
          onChangeText={setDescription}
          placeholder={t.miniEmployee.expenseNotePlaceholder}
        />

        {overBudget && (
          <Text className="text-danger text-xs mt-2">
            {t.miniEmployee.expenseOverBudget(formatFcValue(remainingFc ?? 0))}
          </Text>
        )}

        <Button
          label={t.miniEmployee.expenseSubmit}
          onPress={handleSubmit}
          loading={isPending}
          disabled={overBudget}
          className="mt-3"
        />
      </ScrollView>
    </Modal>
  );
}
