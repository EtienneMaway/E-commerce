import { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, View, Text, Pressable, TextInput, Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { ProductSummary, ProductVariantSummary } from '@trading-app/types';
import { salesApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useExchangeRate, formatMoney } from '../../lib/currency';
import { generateReceiptId } from '../../lib/receipt';
import { getErrorMessage, isPriceGuardWarning, getPriceGuardWarning } from '../../lib/utils';
import { useAuthStore } from '../../store/auth.store';
import { Button } from '../ui/Button';
import { useT } from '../../lib/i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
  group: ProductSummary | null;
}

type Mode = 'carton' | 'size';

/**
 * Sell a sized (carton-with-variants) product: either one or more WHOLE cartons
 * at the group carton price, or a chosen size by the piece. Prices display in FC
 * (at the mini's locked rate when applicable); the sale posts USD on the wire —
 * carton via `{ carton, groupId, cartonQty }`, size via `{ variantId, qtySold }`.
 * Online-only for now (sized sales don't yet flow through the offline queue).
 */
export function SellSizedProductModal({ visible, onClose, group }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const exchangeRate = useExchangeRate();
  const isMini = useAuthStore((s) => s.user?.activeEmployment?.tier === 'SALES_ONLY');

  const variants = useMemo(() => group?.variants ?? [], [group]);
  const cartonPriceUsd = group?.cartonSellingPrice ? parseFloat(group.cartonSellingPrice) : null;
  const cartonsAvailable = group?.cartonsAvailable ?? 0;
  const canCarton = cartonPriceUsd != null && cartonsAvailable > 0;

  const [mode, setMode] = useState<Mode>('carton');
  const [qty, setQty] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  // Carton selling price (FC) the mini charges — editable so they can profit.
  const [cartonPriceFc, setCartonPriceFc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset each time a different product opens; default to whichever mode is sellable.
  useEffect(() => {
    if (!visible || !group) return;
    setMode(canCarton ? 'carton' : 'size');
    setQty(1);
    setSelectedVariantId(variants.find((v) => v.available > 0)?.variantId ?? null);
    setSubmitting(false);
    // Default the carton price to the dashboard's carton selling price (or the
    // combined size prices if none), in FC at the locked rate. Editable below.
    const gRate =
      parseFloat(isMini && group.usdToFcRateSnapshot ? group.usdToFcRateSnapshot : exchangeRate) || 1;
    const baseUsd =
      cartonPriceUsd != null
        ? cartonPriceUsd
        : variants.reduce((s, v) => s + parseFloat(v.sellingPrice) * v.piecesPerCarton, 0);
    setCartonPriceFc(baseUsd > 0 ? String(Math.round(baseUsd * gRate)) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, group?.groupId]);

  if (!group) return null;

  const groupRate = isMini && group.usdToFcRateSnapshot ? group.usdToFcRateSnapshot : exchangeRate;
  const rateFor = (v: ProductVariantSummary) =>
    isMini && v.usdToFcRateSnapshot ? v.usdToFcRateSnapshot : groupRate;

  const selected = variants.find((v) => v.variantId === selectedVariantId) ?? null;
  const maxQty = mode === 'carton' ? cartonsAvailable : selected?.available ?? 0;
  const clampedQty = Math.max(1, Math.min(qty, Math.max(1, maxQty)));

  // Effective carton price (USD) from the editable FC input, at the locked rate.
  const cartonPriceFcNum = parseFloat(cartonPriceFc) || 0;
  const effectiveCartonUsd = cartonPriceFcNum / (parseFloat(groupRate) || 1);

  const lineTotalUsd =
    mode === 'carton'
      ? effectiveCartonUsd * clampedQty
      : selected
        ? parseFloat(selected.sellingPrice) * clampedQty
        : 0;
  const lineRate = mode === 'carton' ? groupRate : selected ? rateFor(selected) : groupRate;

  async function submit(confirmedOverride = false) {
    if (!group) return;
    const receiptId = generateReceiptId();
    setSubmitting(true);
    try {
      if (mode === 'carton') {
        await salesApi.record({
          productName: group.productName,
          carton: true,
          groupId: group.groupId,
          cartonQty: clampedQty,
          salePrice: effectiveCartonUsd.toFixed(4),
          ...(isMini ? { salePriceFc: cartonPriceFcNum.toFixed(4) } : {}),
          receiptId,
          ...(confirmedOverride ? { confirmedOverride: true } : {}),
        });
      } else {
        if (!selected) return;
        const priceUsd = parseFloat(selected.sellingPrice);
        const r = parseFloat(rateFor(selected)) || 1;
        await salesApi.record({
          productName: group.productName,
          variantId: selected.variantId,
          qtySold: clampedQty,
          salePrice: priceUsd.toFixed(4),
          ...(isMini ? { salePriceFc: Math.round(priceUsd * r).toFixed(4) } : {}),
          receiptId,
          ...(confirmedOverride ? { confirmedOverride: true } : {}),
        });
      }
      await invalidate();
      Alert.alert(t.sizedSale.saleRecorded);
      onClose();
    } catch (err) {
      if (isPriceGuardWarning(err)) {
        const w = getPriceGuardWarning(err);
        Alert.alert(t.sizedSale.priceGuardTitle, w?.message ?? '', [
          { text: t.common.cancel, style: 'cancel' },
          { text: t.sizedSale.confirmLoss, style: 'destructive', onPress: () => void submit(true) },
        ]);
      } else {
        Alert.alert(t.common.error, getErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function invalidate() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: QK.inventoryProducts }),
      qc.invalidateQueries({ queryKey: QK.inventory() }),
      qc.invalidateQueries({ queryKey: QK.salesHistory() }),
      qc.invalidateQueries({ queryKey: QK.dashboard }),
      qc.invalidateQueries({ queryKey: QK.cashPosition }),
      qc.invalidateQueries({ queryKey: ['mini-settlements', 'stats'] }),
    ]);
  }

  const canSubmit =
    mode === 'carton'
      ? canCarton && cartonPriceFcNum > 0
      : !!selected && (selected.available ?? 0) > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView
        className="flex-1 bg-surface dark:bg-slate-900"
        contentContainerClassName="px-6 py-8"
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-xl font-bold text-text dark:text-slate-100 capitalize flex-1 mr-2" numberOfLines={2}>
            {group.productName}
          </Text>
          <Pressable onPress={onClose}>
            <Text className="text-primary font-medium">{t.common.cancel}</Text>
          </Pressable>
        </View>

        {/* Mode tabs */}
        <View className="flex-row bg-card dark:bg-slate-800 rounded-xl p-1 mb-5">
          <Pressable
            onPress={() => {
              if (!canCarton) return;
              setMode('carton');
              setQty(1);
            }}
            className={`flex-1 py-2.5 rounded-lg items-center ${mode === 'carton' ? 'bg-primary' : ''}`}
            style={{ opacity: canCarton ? 1 : 0.4 }}
          >
            <Text className={mode === 'carton' ? 'text-white font-semibold' : 'text-text dark:text-slate-200'}>
              {t.sizedSale.cartonTab}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMode('size');
              setQty(1);
            }}
            className={`flex-1 py-2.5 rounded-lg items-center ${mode === 'size' ? 'bg-primary' : ''}`}
          >
            <Text className={mode === 'size' ? 'text-white font-semibold' : 'text-text dark:text-slate-200'}>
              {t.sizedSale.sizeTab}
            </Text>
          </Pressable>
        </View>

        {mode === 'carton' ? (
          <View className="bg-card dark:bg-slate-800 rounded-xl px-4 py-4 mb-4">
            {canCarton ? (
              <>
                <Text className="text-muted dark:text-slate-500 text-sm mb-1">
                  {t.sizedSale.cartonPriceEditable}
                </Text>
                <View className="flex-row items-center gap-2">
                  <TextInput
                    value={cartonPriceFc}
                    onChangeText={(v) => setCartonPriceFc(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor="#94a3b8"
                    className="flex-1 bg-surface dark:bg-slate-900 border border-border dark:border-slate-700 rounded-xl px-4 py-3 text-text dark:text-slate-100 text-base"
                  />
                  <Text className="text-muted dark:text-slate-500 text-sm">
                    FC {t.sizedSale.perCarton}
                  </Text>
                </View>
                <Text className="text-muted dark:text-slate-500 text-xs mt-1.5">
                  {t.sizedSale.cartonsAvailable(cartonsAvailable)}
                </Text>
              </>
            ) : (
              <Text className="text-muted dark:text-slate-500 text-sm">{t.sizedSale.noCartonPrice}</Text>
            )}
          </View>
        ) : (
          <View className="mb-4">
            <Text className="text-muted dark:text-slate-500 text-sm mb-2">{t.sizedSale.pickSize}</Text>
            {variants.map((v) => {
              const isSel = v.variantId === selectedVariantId;
              const out = v.available <= 0;
              return (
                <Pressable
                  key={v.variantId}
                  onPress={() => {
                    if (out) return;
                    setSelectedVariantId(v.variantId);
                    setQty(1);
                  }}
                  className={`flex-row justify-between items-center rounded-xl px-4 py-3 mb-2 border ${
                    isSel ? 'border-primary' : 'border-border dark:border-slate-700'
                  } bg-card dark:bg-slate-800`}
                  style={{ opacity: out ? 0.45 : 1 }}
                >
                  <View>
                    <Text className="text-text dark:text-slate-100 font-semibold capitalize">{v.label}</Text>
                    <Text className="text-muted dark:text-slate-500 text-xs">
                      {out ? t.sizedSale.outOfStock : t.sizedSale.sizeAvailable(v.available)}
                    </Text>
                  </View>
                  <Text className="text-text dark:text-slate-100 font-medium">
                    {formatMoney(v.sellingPrice, rateFor(v))}{' '}
                    <Text className="text-muted dark:text-slate-500 text-xs">{t.sizedSale.perPiece}</Text>
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Quantity stepper */}
        {canSubmit && (
          <View className="flex-row justify-between items-center bg-card dark:bg-slate-800 rounded-xl px-4 py-3 mb-4">
            <Text className="text-text dark:text-slate-100 font-medium">
              {mode === 'carton' ? t.sizedSale.cartonQtyLabel : t.sizedSale.quantity}
            </Text>
            <View className="flex-row items-center gap-4">
              <Pressable
                onPress={() => setQty((q) => Math.max(1, q - 1))}
                className="w-10 h-10 rounded-full bg-surface dark:bg-slate-700 items-center justify-center"
              >
                <Text className="text-text dark:text-slate-100 text-xl">−</Text>
              </Pressable>
              <Text className="text-text dark:text-slate-100 text-lg font-bold w-8 text-center">{clampedQty}</Text>
              <Pressable
                onPress={() => setQty((q) => Math.min(maxQty, q + 1))}
                className="w-10 h-10 rounded-full bg-surface dark:bg-slate-700 items-center justify-center"
              >
                <Text className="text-text dark:text-slate-100 text-xl">+</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Total */}
        {canSubmit && (
          <View className="flex-row justify-between items-center mb-5">
            <Text className="text-muted dark:text-slate-500">{t.sizedSale.total}</Text>
            <Text className="text-text dark:text-slate-100 text-xl font-bold">
              {formatMoney(lineTotalUsd.toString(), lineRate)}
            </Text>
          </View>
        )}

        <Button
          label={submitting ? t.sizedSale.selling : t.sizedSale.sell}
          onPress={() => void submit(false)}
          loading={submitting}
          disabled={!canSubmit}
        />
      </ScrollView>
    </Modal>
  );
}
