import { useState } from 'react';
import { View, Text, Modal, ScrollView, Alert, TouchableOpacity, TextInput } from 'react-native';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { paymentsApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../lib/utils';
import { useFormatCurrency, useExchangeRate } from '../../lib/currency';
import { useT } from '../../lib/i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
  debtorId: string;
  debtorUsername: string;
  outstandingBalance: string;
}

export function RecordDebtorPaymentModal({ visible, onClose, debtorId, debtorUsername, outstandingBalance }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const rate = useExchangeRate();
  const [amountFc, setAmountFc] = useState('');
  const [note, setNote] = useState('');

  // Effective amount is capped at the outstanding balance
  const balance = parseFloat(outstandingBalance) || 0;
  const r = parseFloat(rate) || 1;
  const parsedFc = parseFloat(amountFc) || 0;
  const parsedUsd = parsedFc / r;
  const effectiveUsd = Math.min(parsedUsd, balance);
  const excessFc = Math.max(0, Math.round((parsedUsd - balance) * r));
  const hasExcess = parsedFc > 0 && excessFc > 0;

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      paymentsApi.recordDebtorPayment({
        debtorUserId: debtorId,
        amount: effectiveUsd.toFixed(2),
        note: note || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.debtorDetail(debtorId) });
      qc.invalidateQueries({ queryKey: QK.debtors });
      qc.invalidateQueries({ queryKey: QK.dashboard });
      setAmountFc('');
      setNote('');
      onClose();
    },
    onError: (err) => Alert.alert('Error', getErrorMessage(err)),
  });

  const handleSubmit = () => {
    if (!amountFc || isNaN(parsedFc) || parsedFc <= 0) {
      Alert.alert(t.common.invalidAmount, t.recordDebtorPaymentModal.invalidAmountMsg);
      return;
    }
    // effectiveUsd is already capped — submit regardless of excess
    mutate();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView className="flex-1 bg-surface dark:bg-slate-900" contentContainerClassName="px-6 py-8" keyboardShouldPersistTaps="handled">
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-xl font-bold text-text dark:text-slate-100">{t.recordDebtorPaymentModal.title}</Text>
          <TouchableOpacity onPress={onClose}><Text className="text-primary font-medium">{t.common.cancel}</Text></TouchableOpacity>
        </View>

        <View className="bg-surface dark:bg-slate-900 border border-border dark:border-slate-700 rounded-xl p-4 mb-5">
          <Text className="text-muted dark:text-slate-500 text-xs mb-1">{t.recordDebtorPaymentModal.paymentFrom}</Text>
          <Text className="text-text dark:text-slate-100 font-bold text-base">@{debtorUsername}</Text>
          <View className="flex-row justify-between mt-2">
            <Text className="text-muted dark:text-slate-500 text-xs">{t.recordDebtorPaymentModal.outstandingBalance}</Text>
            <Text className="text-success font-bold text-sm">{formatCurrency(outstandingBalance)}</Text>
          </View>
        </View>

        {/* Amount field with Max button */}
        <View className="mb-4">
          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="text-sm font-medium text-text dark:text-slate-100">{t.recordDebtorPaymentModal.amountReceived}</Text>
            <TouchableOpacity
              onPress={() => {
                const maxFc = Math.round(parseFloat(outstandingBalance) * parseFloat(rate));
                setAmountFc(maxFc.toString());
              }}
              className="bg-primary/10 rounded-lg px-2.5 py-1"
            >
              <Text className="text-primary text-xs font-bold">{t.common.max}</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            value={amountFc}
            onChangeText={setAmountFc}
            placeholder="0"
            keyboardType="decimal-pad"
            placeholderTextColor="#94A3B8"
            className="border rounded-xl px-4 py-3 text-text dark:text-slate-100 bg-card dark:bg-slate-800 text-base border-border dark:border-slate-700"
          />
          {hasExcess && (
            <View className="mt-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2.5 flex-row items-start gap-2">
              <Text style={{ fontSize: 14 }}>⚠️</Text>
              <Text className="text-amber-700 dark:text-amber-300 text-sm flex-1">
                {t.recordDebtorPaymentModal.excessDiscarded(
                  new Intl.NumberFormat('fr-CD').format(excessFc) + ' FC',
                  formatCurrency(outstandingBalance),
                )}
              </Text>
            </View>
          )}
        </View>
        <Input
          label={t.recordDebtorPaymentModal.noteOptional}
          value={note}
          onChangeText={setNote}
          placeholder={t.recordDebtorPaymentModal.notePlaceholder}
          autoCapitalize="sentences"
        />

        <Button label={t.recordDebtorPaymentModal.submit} onPress={handleSubmit} loading={isPending} />
      </ScrollView>
    </Modal>
  );
}
