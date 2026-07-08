import { useEffect, useMemo, useState } from 'react';
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
  /** When set, the product is a sized group — re-price each size independently. */
  variants?: { variantId: string; label: string }[];
  /** Sized group id + its current carton selling price (USD) — enables the carton area. */
  groupId?: string;
  cartonSellingPrice?: string | null;
}

interface Entry {
  id: string;
  unitCost: string;
  sellingPrice: string;
  quantityRemaining: number;
  /** The consignment's locked FC/USD rate — the mini prices at this, not live. */
  usdToFcRateSnapshot?: string | null;
  variantId?: string | null;
  piecesPerCarton?: number | null;
}

/**
 * Mini-employee raises the selling price on their own consigned-in stock. For a
 * simple product one FC price applies to every lot; for a sized product each
 * size gets its own FC price. The API floors each at the agreed price (the lot's
 * unit cost).
 */
export function EditMiniPriceModal({
  visible,
  onClose,
  productName,
  variants,
  groupId,
  cartonSellingPrice,
}: Props) {
  const t = useT();
  const qc = useQueryClient();
  const rate = useExchangeRate();
  const isSized = !!variants && variants.length > 0;

  const [priceFc, setPriceFc] = useState('');
  const [priceByVariant, setPriceByVariant] = useState<Record<string, string>>({});
  const [cartonPriceFc, setCartonPriceFc] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: QK.inventory({ source: 'CONSIGNED_IN', productName }),
    queryFn: () => inventoryApi.list({ source: 'CONSIGNED_IN', productName }),
    enabled: visible && !!productName,
    staleTime: 15_000,
  });
  const entries: Entry[] = (
    ((data as { data?: Entry[] } | Entry[] | undefined) as { data?: Entry[] })?.data ??
    (data as Entry[] | undefined) ??
    []
  ).filter((e) => e.quantityRemaining > 0);

  // ── Simple product: one FC price for every lot ─────────────────────────────
  const lockedRate = entries.find((e) => e.usdToFcRateSnapshot)?.usdToFcRateSnapshot ?? rate;
  const r = parseFloat(lockedRate) || 1;
  const agreedUsd = entries.length ? Math.max(...entries.map((e) => parseFloat(e.unitCost) || 0)) : 0;
  const currentSellUsd = entries.length ? parseFloat(entries[0].sellingPrice) || 0 : 0;

  // ── Sized product: one FC price per size, over that size's lots ─────────────
  const sizeGroups = useMemo(() => {
    if (!isSized) return [];
    return (variants ?? [])
      .map((v) => {
        const lots = entries.filter((e) => e.variantId === v.variantId);
        const gr = parseFloat(lots.find((e) => e.usdToFcRateSnapshot)?.usdToFcRateSnapshot ?? lockedRate) || 1;
        return {
          variantId: v.variantId,
          label: v.label,
          lots,
          rate: gr,
          ppc: lots[0]?.piecesPerCarton || 1,
          agreedUsd: lots.length ? Math.max(...lots.map((e) => parseFloat(e.unitCost) || 0)) : 0,
          currentSellUsd: lots.length ? parseFloat(lots[0].sellingPrice) || 0 : 0,
        };
      })
      .filter((g) => g.lots.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSized, variants, entries.length, lockedRate]);

  // Carton area (sized only): what the mini owes for one carton (floor) and the
  // rate to convert. Floor = Σ agreed price × pieces-per-carton over the sizes.
  const cartonRate = parseFloat(lockedRate) || 1;
  const cartonFloorUsd = sizeGroups.reduce((s, g) => s + g.agreedUsd * g.ppc, 0);
  const showCarton = isSized && !!groupId && sizeGroups.length > 0;

  // Prefill inputs with current selling prices when the sheet opens.
  useEffect(() => {
    if (!visible) {
      setPriceFc('');
      setPriceByVariant({});
      setCartonPriceFc('');
      return;
    }
    if (isSized) {
      if (sizeGroups.length && Object.keys(priceByVariant).length === 0) {
        const seed: Record<string, string> = {};
        for (const g of sizeGroups) seed[g.variantId] = String(Math.round(g.currentSellUsd * g.rate));
        setPriceByVariant(seed);
        // Carton price default: current (mini's own or given) carton price, else
        // what they owe for a carton.
        const baseUsd = cartonSellingPrice ? parseFloat(cartonSellingPrice) : cartonFloorUsd;
        setCartonPriceFc(baseUsd > 0 ? String(Math.round(baseUsd * cartonRate)) : '');
      }
    } else if (entries.length && priceFc === '') {
      setPriceFc(String(Math.round(currentSellUsd * r)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, entries.length, sizeGroups.length]);

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      if (isSized) {
        const updates: Promise<unknown>[] = [];
        for (const g of sizeGroups) {
          const fc = parseFloat(priceByVariant[g.variantId] ?? '');
          if (!(fc > 0)) continue;
          const priceUsd = (fc / g.rate).toFixed(4);
          for (const e of g.lots) updates.push(inventoryApi.updateMiniSellingPrice(e.id, priceUsd));
        }
        // Carton price (whole-carton selling price the mini charges).
        const cFc = parseFloat(cartonPriceFc);
        if (showCarton && groupId && cFc > 0) {
          updates.push(inventoryApi.updateMiniCartonPrice(groupId, (cFc / cartonRate).toFixed(4)));
        }
        return Promise.all(updates);
      }
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
    if (isSized) {
      if (!sizeGroups.length) return;
      for (const g of sizeGroups) {
        const fc = parseFloat(priceByVariant[g.variantId] ?? '');
        if (!(fc > 0)) {
          Alert.alert(t.common.error, t.miniEmployee.priceInvalid);
          return;
        }
        if (fc / g.rate < g.agreedUsd) {
          Alert.alert(
            t.common.error,
            `${g.label}: ${t.miniEmployee.priceBelowAgreed(formatFcValue(Math.ceil(g.agreedUsd * g.rate)))}`,
          );
          return;
        }
      }
      if (showCarton) {
        const cFc = parseFloat(cartonPriceFc);
        if (cFc > 0 && cFc / cartonRate < cartonFloorUsd) {
          Alert.alert(
            t.common.error,
            `${t.sizedSale.cartonPrice}: ${t.miniEmployee.priceBelowAgreed(formatFcValue(Math.ceil(cartonFloorUsd * cartonRate)))}`,
          );
          return;
        }
      }
      mutate();
      return;
    }
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

  const hasStock = isSized ? sizeGroups.length > 0 : entries.length > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView className="flex-1 bg-surface dark:bg-slate-900" contentContainerClassName="px-6 py-8" keyboardShouldPersistTaps="handled">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-xl font-bold text-text dark:text-slate-100 capitalize">{productName}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text className="text-primary font-medium">{t.common.cancel}</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-muted dark:text-slate-500 text-sm mb-5">
          {isSized ? t.sizedSale.editPricesSub : t.miniEmployee.priceSubtitle}
        </Text>

        {isLoading ? (
          <ActivityIndicator className="mt-6" />
        ) : !hasStock ? (
          <Text className="text-muted dark:text-slate-500 text-center mt-8">{t.miniEmployee.priceNoStock}</Text>
        ) : isSized ? (
          <>
            {sizeGroups.map((g) => {
              const fc = parseFloat(priceByVariant[g.variantId] ?? '');
              const below = fc > 0 && fc / g.rate < g.agreedUsd;
              return (
                <View key={g.variantId} className="mb-2">
                  <Input
                    label={`${g.label.charAt(0).toUpperCase() + g.label.slice(1)}  ·  ${t.sizedSale.agreedShort} ${formatFcValue(Math.ceil(g.agreedUsd * g.rate))}`}
                    value={priceByVariant[g.variantId] ?? ''}
                    onChangeText={(v) =>
                      setPriceByVariant((prev) => ({ ...prev, [g.variantId]: v.replace(/[^0-9]/g, '') }))
                    }
                    placeholder="0"
                    keyboardType="number-pad"
                  />
                  {below && (
                    <Text className="text-danger text-xs -mt-2 mb-2">
                      {t.miniEmployee.priceBelowAgreed(formatFcValue(Math.ceil(g.agreedUsd * g.rate)))}
                    </Text>
                  )}
                </View>
              );
            })}

            {/* Whole-carton selling price */}
            {showCarton && (
              <View className="mt-4 pt-4 border-t border-border dark:border-slate-700">
                <Text className="text-xs font-bold uppercase tracking-wider text-primary mb-2">
                  {t.sizedSale.cartonTab}
                </Text>
                <Input
                  label={`${t.sizedSale.cartonPriceEditable}  ·  ${t.sizedSale.agreedShort} ${formatFcValue(Math.ceil(cartonFloorUsd * cartonRate))}`}
                  value={cartonPriceFc}
                  onChangeText={(v) => setCartonPriceFc(v.replace(/[^0-9]/g, ''))}
                  placeholder="0"
                  keyboardType="number-pad"
                />
                {parseFloat(cartonPriceFc) > 0 && parseFloat(cartonPriceFc) / cartonRate < cartonFloorUsd && (
                  <Text className="text-danger text-xs -mt-2 mb-2">
                    {t.miniEmployee.priceBelowAgreed(formatFcValue(Math.ceil(cartonFloorUsd * cartonRate)))}
                  </Text>
                )}
              </View>
            )}

            <Button label={t.sizedSale.saveAll} onPress={handleSubmit} loading={isPending} className="mt-2" />
          </>
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
