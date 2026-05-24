import { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  Alert,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { salesApi, inventoryApi, type ProductSummary } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { Button } from '../ui/Button';
import {
  getErrorMessage,
  getPriceGuardWarning,
  isPriceGuardWarning,
  isDiscountReasonRequired,
  getDiscountReasonInfo,
} from '../../lib/utils';
import { useFormatCurrency, useExchangeRate } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import { useAuthStore } from '../../store/auth.store';
import { useOfflineStore } from '../../store/offline.store';
import { printReceipt, printReceiptViaSystem, shareReceiptAsPdf, type ReceiptData } from '../../lib/receipt';
import { usePrinterStore } from '../../store/printer.store';

interface Props {
  visible: boolean;
  onClose: () => void;
  prefilledProduct?: string;
  unitCost?: string;
}

/**
 * A line in the in-progress sale.
 *
 * `cartons` is the user-typed quantity. When `piecesPerCarton` is set the unit
 * is cartons; otherwise it's already in pieces.
 *
 * Pricing fields are strings so the user can type freely (incl. partial
 * decimals like "12."). Resolved to numbers at submit time.
 */
interface CartItem {
  productName: string;
  unitCost: string;
  piecesPerCarton: number | null;
  totalAvailable: number;
  // Quantity
  cartons: string;
  extraPieces: string;
  showExtraPieces: boolean;
  // Pricing
  unitPrice: string;   // per piece
  cartonPrice: string; // derived from/to unitPrice when ppc set
  // Standard (dashboard-set) price hint, for "default came from here" indicator
  dashboardPrice: string;
}

interface PriceGuardPending {
  cartItem: CartItem;
  warning: string;
  potentialLoss: string;
  totalPieces: number;
}

interface DiscountPending {
  cartItem: CartItem;
  totalPieces: number;
  standardPrice: string;
  submittedPrice: string;
  reason: string;
}

/** Compute total pieces from cartons + optional loose pieces. */
function totalPiecesOf(item: Pick<CartItem, 'cartons' | 'extraPieces' | 'piecesPerCarton'>): number {
  const cartons = parseInt(item.cartons, 10) || 0;
  const extra = parseInt(item.extraPieces, 10) || 0;
  if (item.piecesPerCarton) return cartons * item.piecesPerCarton + extra;
  return cartons;
}

function deriveCartonPrice(unitPrice: string, ppc: number | null): string {
  const up = parseFloat(unitPrice);
  return !isNaN(up) && up > 0 && ppc ? (up * ppc).toFixed(4) : '';
}

export function RecordSaleModal({ visible, onClose, prefilledProduct = '' }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const exchangeRate = useExchangeRate();
  const user = useAuthStore((s) => s.user);
  const { isOffline, cachedProducts, recordOfflineSale } = useOfflineStore();

  const [search, setSearch] = useState(prefilledProduct);
  const [cart, setCart] = useState<Map<string, CartItem>>(new Map());
  const [priceGuardPending, setPriceGuardPending] = useState<PriceGuardPending[]>([]);
  const [discountPending, setDiscountPending] = useState<DiscountPending[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setSearch(prefilledProduct);
      setCart(new Map());
      setPriceGuardPending([]);
      setDiscountPending([]);
    }
  }, [visible, prefilledProduct]);

  const { data: productsData, isLoading: inventoryLoading } = useQuery({
    queryKey: QK.inventoryProducts,
    queryFn: inventoryApi.listProducts,
    staleTime: 30_000,
    enabled: visible && !isOffline,
  });

  const onlineProducts: ProductSummary[] = (productsData ?? []).filter(
    (p) => p.totalAvailable > 0,
  );

  // Offline fallback uses the snapshotted cache (lacks ppc + selling price).
  const products: ProductSummary[] = isOffline
    ? cachedProducts
        .filter((p) => p.availableQty > 0)
        .map((p) => ({
          productName: p.productName,
          category: null,
          piecesPerCarton: null,
          latestCartonPrice: null,
          totalAvailable: p.availableQty,
          sourceBreakdown: { personal: 0, supplier: 0, consignedIn: 0, consignedOut: 0 },
          latestSellingPrice: p.unitCost,
          latestUnitCost: p.unitCost,
        }))
    : onlineProducts;

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.productName.includes(q));
  }, [products, search]);

  const cartArray = Array.from(cart.values());

  const computeRowTotal = (item: CartItem): number => {
    const up = parseFloat(item.unitPrice);
    const tp = totalPiecesOf(item);
    if (isNaN(up) || up <= 0 || tp <= 0) return 0;
    return up * tp;
  };

  const grandTotal = cartArray.reduce((sum, item) => sum + computeRowTotal(item), 0);

  const toggleProduct = (product: ProductSummary): void => {
    setCart((prev) => {
      const next = new Map(prev);
      if (next.has(product.productName)) {
        next.delete(product.productName);
        return next;
      }
      const ppc = product.piecesPerCarton;
      const unitPrice = product.latestSellingPrice ?? '';
      next.set(product.productName, {
        productName: product.productName,
        unitCost: product.latestUnitCost ?? '0.0000',
        piecesPerCarton: ppc,
        totalAvailable: product.totalAvailable,
        // If product has piecesPerCarton, "cartons" starts at 1 carton.
        // Otherwise quantity is in raw pieces, starting at 1.
        cartons: '1',
        extraPieces: '',
        showExtraPieces: false,
        unitPrice,
        cartonPrice: deriveCartonPrice(unitPrice, ppc),
        dashboardPrice: unitPrice,
      });
      return next;
    });
  };

  const updateItem = (productName: string, patch: Partial<CartItem>): void => {
    setCart((prev) => {
      const next = new Map(prev);
      const cur = next.get(productName);
      if (cur) next.set(productName, { ...cur, ...patch });
      return next;
    });
  };

  const setCartonsAdj = (productName: string, delta: number): void => {
    setCart((prev) => {
      const next = new Map(prev);
      const cur = next.get(productName);
      if (!cur) return prev;
      const current = parseInt(cur.cartons, 10) || 0;
      next.set(productName, { ...cur, cartons: String(Math.max(0, current + delta)) });
      return next;
    });
  };

  const setUnitPrice = (productName: string, value: string): void => {
    updateItem(productName, {
      unitPrice: value,
      cartonPrice: deriveCartonPrice(value, cart.get(productName)?.piecesPerCarton ?? null),
    });
  };

  const setCartonPrice = (productName: string, value: string): void => {
    const item = cart.get(productName);
    if (!item?.piecesPerCarton) return;
    const cp = parseFloat(value);
    const derivedUnit =
      !isNaN(cp) && cp > 0 ? (cp / item.piecesPerCarton).toFixed(4) : item.unitPrice;
    updateItem(productName, { cartonPrice: value, unitPrice: derivedUnit });
  };

  const handleClose = (): void => {
    setCart(new Map());
    setSearch('');
    setPriceGuardPending([]);
    setDiscountPending([]);
    onClose();
  };

  // ── Validation ───────────────────────────────────────────────────────────
  // Each cart item must: have qty > 0, valid extra pieces (< ppc when set),
  // a positive selling price.
  const isItemValid = (item: CartItem): { ok: boolean; reason?: string } => {
    const tp = totalPiecesOf(item);
    if (tp <= 0) return { ok: false, reason: 'qty' };
    if (tp > item.totalAvailable) return { ok: false, reason: 'overstock' };
    if (item.piecesPerCarton) {
      const extra = parseInt(item.extraPieces, 10) || 0;
      if (extra >= item.piecesPerCarton) {
        return { ok: false, reason: 'extra-too-large' };
      }
    }
    const up = parseFloat(item.unitPrice);
    if (isNaN(up) || up <= 0) return { ok: false, reason: 'price' };
    return { ok: true };
  };

  const allValid = cartArray.length > 0 && cartArray.every((i) => isItemValid(i).ok);

  // ── Submission ───────────────────────────────────────────────────────────
  /**
   * Tries to record every cart item. Returns the items that need follow-up:
   *   - priceGuard: sale was at or below cost — caller decides whether to retry with confirmedOverride
   *   - discount: employee priced below standard — caller must collect a reason and retry
   * Errors that aren't recoverable are alerted inline.
   */
  const submitItems = async (
    items: { item: CartItem; totalPieces: number; salePrice: string; confirmedOverride?: boolean; discountReason?: string }[],
  ): Promise<{
    priceGuard: PriceGuardPending[];
    discount: DiscountPending[];
  }> => {
    const priceGuard: PriceGuardPending[] = [];
    const discount: DiscountPending[] = [];
    for (const { item, totalPieces, salePrice, confirmedOverride, discountReason } of items) {
      try {
        await salesApi.record({
          productName: item.productName,
          qtySold: totalPieces,
          salePrice,
          ...(confirmedOverride ? { confirmedOverride: true } : {}),
          ...(discountReason ? { discountReason } : {}),
        });
      } catch (err) {
        if (isPriceGuardWarning(err)) {
          const w = getPriceGuardWarning(err)!;
          priceGuard.push({
            cartItem: item,
            warning: w.message,
            potentialLoss: w.potentialLoss,
            totalPieces,
          });
        } else if (isDiscountReasonRequired(err)) {
          const info = getDiscountReasonInfo(err)!;
          discount.push({
            cartItem: item,
            totalPieces,
            standardPrice: info.standardPrice,
            submittedPrice: info.submittedPrice,
            reason: '',
          });
        } else {
          Alert.alert(t.common.error, `${item.productName}: ${getErrorMessage(err)}`);
        }
      }
    }
    return { priceGuard, discount };
  };

  const invalidate = (): void => {
    qc.invalidateQueries({ queryKey: QK.inventoryProducts });
    qc.invalidateQueries({ queryKey: QK.inventory() });
    qc.invalidateQueries({ queryKey: QK.salesHistory() });
    qc.invalidateQueries({ queryKey: QK.dashboard });
    qc.invalidateQueries({ queryKey: QK.cashPosition });
  };

  const offerReceipt = (
    soldItems: { item: CartItem; totalPieces: number; salePrice: string }[],
  ): void => {
    const rate = parseFloat(exchangeRate) || 1;
    const receiptData: ReceiptData = {
      items: soldItems.map(({ item, totalPieces, salePrice }) => {
        const unitPriceFc = parseFloat(salePrice) * rate;
        return {
          productName: item.productName,
          qty: totalPieces,
          unitPriceFc,
          totalFc: unitPriceFc * totalPieces,
        };
      }),
      grandTotalFc: soldItems.reduce(
        (sum, { totalPieces, salePrice }) => sum + parseFloat(salePrice) * totalPieces * rate,
        0,
      ),
      // Per-item pricing — no single markup applies. Receipt builder reads
      // this only for the footer; treat 0 as "n/a" and the printer skips it.
      markupPct: 0,
      date: new Date().toLocaleString('fr-CD'),
      sellerUsername: user?.username,
    };

    const handlePrint = async () => {
      try {
        await printReceipt(receiptData);
      } catch (err) {
        if (usePrinterStore.getState().printer) {
          Alert.alert(t.printer.printFailed, getErrorMessage(err), [
            { text: t.common.cancel, style: 'cancel' },
            { text: t.printer.fallbackUsed, onPress: () => void printReceiptViaSystem(receiptData) },
          ]);
        } else {
          Alert.alert(t.printer.printFailed, getErrorMessage(err));
        }
      }
    };

    Alert.alert('✅ Sale recorded', 'Would you like a receipt?', [
      { text: 'Print', onPress: () => void handlePrint() },
      { text: 'Share PDF', onPress: () => void shareReceiptAsPdf(receiptData) },
      { text: 'Skip', style: 'cancel' },
    ]);
  };

  const buildSubmitItems = (items: CartItem[]) =>
    items.map((item) => ({
      item,
      totalPieces: totalPiecesOf(item),
      salePrice: parseFloat(item.unitPrice).toFixed(4),
    }));

  const handleSubmit = async (): Promise<void> => {
    if (cart.size === 0) {
      Alert.alert(t.common.noProductsSelected, t.recordSaleModal.noProductsSelectedMsg);
      return;
    }
    for (const item of cartArray) {
      const v = isItemValid(item);
      if (!v.ok && v.reason === 'extra-too-large') {
        Alert.alert(t.common.error, t.recordSaleModal.extraPiecesTooLarge(item.piecesPerCarton ?? 0));
        return;
      }
    }
    if (!allValid) {
      Alert.alert(t.common.missingFields, t.recordSaleModal.noProductsSelectedMsg);
      return;
    }

    // ── Offline path ─────────────────────────────────────────────────────────
    if (isOffline) {
      const soldItems = buildSubmitItems(cartArray);
      for (const { item, totalPieces, salePrice } of soldItems) {
        recordOfflineSale(item.productName, totalPieces, salePrice);
      }
      handleClose();
      offerReceipt(soldItems);
      return;
    }

    // ── Online path ───────────────────────────────────────────────────────────
    setIsSubmitting(true);
    const submitInputs = buildSubmitItems(cartArray);
    const { priceGuard, discount } = await submitItems(submitInputs);
    setIsSubmitting(false);

    if (discount.length > 0) {
      // Discount reason flow takes priority — the items are blocked server-side
      // until a reason is provided.
      setDiscountPending(discount);
    } else if (priceGuard.length > 0) {
      setPriceGuardPending(priceGuard);
    } else {
      invalidate();
      handleClose();
      offerReceipt(submitInputs);
    }
  };

  const handleConfirmOverrides = async (): Promise<void> => {
    const inputs = priceGuardPending.map((p) => ({
      item: p.cartItem,
      totalPieces: p.totalPieces,
      salePrice: parseFloat(p.cartItem.unitPrice).toFixed(4),
      confirmedOverride: true,
    }));
    setIsSubmitting(true);
    await submitItems(inputs);
    setIsSubmitting(false);
    invalidate();
    handleClose();
    offerReceipt(inputs);
  };

  const handleSubmitWithDiscountReasons = async (): Promise<void> => {
    // Validate that every pending discount row has a reason filled in.
    const missing = discountPending.some((p) => !p.reason.trim());
    if (missing) {
      Alert.alert(t.common.error, t.recordSaleModal.discountReasonRequiredMsg);
      return;
    }
    const inputs = discountPending.map((p) => ({
      item: p.cartItem,
      totalPieces: p.totalPieces,
      salePrice: parseFloat(p.cartItem.unitPrice).toFixed(4),
      discountReason: p.reason.trim(),
    }));
    setIsSubmitting(true);
    const { priceGuard } = await submitItems(inputs);
    setIsSubmitting(false);
    if (priceGuard.length > 0) {
      // Got a price-guard 422 on resubmit — chain into that flow.
      setDiscountPending([]);
      setPriceGuardPending(priceGuard);
      return;
    }
    invalidate();
    handleClose();
    offerReceipt(inputs);
  };

  // ── Sub-screens ─────────────────────────────────────────────────────────

  if (discountPending.length > 0) {
    return (
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            className="flex-1 bg-surface dark:bg-slate-900"
            contentContainerClassName="px-6 py-8"
            keyboardShouldPersistTaps="handled"
          >
            <View className="bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded-2xl p-5 mb-5">
              <Text className="text-2xl mb-2">⚠️</Text>
              <Text className="text-amber-700 dark:text-amber-300 font-bold text-lg mb-1">
                {t.recordSaleModal.discountTitle}
              </Text>
              <Text className="text-amber-700 dark:text-amber-400 text-sm">
                {t.recordSaleModal.discountSub(discountPending.length)}
              </Text>
            </View>

            {discountPending.map((d, idx) => (
              <View
                key={d.cartItem.productName}
                className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl px-4 py-3 mb-3"
              >
                <Text className="text-text dark:text-slate-100 font-semibold capitalize">
                  {d.cartItem.productName}
                </Text>
                <Text className="text-muted dark:text-slate-400 text-xs mt-0.5">
                  {t.recordSaleModal.pricedBelow(
                    formatCurrency(d.standardPrice),
                  )}
                </Text>
                <Text className="text-amber-700 dark:text-amber-400 text-xs mb-2">
                  → {formatCurrency(d.submittedPrice)}
                </Text>
                <Text className="text-muted dark:text-slate-400 text-xs mb-1">
                  {t.recordSaleModal.discountReasonLabel}
                </Text>
                <TextInput
                  value={d.reason}
                  onChangeText={(v) =>
                    setDiscountPending((arr) =>
                      arr.map((p, i) => (i === idx ? { ...p, reason: v } : p)),
                    )
                  }
                  placeholder={t.recordSaleModal.discountReasonPlaceholder}
                  placeholderTextColor="#94A3B8"
                  multiline
                  className="bg-surface dark:bg-slate-900 border border-border dark:border-slate-700 rounded-xl px-3 py-2 text-text dark:text-slate-100 text-sm"
                  style={{ minHeight: 60, textAlignVertical: 'top' }}
                />
              </View>
            ))}

            <Button
              label={t.recordSaleModal.confirmDiscountBtn}
              onPress={handleSubmitWithDiscountReasons}
              loading={isSubmitting}
              className="mb-2"
            />
            <Button label={t.recordSaleModal.goBack} variant="ghost" onPress={handleClose} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  if (priceGuardPending.length > 0) {
    return (
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View className="flex-1 bg-surface dark:bg-slate-900">
          {/* Header */}
          <View className="flex-row justify-between items-center px-6 pt-8 pb-4">
            <View className="flex-row items-center gap-2">
              <Text className="text-xl font-bold text-text dark:text-slate-100">{t.recordSaleModal.title}</Text>
              {isOffline && (
                <View className="bg-amber-100 dark:bg-amber-900 rounded-full px-2 py-0.5">
                  <Text className="text-amber-700 dark:text-amber-300 text-xs font-bold">📴 OFFLINE</Text>
                </View>
              )}
            </View>
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
                  {search.trim() ? t.recordSaleModal.noProductsSearchMsg : t.recordSaleModal.noProductsEmptyMsg}
                </Text>
              </View>
            ) : (
              filteredProducts.map((product) => {
                const cartItem = cart.get(product.productName);
                const isSelected = !!cartItem;
                return (
                  <View
                    key={product.productName}
                    className={`rounded-2xl border mb-2 ${
                      isSelected
                        ? 'bg-primary/5 border-primary'
                        : 'bg-card dark:bg-slate-800 border-border dark:border-slate-700'
                    }`}
                  >
                    {/* Header row — tap to toggle */}
                    <TouchableOpacity
                      onPress={() => toggleProduct(product)}
                      activeOpacity={0.85}
                      className="flex-row items-start justify-between p-4"
                    >
                      <View className="flex-1 mr-3">
                        <Text className="text-text dark:text-slate-100 font-semibold capitalize text-base" numberOfLines={1}>
                          {product.productName}
                        </Text>
                        <View className="flex-row flex-wrap gap-x-3 mt-1">
                          <Text className="text-muted dark:text-slate-500 text-xs">
                            {t.recordSaleModal.costPerUnit(formatCurrency(product.latestUnitCost))}
                          </Text>
                          <Text className="text-success text-xs font-semibold">
                            {t.recordSaleModal.sellAt(formatCurrency(product.latestSellingPrice))}
                          </Text>
                          <Text className="text-muted dark:text-slate-500 text-xs">
                            {t.recordSaleModal.inStock(product.totalAvailable)}
                          </Text>
                        </View>
                      </View>
                      <View
                        className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                          isSelected
                            ? 'bg-primary border-primary'
                            : 'border-border dark:border-slate-700 bg-card dark:bg-slate-800'
                        }`}
                      >
                        {isSelected && <Text className="text-white text-xs font-bold leading-none">✓</Text>}
                      </View>
                    </TouchableOpacity>

                    {/* Expanded editing */}
                    {isSelected && cartItem && (
                      <View className="px-4 pb-4 pt-1 border-t border-primary/20">
                        {/* Qty */}
                        <View className="flex-row items-center gap-3 mt-3">
                          <Text className="text-muted dark:text-slate-400 text-xs flex-shrink-0">
                            {cartItem.piecesPerCarton ? t.recordSaleModal.cartonsLabel : t.recordSaleModal.qtyLabel}
                          </Text>
                          <View className="flex-row items-center gap-1">
                            <TouchableOpacity
                              onPress={() => setCartonsAdj(product.productName, -1)}
                              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 items-center justify-center"
                            >
                              <Text className="text-text dark:text-slate-100 font-bold text-lg leading-none">−</Text>
                            </TouchableOpacity>
                            <TextInput
                              value={cartItem.cartons}
                              onChangeText={(v) => updateItem(product.productName, { cartons: v.replace(/[^0-9]/g, '') })}
                              keyboardType="number-pad"
                              selectTextOnFocus
                              className="text-text dark:text-slate-100 font-bold text-base text-center w-12 border-b border-border dark:border-slate-700 mx-1"
                            />
                            <TouchableOpacity
                              onPress={() => setCartonsAdj(product.productName, +1)}
                              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 items-center justify-center"
                            >
                              <Text className="text-text dark:text-slate-100 font-bold text-lg leading-none">+</Text>
                            </TouchableOpacity>
                          </View>
                          {cartItem.piecesPerCarton ? (
                            <Text className="text-muted dark:text-slate-500 text-xs flex-1">
                              × {cartItem.piecesPerCarton} pcs
                            </Text>
                          ) : null}
                        </View>

                        {/* Extra loose pieces (only when product is carton-aware) */}
                        {cartItem.piecesPerCarton ? (
                          cartItem.showExtraPieces ? (
                            <View className="flex-row items-center gap-3 mt-2">
                              <Text className="text-muted dark:text-slate-400 text-xs flex-shrink-0">
                                {t.recordSaleModal.extraPiecesLabel}
                              </Text>
                              <TextInput
                                value={cartItem.extraPieces}
                                onChangeText={(v) =>
                                  updateItem(product.productName, { extraPieces: v.replace(/[^0-9]/g, '') })
                                }
                                keyboardType="number-pad"
                                selectTextOnFocus
                                placeholder="0"
                                placeholderTextColor="#94A3B8"
                                className="text-text dark:text-slate-100 font-semibold text-base w-16 text-center border-b border-border dark:border-slate-700"
                              />
                              <TouchableOpacity
                                onPress={() =>
                                  updateItem(product.productName, { showExtraPieces: false, extraPieces: '' })
                                }
                              >
                                <Text className="text-danger text-xs">{t.recordSaleModal.extraPiecesRemove}</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <Pressable
                              onPress={() => updateItem(product.productName, { showExtraPieces: true })}
                              className="mt-2"
                            >
                              <Text className="text-primary text-xs font-semibold">
                                {t.recordSaleModal.extraPiecesToggle}
                              </Text>
                            </Pressable>
                          )
                        ) : null}

                        {/* Total pieces (when carton mode) */}
                        {cartItem.piecesPerCarton ? (
                          <Text className="text-muted dark:text-slate-500 text-[11px] mt-1">
                            {t.recordSaleModal.totalPieces(totalPiecesOf(cartItem))}
                          </Text>
                        ) : null}

                        {/* Price inputs */}
                        <View className="mt-3">
                          <Text className="text-muted dark:text-slate-400 text-xs mb-1">
                            {t.recordSaleModal.sellingPriceLabel}
                          </Text>
                          <TextInput
                            value={cartItem.unitPrice}
                            onChangeText={(v) => setUnitPrice(product.productName, v)}
                            keyboardType="decimal-pad"
                            placeholder="0.00"
                            placeholderTextColor="#94A3B8"
                            className="bg-surface dark:bg-slate-900 border border-border dark:border-slate-700 rounded-xl px-3 py-2 text-text dark:text-slate-100 text-base"
                          />
                          {cartItem.dashboardPrice && cartItem.unitPrice === cartItem.dashboardPrice ? (
                            <Text className="text-muted dark:text-slate-500 text-[11px] mt-1 italic">
                              {t.recordSaleModal.dashboardPriceHint}
                            </Text>
                          ) : null}
                        </View>

                        {cartItem.piecesPerCarton ? (
                          <View className="mt-2">
                            <Text className="text-muted dark:text-slate-400 text-xs mb-1">
                              {t.recordSaleModal.cartonPriceLabel}
                            </Text>
                            <TextInput
                              value={cartItem.cartonPrice}
                              onChangeText={(v) => setCartonPrice(product.productName, v)}
                              keyboardType="decimal-pad"
                              placeholder="0.00"
                              placeholderTextColor="#94A3B8"
                              className="bg-surface dark:bg-slate-900 border border-border dark:border-slate-700 rounded-xl px-3 py-2 text-text dark:text-slate-100 text-base"
                            />
                          </View>
                        ) : null}

                        {/* Below-cost warning (server-side guarded too, but this avoids the round-trip when obvious) */}
                        {(() => {
                          const cost = parseFloat(cartItem.unitCost);
                          const sell = parseFloat(cartItem.unitPrice);
                          if (!isNaN(cost) && cost > 0 && !isNaN(sell) && sell > 0 && sell <= cost) {
                            return (
                              <Text className="text-danger text-[11px] mt-2">
                                ⚠ {t.recordSaleModal.sellingBelowCost}
                              </Text>
                            );
                          }
                          return null;
                        })()}

                        {/* Row total */}
                        <View className="mt-3 pt-2 border-t border-border dark:border-slate-700 flex-row justify-between items-center">
                          <Text className="text-muted dark:text-slate-500 text-xs">
                            {formatCurrency(cartItem.unitPrice || '0')} × {totalPiecesOf(cartItem)}
                          </Text>
                          <Text className="text-primary font-bold text-base">
                            {formatCurrency(computeRowTotal(cartItem).toFixed(4))}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Footer */}
          <View className="px-4 pb-8 pt-3 border-t border-border dark:border-slate-700 bg-surface dark:bg-slate-900">
            {cart.size > 0 && (
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-muted dark:text-slate-500 text-sm">
                  {t.recordSaleModal.productsSelected(cart.size)}
                </Text>
                <Text className="text-text dark:text-slate-100 font-bold text-lg">
                  {t.recordSaleModal.total(formatCurrency(grandTotal.toFixed(4)))}
                </Text>
              </View>
            )}
            <View className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-xl px-3 py-2 mb-3">
              <Text className="text-blue-700 dark:text-blue-300 text-xs">{t.recordSaleModal.supplierFirst}</Text>
            </View>
            <Button
              label={
                cart.size === 0
                  ? t.recordSaleModal.selectProductsBtn
                  : t.recordSaleModal.recordSaleBtn(cart.size)
              }
              onPress={handleSubmit}
              loading={isSubmitting}
              disabled={cart.size === 0 || !allValid}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
