import { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  Alert,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  PanResponder,
} from 'react-native';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { salesApi, inventoryApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { Button } from '../ui/Button';
import {
  getErrorMessage,
  getPriceGuardWarning,
  isPriceGuardWarning,
} from '../../lib/utils';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import type { InventoryEntry } from '@trading-app/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  prefilledProduct?: string;
  unitCost?: string;
}

interface CartItem {
  readonly productName: string;
  qty: number;
  readonly unitCost: string;
}

interface PriceGuardPending {
  readonly cartItem: CartItem;
  readonly warning: string;
  readonly potentialLoss: string;
}

interface ProductOption {
  readonly productName: string;
  readonly totalQty: number;
  readonly unitCost: string;
}

function buildProductOptions(entries: InventoryEntry[]): ProductOption[] {
  const map = new Map<string, { totalQty: number; unitCost: string; hasSupplier: boolean }>();

  for (const entry of entries) {
    if (entry.source === 'CONSIGNED_OUT' || entry.quantityRemaining <= 0) continue;
    const existing = map.get(entry.productName);
    if (!existing) {
      map.set(entry.productName, {
        totalQty: entry.quantityRemaining,
        unitCost: entry.unitCost,
        hasSupplier: entry.source === 'SUPPLIER',
      });
    } else {
      existing.totalQty += entry.quantityRemaining;
      if (entry.source === 'SUPPLIER' && !existing.hasSupplier) {
        existing.unitCost = entry.unitCost;
        existing.hasSupplier = true;
      }
    }
  }

  return Array.from(map.entries())
    .map(([productName, data]) => ({ productName, ...data }))
    .sort((a, b) => a.productName.localeCompare(b.productName));
}

export function RecordSaleModal({ visible, onClose, prefilledProduct = '' }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const [search, setSearch] = useState(prefilledProduct);
  const [cart, setCart] = useState<Map<string, CartItem>>(new Map());
  const [priceGuardPending, setPriceGuardPending] = useState<PriceGuardPending[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [markupPct, setMarkupPct] = useState(25);
  const startPctRef = useRef(25);
  const sliderWidthRef = useRef(300);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const tapPct = Math.max(
          0,
          Math.min(100, Math.round((e.nativeEvent.locationX / sliderWidthRef.current) * 100)),
        );
        startPctRef.current = tapPct;
        setMarkupPct(tapPct);
      },
      onPanResponderMove: (_, gestureState) => {
        const delta = (gestureState.dx / sliderWidthRef.current) * 100;
        setMarkupPct(Math.max(0, Math.min(100, Math.round(startPctRef.current + delta))));
      },
    }),
  ).current;

  useEffect(() => {
    if (visible) {
      setSearch(prefilledProduct);
      setCart(new Map());
      setPriceGuardPending([]);
      setMarkupPct(25);
      startPctRef.current = 25;
    }
  }, [visible, prefilledProduct]);

  const { data: rawEntries, isLoading: inventoryLoading } = useQuery({
    queryKey: QK.inventory(),
    queryFn: () => inventoryApi.list(),
    staleTime: 30_000,
    enabled: visible,
  });

  const entries = (rawEntries as InventoryEntry[] | undefined) ?? [];
  const products = useMemo(() => buildProductOptions(entries), [entries]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.productName.includes(q));
  }, [products, search]);

  const cartArray = Array.from(cart.values());
  const grandTotal = cartArray.reduce(
    (sum, item) => sum + parseFloat(item.unitCost) * (1 + markupPct / 100) * item.qty,
    0,
  );

  const toggleProduct = (product: ProductOption): void => {
    setCart((prev) => {
      const next = new Map(prev);
      if (next.has(product.productName)) {
        next.delete(product.productName);
      } else {
        next.set(product.productName, {
          productName: product.productName,
          qty: 1,
          unitCost: product.unitCost,
        });
      }
      return next;
    });
  };

  const setQty = (productName: string, qty: number): void => {
    const maxQty = products.find((p) => p.productName === productName)?.totalQty ?? Infinity;
    setCart((prev) => {
      const next = new Map(prev);
      const item = next.get(productName);
      if (item) next.set(productName, { ...item, qty: Math.max(1, Math.min(qty, maxQty)) });
      return next;
    });
  };

  const handleClose = (): void => {
    setCart(new Map());
    setSearch('');
    setPriceGuardPending([]);
    onClose();
  };

  const submitItems = async (
    items: CartItem[],
    confirmedOverride: boolean,
  ): Promise<PriceGuardPending[]> => {
    const pending: PriceGuardPending[] = [];
    for (const item of items) {
      const salePrice = (parseFloat(item.unitCost) * (1 + markupPct / 100)).toFixed(2);
      try {
        await salesApi.record({
          productName: item.productName,
          qtySold: item.qty,
          salePrice,
          ...(confirmedOverride ? { confirmedOverride: true } : {}),
        });
      } catch (err) {
        if (isPriceGuardWarning(err)) {
          const w = getPriceGuardWarning(err)!;
          pending.push({ cartItem: item, warning: w.message, potentialLoss: w.potentialLoss });
        } else {
          Alert.alert(t.common.error, `${item.productName}: ${getErrorMessage(err)}`);
        }
      }
    }
    return pending;
  };

  const invalidate = (): void => {
    qc.invalidateQueries({ queryKey: QK.inventoryProducts });
    qc.invalidateQueries({ queryKey: QK.inventory() });
    qc.invalidateQueries({ queryKey: QK.salesHistory() });
    qc.invalidateQueries({ queryKey: QK.dashboard });
  };

  const handleSubmit = async (): Promise<void> => {
    if (cart.size === 0) {
      Alert.alert(t.common.noProductsSelected, t.recordSaleModal.noProductsSelectedMsg);
      return;
    }
    setIsSubmitting(true);
    const pending = await submitItems(cartArray, false);
    setIsSubmitting(false);

    if (pending.length > 0) {
      setPriceGuardPending(pending);
    } else {
      invalidate();
      handleClose();
    }
  };

  const handleConfirmOverrides = async (): Promise<void> => {
    setIsSubmitting(true);
    await submitItems(
      priceGuardPending.map((p) => p.cartItem),
      true,
    );
    setIsSubmitting(false);
    invalidate();
    handleClose();
  };

  // ─── Price guard confirmation screen ────────────────────────────────────────
  if (priceGuardPending.length > 0) {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleClose}
      >
        <ScrollView
          className="flex-1 bg-surface dark:bg-slate-900"
          contentContainerClassName="px-6 py-8"
        >
          <View className="bg-card dark:bg-slate-800 border border-danger rounded-2xl p-5 mb-5">
            <Text className="text-2xl mb-2">⚠️</Text>
            <Text className="text-danger font-bold text-lg mb-1">{t.recordSaleModal.priceGuardTitle}</Text>
            <Text className="text-muted dark:text-slate-500 text-sm mb-4">
              {t.recordSaleModal.priceGuardSub(priceGuardPending.length)}
            </Text>
            {priceGuardPending.map(({ cartItem, warning }) => (
              <View key={cartItem.productName} className="border-t border-border dark:border-slate-700 pt-3 mb-2">
                <Text className="text-text dark:text-slate-100 font-semibold capitalize">{cartItem.productName}</Text>
                <Text className="text-muted dark:text-slate-500 text-xs mt-0.5">{warning}</Text>
              </View>
            ))}
          </View>
          <Button
            label={t.recordSaleModal.confirmSellAtLoss}
            variant="danger"
            onPress={handleConfirmOverrides}
            loading={isSubmitting}
            className="mb-3"
          />
          <Button label={t.recordSaleModal.goBack} variant="ghost" onPress={handleClose} />
        </ScrollView>
      </Modal>
    );
  }

  // ─── Main screen ─────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View className="flex-1 bg-surface dark:bg-slate-900">
        {/* Header */}
        <View className="flex-row justify-between items-center px-6 pt-8 pb-4">
          <Text className="text-xl font-bold text-text dark:text-slate-100">{t.recordSaleModal.title}</Text>
          <TouchableOpacity onPress={handleClose}>
            <Text className="text-primary font-medium">{t.common.cancel}</Text>
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View className="px-4 mb-3">
          <View className="flex-row items-center bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl px-4">
            <Text className="text-muted dark:text-slate-500 mr-2 text-base">🔍</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t.recordSaleModal.searchPlaceholder}
              placeholderTextColor="#94A3B8"
              className="flex-1 py-3 text-text dark:text-slate-100 text-base"
              autoCapitalize="none"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <Text className="text-muted dark:text-slate-500 text-xl px-1">×</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Product list */}
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-4 pb-4"
          keyboardShouldPersistTaps="handled"
        >
          {inventoryLoading ? (
            <ActivityIndicator className="mt-12" color="#2563EB" />
          ) : filteredProducts.length === 0 ? (
            <View className="items-center mt-12">
              <Text className="text-4xl mb-3">📦</Text>
              <Text className="text-text dark:text-slate-100 font-semibold">{t.recordSaleModal.noProductsTitle}</Text>
              <Text className="text-muted dark:text-slate-500 text-sm text-center mt-1">
                {search.trim()
                  ? t.recordSaleModal.noProductsSearchMsg
                  : t.recordSaleModal.noProductsEmptyMsg}
              </Text>
            </View>
          ) : (
            filteredProducts.map((product) => {
              const cartItem = cart.get(product.productName);
              const isSelected = !!cartItem;
              const unitCostFc = formatCurrency(product.unitCost);

              return (
                <TouchableOpacity
                  key={product.productName}
                  onPress={() => toggleProduct(product)}
                  activeOpacity={0.85}
                  className={`rounded-2xl border mb-2 p-4 ${
                    isSelected
                      ? 'bg-primary/5 border-primary'
                      : 'bg-card dark:bg-slate-800 border-border dark:border-slate-700'
                  }`}
                >
                  {/* Row: name + check circle */}
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 mr-3">
                      <Text
                        className="text-text dark:text-slate-100 font-semibold capitalize text-base"
                        numberOfLines={1}
                      >
                        {product.productName}
                      </Text>
                      <Text className="text-muted dark:text-slate-500 text-xs mt-0.5">
                        {t.recordSaleModal.costPerUnit(unitCostFc)} · {t.recordSaleModal.inStock(product.totalQty)}
                      </Text>
                    </View>
                    <View
                      className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                        isSelected
                          ? 'bg-primary border-primary'
                          : 'border-border dark:border-slate-700 bg-card dark:bg-slate-800'
                      }`}
                    >
                      {isSelected && (
                        <Text className="text-white text-xs font-bold leading-none">✓</Text>
                      )}
                    </View>
                  </View>

                  {/* Qty stepper + cost breakdown (only when selected) */}
                  {isSelected && cartItem && (
                    <View className="mt-3 pt-3 border-t border-primary/20">
                      {/* Qty stepper */}
                      <View className="flex-row items-center gap-2 mb-3">
                        <Text className="text-muted dark:text-slate-500 text-xs mr-1">{t.recordSaleModal.qty}:</Text>
                        <TouchableOpacity
                          onPress={() => setQty(product.productName, cartItem.qty - 1)}
                          className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 items-center justify-center"
                        >
                          <Text className="text-text dark:text-slate-100 font-bold text-lg leading-none">−</Text>
                        </TouchableOpacity>
                        <TextInput
                          value={String(cartItem.qty)}
                          onChangeText={(v) => setQty(product.productName, parseInt(v, 10) || 1)}
                          keyboardType="number-pad"
                          selectTextOnFocus
                          className="text-text dark:text-slate-100 font-bold text-base text-center w-10 border-b border-border dark:border-slate-700"
                        />
                        <TouchableOpacity
                          onPress={() => setQty(product.productName, cartItem.qty + 1)}
                          disabled={cartItem.qty >= product.totalQty}
                          className={`w-8 h-8 rounded-full items-center justify-center ${
                            cartItem.qty >= product.totalQty
                              ? 'bg-slate-100/50 dark:bg-slate-700/50'
                              : 'bg-slate-100 dark:bg-slate-700'
                          }`}
                        >
                          <Text className={`font-bold text-lg leading-none ${
                            cartItem.qty >= product.totalQty
                              ? 'text-muted dark:text-slate-600'
                              : 'text-text dark:text-slate-100'
                          }`}>+</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Cost breakdown */}
                      <View className="bg-slate-50 dark:bg-slate-700/50 rounded-xl px-3 py-2">
                        <Text className="text-text dark:text-slate-200 text-xs">
                          {t.recordSaleModal.baseTotal(
                            cartItem.qty,
                            unitCostFc,
                            formatCurrency((parseFloat(product.unitCost) * cartItem.qty).toFixed(2)),
                          )}
                        </Text>
                        <Text className="text-primary font-semibold text-sm mt-1">
                          {t.recordSaleModal.markupLine(
                            markupPct,
                            formatCurrency(
                              (parseFloat(product.unitCost) * (1 + markupPct / 100) * cartItem.qty).toFixed(2),
                            ),
                          )}
                        </Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>

        {/* Markup slider */}
        <View className="px-4 py-3 border-t border-border dark:border-slate-700 bg-surface dark:bg-slate-900">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-sm font-semibold text-text dark:text-slate-100">
              {t.recordSaleModal.markup}
            </Text>
            <View className="bg-primary/10 rounded-lg px-3 py-1">
              <Text className="text-primary font-bold text-sm">{markupPct}%</Text>
            </View>
          </View>
          <View
            onLayout={(e) => {
              sliderWidthRef.current = e.nativeEvent.layout.width;
            }}
            style={{ height: 40, justifyContent: 'center' }}
            {...panResponder.panHandlers}
          >
            {/* Track */}
            <View style={{ height: 6, backgroundColor: '#CBD5E1', borderRadius: 3 }}>
              <View
                style={{
                  width: `${markupPct}%`,
                  height: '100%',
                  backgroundColor: '#2563EB',
                  borderRadius: 3,
                }}
              />
            </View>
            {/* Thumb */}
            <View
              style={{
                position: 'absolute',
                left: `${markupPct}%`,
                transform: [{ translateX: -10 }],
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: '#2563EB',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 3,
                elevation: 3,
              }}
            />
          </View>
          <View className="flex-row justify-between mt-0.5">
            <Text className="text-xs text-muted dark:text-slate-500">0%</Text>
            <Text className="text-xs text-muted dark:text-slate-500">100%</Text>
          </View>
        </View>

        {/* Footer */}
        <View className="px-4 pb-8 pt-3 border-t border-border dark:border-slate-700 bg-surface dark:bg-slate-900">
          {cart.size > 0 && (
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-muted dark:text-slate-500 text-sm">
                {t.recordSaleModal.productsSelected(cart.size)}
              </Text>
              <Text className="text-text dark:text-slate-100 font-bold text-lg">
                {t.recordSaleModal.total(formatCurrency(grandTotal.toFixed(2)))}
              </Text>
            </View>
          )}
          <View className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mb-3">
            <Text className="text-blue-700 text-xs">{t.recordSaleModal.supplierFirst}</Text>
          </View>
          <Button
            label={
              cart.size === 0
                ? t.recordSaleModal.selectProductsBtn
                : t.recordSaleModal.recordSaleBtn(cart.size)
            }
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={cart.size === 0}
          />
        </View>
      </View>
    </Modal>
  );
}
