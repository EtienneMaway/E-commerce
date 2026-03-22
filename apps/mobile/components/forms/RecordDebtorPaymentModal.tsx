import { useState } from 'react';
import { View, Text, Modal, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { paymentsApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../lib/utils';
import { useFormatCurrency } from '../../lib/currency';
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
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const { mutate, isPending } = useMutation({
    mutationFn: () => paymentsApi.recordDebtorPayment({ debtorUserId: debtorId, amount, note: note || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.debtorDetail(debtorId) });
      qc.invalidateQueries({ queryKey: QK.debtors });
      qc.invalidateQueries({ queryKey: QK.dashboard });
      setAmount('');
      setNote('');
      onClose();
    },
    onError: (err) => Alert.alert('Error', getErrorMessage(err)),
  });

  const handleSubmit = () => {
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      Alert.alert(t.common.invalidAmount, t.recordDebtorPaymentModal.invalidAmountMsg);
      return;
    }
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

        <Input
          label={t.recordDebtorPaymentModal.amountReceived}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />
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
