import { useState } from 'react';
import { View, Text, Modal, ScrollView, Alert, TouchableOpacity, TextInput } from 'react-native';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { paymentsApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../lib/utils';
import { useFormatCurrency, useExchangeRate, fcToUsd } from '../../lib/currency';
import { useT } from '../../lib/i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
  supplierId: string;
  supplierUsername: string;
  outstandingBalance: string;
}

export function PaySupplierModal({ visible, onClose, supplierId, supplierUsername, outstandingBalance }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const rate = useExchangeRate();
  const [amountFc, setAmountFc] = useState('');
  const [note, setNote] = useState('');

  const amountUsd = fcToUsd(amountFc, rate);

  const { mutate, isPending } = useMutation({
    mutationFn: () => paymentsApi.paySupplier({ supplierUserId: supplierId, amount: amountUsd, note: note || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.supplierDetail(supplierId) });
      qc.invalidateQueries({ queryKey: QK.suppliers });
      qc.invalidateQueries({ queryKey: QK.dashboard });
      setAmountFc('');
      setNote('');
      onClose();
    },
    onError: (err) => Alert.alert('Error', getErrorMessage(err)),
  });

  const handleSubmit = () => {
    const parsedFc = parseFloat(amountFc);
    if (!amountFc || isNaN(parsedFc) || parsedFc <= 0) {
      Alert.alert(t.common.invalidAmount, t.paySupplierModal.invalidAmountMsg);
      return;
    }
    if (parseFloat(amountUsd) > parseFloat(outstandingBalance)) {
      Alert.alert(t.common.invalidAmount, t.paySupplierModal.exceedsBalance);
      return;
    }
    mutate();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView className="flex-1 bg-surface dark:bg-slate-900" contentContainerClassName="px-6 py-8" keyboardShouldPersistTaps="handled">
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-xl font-bold text-text dark:text-slate-100">{t.paySupplierModal.title}</Text>
          <TouchableOpacity onPress={onClose}><Text className="text-primary font-medium">{t.common.cancel}</Text></TouchableOpacity>
        </View>

        <View className="bg-surface dark:bg-slate-900 border border-border dark:border-slate-700 rounded-xl p-4 mb-5">
          <Text className="text-muted dark:text-slate-500 text-xs mb-1">{t.paySupplierModal.paying}</Text>
          <Text className="text-text dark:text-slate-100 font-bold text-base">@{supplierUsername}</Text>
          <View className="flex-row justify-between mt-2">
            <Text className="text-muted dark:text-slate-500 text-xs">{t.paySupplierModal.outstandingBalance}</Text>
            <Text className="text-danger font-bold text-sm">{formatCurrency(outstandingBalance)}</Text>
          </View>
        </View>

        {/* Amount field with Max button */}
        <View className="mb-4">
          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="text-sm font-medium text-text dark:text-slate-100">{t.paySupplierModal.paymentAmount}</Text>
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
        </View>
        <Input
          label={t.paySupplierModal.noteOptional}
          value={note}
          onChangeText={setNote}
          placeholder={t.paySupplierModal.notePlaceholder}
          autoCapitalize="sentences"
        />

        <Button label={t.paySupplierModal.submit} onPress={handleSubmit} loading={isPending} />
      </ScrollView>
    </Modal>
  );
}
