import { useState } from 'react';
import { View, Text, Modal, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { externalContactsApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../lib/utils';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';

interface Props { visible: boolean; onClose: () => void; contactId: string; }

export function ExternalProductOutModal({ visible, onClose, contactId }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const [form, setForm] = useState({ productName: '', quantity: '', unitPrice: '', notes: '' });
  const set = (key: keyof typeof form) => (val: string) => setForm((f) => ({ ...f, [key]: val }));

  const { mutate, isPending } = useMutation({
    mutationFn: () => externalContactsApi.recordProductOut(contactId, {
      productName: form.productName,
      quantity: parseInt(form.quantity, 10),
      unitPrice: form.unitPrice,
      notes: form.notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.externalContactDetail(contactId) });
      qc.invalidateQueries({ queryKey: QK.externalContacts });
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      qc.invalidateQueries({ queryKey: QK.inventory() });
      setForm({ productName: '', quantity: '', unitPrice: '', notes: '' });
      onClose();
    },
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });

  const handleSubmit = () => {
    if (!form.productName || !form.quantity || !form.unitPrice) {
      Alert.alert(t.common.missingFields, t.externalProductOutModal.missingFieldsMsg);
      return;
    }
    mutate();
  };

  const totalHint = form.unitPrice && form.quantity
    ? formatCurrency((parseFloat(form.unitPrice || '0') * parseInt(form.quantity || '0', 10)).toFixed(2))
    : '...';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView className="flex-1 bg-surface dark:bg-slate-900" contentContainerClassName="px-6 py-8" keyboardShouldPersistTaps="handled">
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-xl font-bold text-text dark:text-slate-100">{t.externalProductOutModal.title}</Text>
          <TouchableOpacity onPress={onClose}><Text className="text-primary font-medium">{t.common.cancel}</Text></TouchableOpacity>
        </View>
        <Input label={t.externalProductOutModal.productName} value={form.productName} onChangeText={set('productName')} placeholder={t.externalProductOutModal.productNamePlaceholder} autoCapitalize="words" />
        <Input label={t.externalProductOutModal.quantity} value={form.quantity} onChangeText={set('quantity')} placeholder={t.externalProductOutModal.quantityPlaceholder} keyboardType="number-pad" />
        <Input label={t.externalProductOutModal.unitPrice} value={form.unitPrice} onChangeText={set('unitPrice')} placeholder={t.externalProductOutModal.unitPricePlaceholder} keyboardType="decimal-pad" />
        <Input label={t.externalProductOutModal.notes} value={form.notes} onChangeText={set('notes')} placeholder={t.externalProductOutModal.notesPlaceholder} autoCapitalize="sentences" />
        <View className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
          <Text className="text-blue-700 text-xs">{t.externalProductOutModal.debtHint(totalHint)}</Text>
        </View>
        <Button label={t.externalProductOutModal.submit} onPress={handleSubmit} loading={isPending} />
      </ScrollView>
    </Modal>
  );
}
