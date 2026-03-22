import { useState } from 'react';
import { View, Text, Modal, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { externalContactsApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';

interface Props { visible: boolean; onClose: () => void; contactId: string; }

export function ExternalPaymentInModal({ visible, onClose, contactId }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const { mutate, isPending } = useMutation({
    mutationFn: () => externalContactsApi.recordPaymentIn(contactId, { amount, notes: notes || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.externalContactDetail(contactId) });
      qc.invalidateQueries({ queryKey: QK.externalContacts });
      setAmount('');
      setNotes('');
      onClose();
    },
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });

  const handleSubmit = () => {
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      Alert.alert(t.common.invalidAmount, t.externalPaymentInModal.invalidAmountMsg);
      return;
    }
    mutate();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView className="flex-1 bg-surface dark:bg-slate-900" contentContainerClassName="px-6 py-8" keyboardShouldPersistTaps="handled">
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-xl font-bold text-text dark:text-slate-100">{t.externalPaymentInModal.title}</Text>
          <TouchableOpacity onPress={onClose}><Text className="text-primary font-medium">{t.common.cancel}</Text></TouchableOpacity>
        </View>
        <Input label={t.externalPaymentInModal.amount} value={amount} onChangeText={setAmount} placeholder={t.externalPaymentInModal.amountPlaceholder} keyboardType="decimal-pad" />
        <Input label={t.externalPaymentInModal.notes} value={notes} onChangeText={setNotes} placeholder={t.externalPaymentInModal.notesPlaceholder} autoCapitalize="sentences" />
        <Button label={t.externalPaymentInModal.submit} onPress={handleSubmit} loading={isPending} />
      </ScrollView>
    </Modal>
  );
}
