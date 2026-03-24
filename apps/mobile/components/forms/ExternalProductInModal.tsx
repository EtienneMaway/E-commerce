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

export function ExternalProductInModal({ visible, onClose, contactId }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const [form, setForm] = useState({ productName: '', quantity: '', unitCost: '', sellingPrice: '', category: '', notes: '' });
  const set = (key: keyof typeof form) => (val: string) => setForm((f) => ({ ...f, [key]: val }));

  const { mutate, isPending } = useMutation({
    mutationFn: () => externalContactsApi.recordProductIn(contactId, {
      productName: form.productName,
      quantity: parseInt(form.quantity, 10),
      unitCost: form.unitCost,
      sellingPrice: form.sellingPrice,
      category: form.category || undefined,
      notes: form.notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.externalContactDetail(contactId) });
      qc.invalidateQueries({ queryKey: QK.externalContacts });
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      qc.invalidateQueries({ queryKey: QK.inventory() });
      setForm({ productName: '', quantity: '', unitCost: '', sellingPrice: '', category: '', notes: '' });
      onClose();
    },
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });

  const handleSubmit = () => {
    if (!form.productName || !form.quantity || !form.unitCost || !form.sellingPrice) {
      Alert.alert(t.common.missingFields, t.externalProductInModal.missingFieldsMsg);
      return;
    }
    mutate();
  };

  const debtHint = form.unitCost && form.quantity
    ? formatCurrency((parseFloat(form.unitCost || '0') * parseInt(form.quantity || '0', 10)).toFixed(2))
    : '...';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView className="flex-1 bg-surface dark:bg-slate-900" contentContainerClassName="px-6 py-8" keyboardShouldPersistTaps="handled">
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-xl font-bold text-text dark:text-slate-100">{t.externalProductInModal.title}</Text>
          <TouchableOpacity onPress={onClose}><Text className="text-primary font-medium">{t.common.cancel}</Text></TouchableOpacity>
        </View>
        <Input label={t.externalProductInModal.productName} value={form.productName} onChangeText={set('productName')} placeholder={t.externalProductInModal.productNamePlaceholder} autoCapitalize="words" />
        <Input label={t.externalProductInModal.quantity} value={form.quantity} onChangeText={set('quantity')} placeholder={t.externalProductInModal.quantityPlaceholder} keyboardType="number-pad" />
        <Input label={t.externalProductInModal.unitCost} value={form.unitCost} onChangeText={set('unitCost')} placeholder={t.externalProductInModal.unitCostPlaceholder} keyboardType="decimal-pad" />
        <Input label={t.externalProductInModal.sellingPrice} value={form.sellingPrice} onChangeText={set('sellingPrice')} placeholder={t.externalProductInModal.sellingPricePlaceholder} keyboardType="decimal-pad" />
        <Input label={t.externalProductInModal.category} value={form.category} onChangeText={set('category')} placeholder={t.externalProductInModal.categoryPlaceholder} />
        <Input label={t.externalProductInModal.notes} value={form.notes} onChangeText={set('notes')} placeholder={t.externalProductInModal.notesPlaceholder} autoCapitalize="sentences" />
        <View className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
          <Text className="text-blue-700 text-xs">{t.externalProductInModal.debtHint(debtHint)}</Text>
        </View>
        <Button label={t.externalProductInModal.submit} onPress={handleSubmit} loading={isPending} />
      </ScrollView>
    </Modal>
  );
}
