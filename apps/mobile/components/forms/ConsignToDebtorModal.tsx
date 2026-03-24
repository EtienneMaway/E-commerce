import { useState } from 'react';
import { View, Text, Modal, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { inventoryApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { UserSearchField } from './UserSearchField';
import { getErrorMessage } from '../../lib/utils';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';

interface User { id: string; username: string; email: string | null; phone: string | null; }
interface Props { visible: boolean; onClose: () => void; }

export function ConsignToDebtorModal({ visible, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const [debtor, setDebtor] = useState<User | null>(null);
  const [form, setForm] = useState({ productName: '', quantity: '', agreedUnitPrice: '' });
  const set = (key: keyof typeof form) => (val: string) => setForm((f) => ({ ...f, [key]: val }));

  const { mutate, isPending } = useMutation({
    mutationFn: () => inventoryApi.consignToDebtor({
      debtorUserId: debtor!.id,
      productName: form.productName,
      quantity: parseInt(form.quantity, 10),
      agreedUnitPrice: form.agreedUnitPrice,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      qc.invalidateQueries({ queryKey: QK.inventory() });
      qc.invalidateQueries({ queryKey: QK.debtors });
      qc.invalidateQueries({ queryKey: QK.dashboard });
      setDebtor(null);
      setForm({ productName: '', quantity: '', agreedUnitPrice: '' });
      onClose();
    },
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });

  const handleSubmit = () => {
    if (!debtor) { Alert.alert(t.consignToDebtorModal.selectDebtorAlert, t.consignToDebtorModal.selectDebtorMsg); return; }
    if (!form.productName || !form.quantity || !form.agreedUnitPrice) {
      Alert.alert(t.common.missingFields, t.consignToDebtorModal.missingFieldsMsg);
      return;
    }
    mutate();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView className="flex-1 bg-surface dark:bg-slate-900" contentContainerClassName="px-6 py-8" keyboardShouldPersistTaps="handled">
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-xl font-bold text-text dark:text-slate-100">{t.consignToDebtorModal.title}</Text>
          <TouchableOpacity onPress={onClose}><Text className="text-primary font-medium">{t.common.cancel}</Text></TouchableOpacity>
        </View>
        <UserSearchField label={t.consignToDebtorModal.selectDebtor} selected={debtor} onSelect={setDebtor} />
        <Input label={t.consignToDebtorModal.productName} value={form.productName} onChangeText={set('productName')} placeholder={t.consignToDebtorModal.productNamePlaceholder} autoCapitalize="words" />
        <Input label={t.consignToDebtorModal.quantity} value={form.quantity} onChangeText={set('quantity')} placeholder={t.consignToDebtorModal.quantityPlaceholder} keyboardType="number-pad" />
        <Input label={t.consignToDebtorModal.agreedPrice} value={form.agreedUnitPrice} onChangeText={set('agreedUnitPrice')} placeholder={t.consignToDebtorModal.agreedPricePlaceholder} keyboardType="decimal-pad" />
        <View className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
          <Text className="text-blue-700 text-xs">
            {t.consignToDebtorModal.debtHint(form.agreedUnitPrice && form.quantity
              ? formatCurrency((parseFloat(form.agreedUnitPrice || '0') * parseInt(form.quantity || '0', 10)).toFixed(2))
              : '...')}
          </Text>
        </View>
        <Button label={t.consignToDebtorModal.submit} onPress={handleSubmit} loading={isPending} />
      </ScrollView>
    </Modal>
  );
}
