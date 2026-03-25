import { useState } from 'react';
import { View, Text, Modal, ScrollView, Alert, TouchableOpacity, TextInput } from 'react-native';
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { inventoryApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { UserSearchField } from './UserSearchField';
import { getErrorMessage } from '../../lib/utils';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';

interface User { id: string; username: string; email: string | null; phone: string | null; }
interface ProductSummary { productName: string; latestUnitCost: string; totalAvailable: number; }
interface Props { visible: boolean; onClose: () => void; }

export function ConsignToDebtorModal({ visible, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const [debtor, setDebtor] = useState<User | null>(null);
  const [productQuery, setProductQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductSummary | null>(null);
  const [form, setForm] = useState({ quantity: '', agreedUnitPrice: '' });
  const set = (key: keyof typeof form) => (val: string) => setForm((f) => ({ ...f, [key]: val }));

  const { data: products } = useQuery({
    queryKey: QK.inventoryProducts,
    queryFn: inventoryApi.listProducts,
    staleTime: 60_000,
    enabled: visible,
  });

  const filtered = (products as ProductSummary[] | undefined)?.filter((p) =>
    p.productName.includes(productQuery.toLowerCase().trim())
  ) ?? [];
  const showSuggestions = productQuery.trim().length > 0 && !selectedProduct && filtered.length > 0;

  const handleSelectProduct = (p: ProductSummary) => {
    setSelectedProduct(p);
    setProductQuery(p.productName);
  };

  const handleClearProduct = () => {
    setSelectedProduct(null);
    setProductQuery('');
  };

  const reset = () => {
    setDebtor(null);
    setSelectedProduct(null);
    setProductQuery('');
    setForm({ quantity: '', agreedUnitPrice: '' });
  };

  const { mutate, isPending } = useMutation({
    mutationFn: () => inventoryApi.consignToDebtor({
      debtorUserId: debtor!.id,
      productName: (selectedProduct?.productName ?? productQuery).trim(),
      quantity: parseInt(form.quantity, 10),
      agreedUnitPrice: form.agreedUnitPrice,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      qc.invalidateQueries({ queryKey: QK.inventory() });
      qc.invalidateQueries({ queryKey: QK.debtors });
      qc.invalidateQueries({ queryKey: QK.dashboard });
      reset();
      onClose();
    },
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });

  const handleSubmit = () => {
    if (!debtor) {
      Alert.alert(t.consignToDebtorModal.selectDebtorAlert, t.consignToDebtorModal.selectDebtorMsg);
      return;
    }
    const productName = (selectedProduct?.productName ?? productQuery).trim();
    if (!productName || !form.quantity || !form.agreedUnitPrice) {
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

        {/* Product autocomplete */}
        <View className="mb-4">
          <Text className="text-sm font-medium text-text dark:text-slate-100 mb-1.5">
            {t.consignToDebtorModal.productName}
          </Text>
          {selectedProduct ? (
            <View className="border border-border dark:border-slate-700 rounded-xl bg-card dark:bg-slate-800 px-4 py-3 flex-row items-center justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-text dark:text-slate-100 font-medium capitalize">
                  {selectedProduct.productName}
                </Text>
                <Text className="text-muted dark:text-slate-500 text-xs mt-0.5">
                  {t.consignToDebtorModal.unitCostLabel}: {formatCurrency(selectedProduct.latestUnitCost)} · {selectedProduct.totalAvailable} {t.consignToDebtorModal.inStock}
                </Text>
              </View>
              <TouchableOpacity onPress={handleClearProduct}>
                <Text className="text-primary text-sm font-medium">{t.common.change}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="border border-border dark:border-slate-700 rounded-xl bg-card dark:bg-slate-800 overflow-hidden">
              <TextInput
                className="px-4 py-3 text-text dark:text-slate-100 text-base"
                placeholder={t.consignToDebtorModal.productNamePlaceholder}
                placeholderTextColor="#94A3B8"
                value={productQuery}
                onChangeText={setProductQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {showSuggestions && filtered.map((p) => (
                <TouchableOpacity
                  key={p.productName}
                  onPress={() => handleSelectProduct(p)}
                  className="px-4 py-3 border-t border-border dark:border-slate-700"
                >
                  <Text className="text-text dark:text-slate-100 font-medium capitalize">
                    {p.productName}
                  </Text>
                  <Text className="text-muted dark:text-slate-500 text-xs">
                    {t.consignToDebtorModal.unitCostLabel}: {formatCurrency(p.latestUnitCost)} · {p.totalAvailable} {t.consignToDebtorModal.inStock}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <Input
          label={t.consignToDebtorModal.quantity}
          value={form.quantity}
          onChangeText={set('quantity')}
          placeholder={t.consignToDebtorModal.quantityPlaceholder}
          keyboardType="number-pad"
        />
        <Input
          label={t.consignToDebtorModal.agreedPrice}
          value={form.agreedUnitPrice}
          onChangeText={set('agreedUnitPrice')}
          placeholder={t.consignToDebtorModal.sellingPricePlaceholder}
          keyboardType="decimal-pad"
        />

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
