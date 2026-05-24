import { useState } from 'react';
import { View, Text, Modal, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { inventoryApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../lib/utils';
import { useExchangeRate } from '../../lib/currency';
import { useT } from '../../lib/i18n';

interface Props { visible: boolean; onClose: () => void; }

export function AddPersonalModal({ visible, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const exchangeRate = useExchangeRate();
  // unitCost + sellingPrice are user-typed FC. Converted to USD on submission
  // since the API speaks USD.
  const [form, setForm] = useState({ productName: '', unitCost: '', sellingPrice: '', quantity: '', category: '', piecesPerCarton: '' });

  const set = (key: keyof typeof form) => (val: string) => setForm((f) => ({ ...f, [key]: val }));

  const fcToUsd4dp = (fcStr: string): string => {
    const fc = parseFloat(fcStr) || 0;
    const rate = parseFloat(exchangeRate) || 1;
    return (fc / rate).toFixed(4);
  };

  const { mutate, isPending } = useMutation({
    mutationFn: () => inventoryApi.addPersonal({
      productName: form.productName,
      unitCost: fcToUsd4dp(form.unitCost),
      sellingPrice: fcToUsd4dp(form.sellingPrice),
      quantity: parseInt(form.quantity, 10),
      ...(form.category ? { category: form.category } : {}),
      ...(form.piecesPerCarton ? { piecesPerCarton: parseInt(form.piecesPerCarton, 10) } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      qc.invalidateQueries({ queryKey: QK.inventory() });
      setForm({ productName: '', unitCost: '', sellingPrice: '', quantity: '', category: '', piecesPerCarton: '' });
      onClose();
    },
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });

  const handleSubmit = () => {
    if (!form.productName || !form.unitCost || !form.sellingPrice || !form.quantity) {
      Alert.alert(t.common.missingFields, t.addPersonalModal.missingFieldsMsg);
      return;
    }
    mutate();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView className="flex-1 bg-surface dark:bg-slate-900" contentContainerClassName="px-6 py-8" keyboardShouldPersistTaps="handled">
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-xl font-bold text-text dark:text-slate-100">{t.addPersonalModal.title}</Text>
          <TouchableOpacity onPress={onClose}><Text className="text-primary font-medium">{t.common.cancel}</Text></TouchableOpacity>
        </View>
        <Input label={t.addPersonalModal.productName} value={form.productName} onChangeText={set('productName')} placeholder={t.addPersonalModal.productNamePlaceholder} autoCapitalize="words" />
        <Input label={t.addPersonalModal.unitCost} value={form.unitCost} onChangeText={(v) => set('unitCost')(v.replace(/[^0-9]/g, ''))} placeholder="0" keyboardType="number-pad" />
        <Input label={t.addPersonalModal.sellingPrice} value={form.sellingPrice} onChangeText={(v) => set('sellingPrice')(v.replace(/[^0-9]/g, ''))} placeholder="0" keyboardType="number-pad" />
        <Input label={t.addPersonalModal.quantity} value={form.quantity} onChangeText={set('quantity')} placeholder="100" keyboardType="number-pad" />
        <Input label={t.addPersonalModal.category} value={form.category} onChangeText={set('category')} placeholder={t.addPersonalModal.categoryPlaceholder} />
        <Input label={t.addPersonalModal.piecesPerCarton} value={form.piecesPerCarton} onChangeText={set('piecesPerCarton')} placeholder="e.g. 20" keyboardType="number-pad" />
        <Button label={t.addPersonalModal.submit} onPress={handleSubmit} loading={isPending} className="mt-2" />
      </ScrollView>
    </Modal>
  );
}
