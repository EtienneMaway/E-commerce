import { useMemo, useState } from 'react';
import { View, Text, Modal, ScrollView, Alert, TouchableOpacity, Pressable } from 'react-native';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  expensesApi,
} from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../lib/utils';
import { useOfflineStore } from '../../store/offline.store';
import { useT } from '../../lib/i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function AddExpenseModal({ visible, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const isOffline = useOfflineStore((s) => s.isOffline);
  const recordOfflineNormalExpense = useOfflineStore((s) => s.recordOfflineNormalExpense);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [visible]);

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('TRANSPORT');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(today);

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      expensesApi.create({
        amount,
        currency: 'FC',
        category,
        description: description.trim() || undefined,
        date: date ? new Date(date).toISOString() : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: QK.dashboardAll });
      setAmount('');
      setDescription('');
      onClose();
    },
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });

  const handleSubmit = () => {
    const n = parseFloat(amount);
    if (!amount || isNaN(n) || n <= 0) {
      Alert.alert(t.common.error, t.expenses.amountRequiredMsg);
      return;
    }
    if (date && date > today) {
      Alert.alert(t.common.error, t.expenses.futureDateMsg);
      return;
    }
    // Offline → queue for sync (synced alongside sales); online → submit now.
    if (isOffline) {
      recordOfflineNormalExpense(
        amount,
        'FC',
        category,
        description.trim() || undefined,
        date ? new Date(date).toISOString() : undefined,
      );
      setAmount('');
      setDescription('');
      onClose();
      Alert.alert('✅', t.expenses.queuedOffline);
      return;
    }
    mutate();
  };

  const catLabel = (c: ExpenseCategory): string =>
    (t.expenses as unknown as Record<string, string>)[`cat${c}`] ?? c;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView
        className="flex-1 bg-surface dark:bg-slate-900"
        contentContainerClassName="px-6 py-8"
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-xl font-bold text-text dark:text-slate-100">{t.expenses.addBtn}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text className="text-primary font-medium">{t.common.cancel}</Text>
          </TouchableOpacity>
        </View>

        <View className="mb-4">
          <Text className="text-sm font-medium text-text dark:text-slate-100 mb-1.5">
            {t.expenses.amount} (FC)
          </Text>
          <Input
            label=""
            value={amount}
            onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ''))}
            placeholder="0"
            keyboardType="number-pad"
          />
        </View>

        <View className="mb-4">
          <Text className="text-sm font-medium text-text dark:text-slate-100 mb-1.5">
            {t.expenses.category}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {EXPENSE_CATEGORIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
                className={`px-3 py-2 rounded-full border ${
                  category === c
                    ? 'bg-primary border-primary'
                    : 'bg-card dark:bg-slate-800 border-border dark:border-slate-700'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    category === c ? 'text-white' : 'text-muted dark:text-slate-300'
                  }`}
                >
                  {catLabel(c)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Input
          label={t.expenses.date}
          value={date}
          onChangeText={(v) => setDate(v && v > today ? today : v)}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />

        <View className="mb-4">
          <Text className="text-sm font-medium text-text dark:text-slate-100 mb-1.5">
            {t.expenses.description}
          </Text>
          <Input
            label=""
            value={description}
            onChangeText={setDescription}
            placeholder={t.expenses.descriptionPlaceholder}
            multiline
            numberOfLines={3}
          />
        </View>

        <Button
          label={isPending ? t.expenses.submitting : t.expenses.submit}
          onPress={handleSubmit}
          loading={isPending}
          className="mt-2"
        />
      </ScrollView>
    </Modal>
  );
}
