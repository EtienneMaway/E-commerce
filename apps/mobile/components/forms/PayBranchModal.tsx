import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { branchTransfersApi, type BranchBalance } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../lib/utils';
import { useFormatCurrency, useExchangeRate } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import { useBrand } from '../../lib/theme';
import { showAlert } from '../../lib/alert';
import { FormModal } from '../ui/FormModal';

interface Props {
  /** A balance where the current branch is the debtor; null hides the modal. */
  balance: BranchBalance | null;
  isOwner: boolean;
  onClose: () => void;
}

/**
 * Pay a creditor branch back, in FC — the cash in the till is FC. The API books
 * it at the System Rate; there is no market-rate spread because nothing is
 * exchanged, the same notes just change branch.
 */
export function PayBranchModal({ balance, isOwner, onClose }: Props) {
  const t = useT();
  const brand = useBrand();
  const qc = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const rate = useExchangeRate();
  const [amountFc, setAmountFc] = useState('');

  const pay = useMutation({
    mutationFn: () =>
      branchTransfersApi.pay({ toShopId: balance!.creditorShopId, amount: amountFc.trim(), currency: 'FC' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.branchTransfersAll });
      qc.invalidateQueries({ queryKey: QK.dashboardAll });
      showAlert(t.branchTransfers.paidTitle, isOwner ? undefined : t.branchTransfers.payCustodianHint);
      setAmountFc('');
      onClose();
    },
    onError: (e) => showAlert(t.branchTransfers.actionFailed, getErrorMessage(e)),
  });

  if (!balance) return null;
  // Pre-check only; the API re-checks with decimal arithmetic.
  const maxFc = Math.floor(parseFloat(balance.outstanding) * parseFloat(rate));

  const submit = (): void => {
    const v = parseFloat(amountFc);
    if (!Number.isFinite(v) || v <= 0) return showAlert(t.common.invalidAmount, t.branchTransfers.payInvalid);
    if (v > maxFc) return showAlert(t.common.invalidAmount, t.branchTransfers.payExceeds);
    pay.mutate();
  };

  return (
    <FormModal visible onRequestClose={onClose}>
      <ScrollView className="flex-1 bg-background" contentContainerClassName="px-6 py-8" keyboardShouldPersistTaps="handled">
        <View className="flex-row justify-between items-center mb-6">
          <Text className="font-bold text-2xl text-text">{t.branchTransfers.payTitle(balance.creditorShop.name)}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text className="text-primary font-medium">{t.common.cancel}</Text>
          </TouchableOpacity>
        </View>

        <View className="bg-surface border border-border rounded-xl p-4 mb-5 flex-row justify-between">
          <Text className="text-muted text-xs">{t.branchTransfers.payOwes}</Text>
          <Text className="text-danger font-bold text-sm">{formatCurrency(balance.outstanding)}</Text>
        </View>

        <View className="flex-row items-center justify-between mb-1.5">
          <Text className="text-sm font-medium text-text">{t.branchTransfers.payAmountFc}</Text>
          <TouchableOpacity onPress={() => setAmountFc(String(maxFc))} className="bg-primary/10 rounded-lg px-2.5 py-1">
            <Text className="text-primary text-xs font-bold">{t.common.max}</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          value={amountFc}
          onChangeText={(v) => setAmountFc(v.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={brand.mutedSubtle}
          className="border rounded-2xl px-4 py-3.5 text-text bg-card text-base border-border mb-3"
        />
        <Text className="text-muted text-xs mb-6">
          {isOwner ? t.branchTransfers.payOwnerHint : t.branchTransfers.payCustodianHint}
        </Text>

        <Button label={t.branchTransfers.paySubmit} onPress={submit} loading={pay.isPending} />
      </ScrollView>
    </FormModal>
  );
}
