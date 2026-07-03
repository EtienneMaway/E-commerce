import { useEffect, useState } from 'react';
import { Modal, ScrollView, View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useExchangeRate, formatFcValue } from '../../lib/currency';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
  productName: string;
}

interface Entry {
  id: string;
  unitCost: string;
  sellingPrice: string;
  quantityRemaining: number;
  /** The consignment's locked FC/USD rate — the mini prices at this, not live. */
  usdToFcRateSnapshot?: string | null;
}

/**
 * Mini-employee raises the selling price on their own consigned-in stock for one
 * product. Price is entered in FC and applied to every lot of that product; the
 * API floors it at the agreed price (the entry's unit cost).
 */
export function EditMiniPriceModal({ visible, onClose, productName }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const rate = useExchangeRate();
  const [priceFc, setPriceFc] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: QK.inventory({ source: 'CONSIGNED_IN', productName }),
    queryFn: () => inventoryApi.list({ source: 'CONSIGNED_IN', productName }),
    enabled: visible && !!productName,
    staleTime: 15_000,
  });
  const entries: Entry[] = (((data as { data?: Entry[] } | Entry[] | undefined) as { data?: Entry[] })?.data ??
    (data as Entry[] | undefined) ??
    []).filter((e) => e.quantityRemaining > 0);

  // Convert at the consignment's locked rate (falling back to live only if a lot
  // predates the snapshot) so the priced-in FC stays fixed against rate changes.
  const lockedRate = entries.find((e) => e.usdToFcRateSnapshot)?.usdToFcRateSnapshot ?? rate;
  const r = parseFloat(lockedRate) || 1;
  const agreedUsd = entries.length ? Math.max(...entries.map((e) => parseFloat(e.unitCost) || 0)) : 0;
  const currentSellUsd = entries.length ? parseFloat(entries[0].sellingPrice) || 0 : 0;

  // Prefill with the current selling price (FC) when the sheet opens.
  useEffect(() => {
    if (visible && entries.length && priceFc === '') {
      setPriceFc(String(Math.round(currentSellUsd * r)));
    }
    if (!visible) setPriceFc('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, entries.length]);

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const priceUsd = ((parseFloat(priceFc) || 0) / r).toFixed(4);
      return Promise.all(entries.map((e) => inventoryApi.updateMiniSellingPrice(e.id, priceUsd)));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      qc.invalidateQueries({ queryKey: QK.inventory() });
      onClose();
    },
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });

  const priceUsd = (parseFloat(priceFc) || 0) / r;
  const belowFloor = entries.length > 0 && priceUsd < agreedUsd;

  const handleSubmit = () => {
    if (!entries.length) return;
    if (!(parseFloat(priceFc) > 0)) {
      Alert.alert(t.common.error, t.miniEmployee.priceInvalid);
      return;
    }
    if (belowFloor) {
      Alert.alert(t.common.error, t.miniEmployee.priceBelowAgreed(formatFcValue(Math.ceil(agreedUsd * r))));
      return;
    }
    mutate();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView className="flex-1 bg-surface dark:bg-slate-900" contentContainerClassName="px-6 py-8" keyboardShouldPersistTaps="handled">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-xl font-bold text-text dark:text-slate-100 capitalize">{productName}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text className="text-primary font-medium">{t.common.cancel}</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-muted dark:text-slate-500 text-sm mb-5">{t.miniEmployee.priceSubtitle}</Text>

        {isLoading ? (
          <ActivityIndicator className="mt-6" />
        ) : !entries.length ? (
          <Text className="text-muted dark:text-slate-500 text-center mt-8">{t.miniEmployee.priceNoStock}</Text>
        ) : (
          <>
            <View className="bg-card dark:bg-slate-800 rounded-xl px-4 py-3 mb-4">
              <Text className="text-muted dark:text-slate-500 text-xs">{t.miniEmployee.priceAgreed}</Text>
              <Text className="text-text dark:text-slate-100 font-semibold">{formatFcValue(Math.ceil(agreedUsd * r))}</Text>
            </View>
            <Input
              label={t.miniEmployee.priceNew}
              value={priceFc}
              onChangeText={(v) => setPriceFc(v.replace(/[^0-9]/g, ''))}
              placeholder="0"
              keyboardType="number-pad"
            />
            {belowFloor && (
              <Text className="text-danger text-xs mb-2">
                {t.miniEmployee.priceBelowAgreed(formatFcValue(Math.ceil(agreedUsd * r)))}
              </Text>
            )}
            <Button label={t.miniEmployee.priceSubmit} onPress={handleSubmit} loading={isPending} className="mt-2" />
          </>
        )}
      </ScrollView>
    </Modal>
  );
}
