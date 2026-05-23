import { useMemo, useState } from 'react';
import { View, Text, Modal, ScrollView, Alert, TouchableOpacity, Pressable } from 'react-native';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseCurrency,
  currencyApi,
  expensesApi,
} from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function AddExpenseModal({ visible, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [visible]);

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<ExpenseCurrency>('USD');
  const [category, setCategory] = useState<ExpenseCategory>('TRANSPORT');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(today);

  const { data: rateData } = useQuery({
    queryKey: QK.exchangeRate,
    queryFn: currencyApi.getRate,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const buyingRate = rateData?.sellingRate ? parseFloat(rateData.sellingRate) : null;
  const showUsdWarning =
    currency === 'USD' && !!amount && parseFloat(amount) > 0 && !!buyingRate && buyingRate > 0;
  const fcDeducted = showUsdWarning ? parseFloat(amount) * (buyingRate as number) : null;

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      expensesApi.create({
        amount,
        currency,
        category,
        description: description.trim() || undefined,
        date: date ? new Date(date).toISOString() : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: QK.cashPosition });
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
            {t.expenses.amount}
          </Text>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Input label="" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />
            </View>
            <View className="flex-row bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl overflow-hidden h-[50px]">
              {(['USD', 'FC'] as const).map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCurrency(c)}
                  className={`px-4 justify-center ${currency === c ? 'bg-primary' : ''}`}
                >
                  <Text className={`font-bold text-xs ${currency === c ? 'text-white' : 'text-muted dark:text-slate-400'}`}>
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {showUsdWarning && fcDeducted !== null && (
          <View className="rounded-xl px-3 py-3 mb-4 bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700">
            <Text className="font-semibold text-amber-700 dark:text-amber-300 text-xs mb-1">
              ⚠ {t.expenses.usdBuyingRateWarningTitle}
            </Text>
            <Text className="text-amber-700 dark:text-amber-300 text-xs leading-5">
              {t.expenses.usdBuyingRateWarningBody(
                '$' +
                  new Intl.NumberFormat('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 4,
                  }).format(parseFloat(amount)),
                new Intl.NumberFormat('fr-CD').format(Math.round(fcDeducted)) + ' FC',
                new Intl.NumberFormat('en-US').format(buyingRate as number),
              )}
            </Text>
          </View>
        )}

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
