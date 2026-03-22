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

export function ReceiveFromSupplierModal({ visible, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const [supplier, setSupplier] = useState<User | null>(null);
  const [form, setForm] = useState({ productName: '', unitCost: '', sellingPrice: '', quantity: '', category: '' });
  const set = (key: keyof typeof form) => (val: string) => setForm((f) => ({ ...f, [key]: val }));

  const { mutate, isPending } = useMutation({
    mutationFn: () => inventoryApi.receiveFromSupplier({
      supplierUserId: supplier!.id,
      productName: form.productName,
      unitCost: form.unitCost,
      sellingPrice: form.sellingPrice,
      quantity: parseInt(form.quantity, 10),
      ...(form.category ? { category: form.category } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.inventory() });
      qc.invalidateQueries({ queryKey: QK.suppliers });
      qc.invalidateQueries({ queryKey: QK.dashboard });
      setSupplier(null);
      setForm({ productName: '', unitCost: '', sellingPrice: '', quantity: '', category: '' });
      onClose();
    },
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });

  const handleSubmit = () => {
    if (!supplier) { Alert.alert(t.receiveSupplierModal.selectSupplierAlert, t.receiveSupplierModal.selectSupplierMsg); return; }
    if (!form.productName || !form.unitCost || !form.sellingPrice || !form.quantity) {
      Alert.alert(t.common.missingFields, t.receiveSupplierModal.missingFieldsMsg);
      return;
    }
    mutate();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView className="flex-1 bg-surface dark:bg-slate-900" contentContainerClassName="px-6 py-8" keyboardShouldPersistTaps="handled">
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-xl font-bold text-text dark:text-slate-100">{t.receiveSupplierModal.title}</Text>
          <TouchableOpacity onPress={onClose}><Text className="text-primary font-medium">{t.common.cancel}</Text></TouchableOpacity>
        </View>
        <UserSearchField label={t.receiveSupplierModal.selectSupplier} selected={supplier} onSelect={setSupplier} />
        <Input label={t.receiveSupplierModal.productName} value={form.productName} onChangeText={set('productName')} placeholder={t.receiveSupplierModal.productNamePlaceholder} autoCapitalize="words" />
        <Input label={t.receiveSupplierModal.agreedUnitCost} value={form.unitCost} onChangeText={set('unitCost')} placeholder={t.receiveSupplierModal.agreedUnitCostPlaceholder} keyboardType="decimal-pad" />
        <Input label={t.receiveSupplierModal.sellingPrice} value={form.sellingPrice} onChangeText={set('sellingPrice')} placeholder={t.receiveSupplierModal.sellingPricePlaceholder} keyboardType="decimal-pad" />
        <Input label={t.receiveSupplierModal.quantity} value={form.quantity} onChangeText={set('quantity')} placeholder={t.receiveSupplierModal.quantityPlaceholder} keyboardType="number-pad" />
        <Input label={t.receiveSupplierModal.category} value={form.category} onChangeText={set('category')} placeholder={t.receiveSupplierModal.categoryPlaceholder} />
        <View className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
          <Text className="text-blue-700 text-xs">{t.receiveSupplierModal.debtHint(form.unitCost && form.quantity ? formatCurrency((parseFloat(form.unitCost || '0') * parseInt(form.quantity || '0', 10)).toFixed(2)) : '...')}</Text>
        </View>
        <Button label={t.receiveSupplierModal.submit} onPress={handleSubmit} loading={isPending} />
      </ScrollView>
    </Modal>
  );
}
