import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  View,
  Text,
  Pressable,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProductSummary, ProductVariantSummary } from '@trading-app/types';
import { salesApi, quantityDiscountsApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import {
  resolveQuantityDiscountPercent,
  quantityTierFor,
  clampPercent,
  type QuantityTier,
} from '../../lib/quantity-discount';
import { useExchangeRate, formatMoney, formatFcValue } from '../../lib/currency';
import { printReceipt, shareReceiptAsPdf, generateReceiptId, type ReceiptData, type ReceiptItem } from '../../lib/receipt';
import { getErrorMessage, isPriceGuardWarning, getPriceGuardWarning } from '../../lib/utils';
import { useAuthStore } from '../../store/auth.store';
import { usePersonaStore } from '../../store/persona.store';
import { usePrinterStore } from '../../store/printer.store';
import { Button } from '../ui/Button';
import { useT } from '../../lib/i18n';
import { useBrand } from '../../lib/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  group: ProductSummary | null;
  /**
   * Hand this product's sizes over to the multi-product cart
   * (RecordSaleModal), which can hold sized and normal products at once and
   * bills them onto ONE receipt. Provided by the screens that also mount that
   * cart; the button stays hidden where it isn't.
   */
  onSellWithOthers?: () => void;
}

type Mode = 'carton' | 'size';

/** One selected size in the by-size cart — several can be selected at once so
 *  a single receipt can cover different sizes bought together. */
interface SizeCartRow {
  variantId: string;
  label: string;
  available: number;
  rate: string; // this size's FC/USD rate (mini-locked or live)
  qty: number;
  unitPriceFc: number; // rounded FC per piece
}

interface SizePriceGuardPending {
  row: SizeCartRow;
  warning: string;
}

/**
 * Sell a sized (carton-with-variants) product: either one or more WHOLE cartons
 * at the group carton price, or a cart of one-or-more chosen sizes by the piece
 * (so a customer buying several different sizes at once still gets one
 * receipt). Prices display in FC (at the mini's locked rate when applicable);
 * the sale posts USD on the wire — carton via `{ carton, groupId, cartonQty }`,
 * each size via `{ variantId, qtySold }`. Online-only for now (sized sales
 * don't yet flow through the offline queue). Both modes end with the same
 * print/share/skip receipt prompt used by the regular sale flow.
 */
export function SellSizedProductModal({ visible, onClose, group, onSellWithOthers }: Props) {
  const brand = useBrand();
  const t = useT();
  const qc = useQueryClient();
  const exchangeRate = useExchangeRate();
  const user = useAuthStore((s) => s.user);
  const isMini = user?.activeEmployment?.tier === 'SALES_ONLY';

  const variants = useMemo(() => group?.variants ?? [], [group]);
  const cartonPriceUsd = group?.cartonSellingPrice ? parseFloat(group.cartonSellingPrice) : null;
  const cartonsAvailable = group?.cartonsAvailable ?? 0;
  const canCarton = cartonPriceUsd != null && cartonsAvailable > 0;

  const [mode, setMode] = useState<Mode>('carton');
  // Carton mode
  const [qty, setQty] = useState(1);
  const [cartonPriceFc, setCartonPriceFc] = useState('');
  const [applyDiscount, setApplyDiscount] = useState(false);
  const [discountPctOverride, setDiscountPctOverride] = useState('');
  // By-size mode — a cart of selected sizes, each with its own quantity.
  const [sizeCart, setSizeCart] = useState<Map<string, SizeCartRow>>(new Map());
  const [sizePriceGuardPending, setSizePriceGuardPending] = useState<SizePriceGuardPending[]>([]);
  // Rows already recorded server-side from the first submit pass, carried over
  // so the eventual receipt includes them even when other rows in the same
  // batch needed a price-guard confirmation first.
  const [sizeRowsAlreadySold, setSizeRowsAlreadySold] = useState<SizeCartRow[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [lastReceiptId, setLastReceiptId] = useState<string | null>(null);
  const [receiptPrompt, setReceiptPrompt] = useState<ReceiptData | null>(null);
  const [printingReceipt, setPrintingReceipt] = useState(false);
  // Optional buyer details typed at the prompt, plus the ids of the rows this
  // sale just created — one PATCH against the first row propagates the buyer
  // across the whole receipt server-side (see SalesService.updateClient).
  const [receiptClientName, setReceiptClientName] = useState('');
  const [receiptClientPhone, setReceiptClientPhone] = useState('');
  const [lastSaleIds, setLastSaleIds] = useState<string[]>([]);

  const { data: qdConfig } = useQuery({
    queryKey: QK.quantityDiscounts,
    queryFn: quantityDiscountsApi.get,
    staleTime: 5 * 60_000,
    enabled: visible,
  });

  // Reset each time a different product opens; default to whichever mode is sellable.
  useEffect(() => {
    if (!visible || !group) return;
    setMode(canCarton ? 'carton' : 'size');
    setQty(1);
    setSizeCart(new Map());
    setSizePriceGuardPending([]);
    setSizeRowsAlreadySold([]);
    setSubmitting(false);
    setLastSaleIds([]);
    setReceiptClientName('');
    setReceiptClientPhone('');
    setApplyDiscount(false);
    setDiscountPctOverride('');
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

  // ── Receipt prompt: buyer details, then print / share / skip ──────────────
  // Everything in this section is declared ABOVE the `!group` guard on purpose.
  // The sell sheet closes the moment a sale lands (see the submit handlers),
  // which makes the parent drop `group` — a prompt defined below the guard
  // would be unmounted before the merchant could print. Same reason
  // inventory.tsx keeps RecordSaleModal permanently mounted.

  /**
   * Attach the buyer to the sale server-side. One PATCH against the first row
   * of the batch — the API fans it out to every sibling sharing the receiptId,
   * so a later search by name or phone finds the whole transaction. Best
   * effort: a failure here never blocks the print, the slip already carries
   * the name. Sized sales are online-only, so there's no offline branch (the
   * normal-sale prompt queues it; here the sale itself could not have happened).
   */
  const persistClient = (clientName: string, clientPhone: string): void => {
    const name = clientName.trim();
    const phone = clientPhone.trim();
    if (!name && !phone) return;
    const firstId = lastSaleIds[0];
    if (!firstId) return;
    void salesApi
      .updateClient(firstId, {
        clientName: name || undefined,
        clientPhone: phone || undefined,
      })
      .catch(() => {
        // best-effort — the print continues regardless
      });
  };

  /** Merge the typed buyer details into the slip about to be printed/shared. */
  const buildPromptReceipt = (base: ReceiptData): ReceiptData => ({
    ...base,
    clientName: receiptClientName.trim() || undefined,
    clientPhone: receiptClientPhone.trim() || undefined,
  });

  const handlePrintReceipt = async (): Promise<void> => {
    if (!receiptPrompt) return;
    persistClient(receiptClientName, receiptClientPhone);
    const data = buildPromptReceipt(receiptPrompt);
    setReceiptPrompt(null);
    setPrintingReceipt(true);
    try {
      await printReceipt(data);
    } catch (err) {
      if (usePrinterStore.getState().printer) {
        Alert.alert(t.printer.printFailed, getErrorMessage(err));
      } else {
        Alert.alert(t.printer.printFailed, t.printer.noPrinterPaired);
      }
    } finally {
      setPrintingReceipt(false);
    }
  };

  const handleShareReceipt = (): void => {
    if (!receiptPrompt) return;
    persistClient(receiptClientName, receiptClientPhone);
    void shareReceiptAsPdf(buildPromptReceipt(receiptPrompt));
    setReceiptPrompt(null);
  };

  const handleSkipReceipt = (): void => {
    // Typed a buyer then chose Skip — they meant "don't print, but keep the
    // name on the sale". Same reading as the normal-sale prompt.
    persistClient(receiptClientName, receiptClientPhone);
    setReceiptPrompt(null);
  };

  /** The prompt itself — the only modal on screen once the sheet has closed. */
  const receiptPromptModal = (
    <Modal
      visible={receiptPrompt !== null}
      transparent
      animationType="fade"
      onRequestClose={handleSkipReceipt}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center bg-black/50 px-6"
      >
        <View className="bg-surface rounded-2xl p-5">
          <Text className="text-text font-bold text-lg">
            {t.recordSaleModal.receiptPromptTitle}
          </Text>
          <Text className="text-muted text-sm mt-1 mb-4">
            {t.recordSaleModal.receiptPromptSubtitle}
          </Text>

          <Text className="text-text text-xs font-semibold mb-1">
            {t.recordSaleModal.receiptClientNameLabel}
          </Text>
          <TextInput
            value={receiptClientName}
            onChangeText={setReceiptClientName}
            placeholder=""
            className="bg-card border border-border rounded-lg px-3 py-2.5 text-text mb-3"
            autoCapitalize="words"
          />

          <Text className="text-text text-xs font-semibold mb-1">
            {t.recordSaleModal.receiptClientPhoneLabel}
          </Text>
          <TextInput
            value={receiptClientPhone}
            onChangeText={setReceiptClientPhone}
            placeholder="+243 …"
            keyboardType="phone-pad"
            className="bg-card border border-border rounded-lg px-3 py-2.5 text-text mb-4"
          />

          <View className="flex-row gap-2">
            <Button label={t.recordSaleModal.receiptSkipBtn} variant="ghost" onPress={handleSkipReceipt} className="flex-1" />
            <Button label={t.recordSaleModal.receiptShareBtn} variant="outline" onPress={handleShareReceipt} className="flex-1" />
            <Button
              label={t.recordSaleModal.receiptPrintBtn}
              onPress={() => void handlePrintReceipt()}
              loading={printingReceipt}
              className="flex-1"
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  if (!group) return receiptPromptModal;

  const groupRate = isMini && group.usdToFcRateSnapshot ? group.usdToFcRateSnapshot : exchangeRate;
  const rateFor = (v: ProductVariantSummary) =>
    isMini && v.usdToFcRateSnapshot ? v.usdToFcRateSnapshot : groupRate;

  const maxQty = cartonsAvailable;
  const clampedQty = Math.max(1, Math.min(qty, Math.max(1, maxQty)));

  // Effective carton price (USD) from the editable FC input, at the locked rate.
  const cartonPriceFcNum = parseFloat(cartonPriceFc) || 0;
  const effectiveCartonUsd = cartonPriceFcNum / (parseFloat(groupRate) || 1);

  // Quantity ("group of prices") discount — CARTON mode only. Individual sizes
  // are single products, so a by-size sale never gets a quantity discount; the
  // discount applies to whole-carton purchases. The tier is resolved from the
  // total pieces in the carton sale (cartonQty × pieces-across-all-sizes), so a
  // whole carton naturally lands on the carton tier.
  const piecesPerCartonTotal = variants
    .filter((v) => v.piecesPerCarton > 0)
    .reduce((s, v) => s + v.piecesPerCarton, 0);
  const cartonTotalPieces = clampedQty * piecesPerCartonTotal;
  const cartonAutoPct = resolveQuantityDiscountPercent(
    cartonTotalPieces,
    piecesPerCartonTotal,
    qdConfig,
  );
  const cartonDiscountPct =
    mode === 'carton' && applyDiscount
      ? discountPctOverride.trim() !== ''
        ? clampPercent(parseFloat(discountPctOverride))
        : cartonAutoPct
      : 0;
  const cartonTier: QuantityTier | null = quantityTierFor(
    cartonTotalPieces,
    piecesPerCartonTotal,
    qdConfig,
  );
  // Discount applies on top of the (editable) carton price.
  const discountedCartonUsd =
    cartonDiscountPct > 0 ? effectiveCartonUsd * (1 - cartonDiscountPct / 100) : effectiveCartonUsd;
  const discountedCartonFcNum =
    cartonDiscountPct > 0 ? Math.round(cartonPriceFcNum * (1 - cartonDiscountPct / 100)) : cartonPriceFcNum;

  const cartonLineTotalUsd = discountedCartonUsd * clampedQty;

  // ── By-size cart ──────────────────────────────────────────────────────────
  const sizeCartArray = Array.from(sizeCart.values());
  const sizeGrandTotalFc = sizeCartArray.reduce((s, r) => s + r.unitPriceFc * r.qty, 0);

  const toggleVariant = (v: ProductVariantSummary): void => {
    if (v.available <= 0) return;
    setSizeCart((prev) => {
      const next = new Map(prev);
      if (next.has(v.variantId)) {
        next.delete(v.variantId);
        return next;
      }
      const rate = rateFor(v);
      next.set(v.variantId, {
        variantId: v.variantId,
        label: v.label,
        available: v.available,
        rate,
        qty: 1,
        unitPriceFc: Math.round(parseFloat(v.sellingPrice) * (parseFloat(rate) || 1)),
      });
      return next;
    });
  };

  const adjustSizeQty = (variantId: string, delta: number): void => {
    setSizeCart((prev) => {
      const next = new Map(prev);
      const row = next.get(variantId);
      if (!row) return prev;
      const q = Math.max(1, Math.min(row.available, row.qty + delta));
      next.set(variantId, { ...row, qty: q });
      return next;
    });
  };

  const tierName = (tier: QuantityTier | null): string =>
    tier === 'carton'
      ? t.recordSaleModal.qdTierCarton
      : tier === 'dozen'
        ? t.recordSaleModal.qdTierDozen
        : tier === 'half_dozen'
          ? t.recordSaleModal.qdTierHalfDozen
          : '';

  // ── Receipt building ─────────────────────────────────────────────────────
  const baseReceiptFields = (receiptId: string) => {
    // Same identity rules as the regular sale receipt: employer-mode sales are
    // on the employer's books, self-mode sales are the user's own; the seller
    // is always whoever pressed Sell.
    const persona = usePersonaStore.getState().kind;
    const isEmployerMode = persona === 'employer' && !!user?.activeEmployment;
    const businessName = isEmployerMode ? undefined : user?.name ?? undefined;
    const businessHandle = isEmployerMode ? user?.activeEmployment?.employer.username : user?.username;
    return {
      markupPct: 0,
      date: new Date().toLocaleString('fr-CD'),
      businessName,
      businessHandle,
      sellerName: user?.name ?? undefined,
      sellerUsername: user?.username,
      receiptId,
    };
  };

  const offerCartonReceipt = (receiptId: string): void => {
    const totalFc = discountedCartonFcNum * clampedQty;
    const items: ReceiptItem[] = [
      {
        productName: group.productName,
        qty: clampedQty * piecesPerCartonTotal,
        unitPriceFc: piecesPerCartonTotal > 0 ? discountedCartonFcNum / piecesPerCartonTotal : discountedCartonFcNum,
        totalFc,
        cartons: clampedQty,
        extraPieces: 0,
        piecesPerCarton: piecesPerCartonTotal || null,
        cartonPriceFc: discountedCartonFcNum,
      },
    ];
    setReceiptClientName('');
    setReceiptClientPhone('');
    setReceiptPrompt({ items, grandTotalFc: totalFc, ...baseReceiptFields(receiptId) });
  };

  const offerSizeReceipt = (rows: SizeCartRow[], receiptId: string): void => {
    const items: ReceiptItem[] = rows.map((r) => ({
      productName: r.label ? `${group.productName} · ${r.label}` : group.productName,
      qty: r.qty,
      unitPriceFc: r.unitPriceFc,
      totalFc: r.unitPriceFc * r.qty,
    }));
    const grandTotalFc = rows.reduce((s, r) => s + r.unitPriceFc * r.qty, 0);
    setReceiptClientName('');
    setReceiptClientPhone('');
    setReceiptPrompt({ items, grandTotalFc, ...baseReceiptFields(receiptId) });
  };

  /**
   * Fire-and-forget, exactly like RecordSaleModal's. `invalidateQueries`
   * resolves only once every refetch it triggers has come back, so awaiting it
   * before offering the receipt put the print prompt behind five network round
   * trips — on a weak connection the merchant saw the sale land and no way to
   * print. The caches still refresh; the receipt just no longer waits on them.
   */
  /** `salesApi.record()` is loosely typed — narrow to the created row's id. */
  const saleIdOf = (sale: unknown): string | null =>
    sale && typeof sale === 'object' && 'id' in sale && typeof sale.id === 'string'
      ? sale.id
      : null;

  const invalidate = (): void => {
    void qc.invalidateQueries({ queryKey: QK.inventoryProducts });
    void qc.invalidateQueries({ queryKey: QK.inventory() });
    void qc.invalidateQueries({ queryKey: QK.salesHistory() });
    void qc.invalidateQueries({ queryKey: QK.dashboardAll });
    void qc.invalidateQueries({ queryKey: ['mini-settlements', 'stats'] });
  };

  // ── Carton-mode submit (unchanged behavior, now ends with the receipt prompt) ──
  const submitCarton = async (confirmedOverride = false): Promise<void> => {
    const receiptId = lastReceiptId ?? generateReceiptId();
    setLastReceiptId(receiptId);
    setSubmitting(true);
    try {
      const reason =
        cartonDiscountPct > 0
          ? cartonTier
            ? `${t.recordSaleModal.qdReasonPrefix}: ${tierName(cartonTier)} (${cartonDiscountPct}%)`
            : `${t.recordSaleModal.qdReasonPrefix} (${cartonDiscountPct}%)`
          : undefined;
      const sale = await salesApi.record({
        productName: group.productName,
        carton: true,
        groupId: group.groupId,
        cartonQty: clampedQty,
        salePrice: discountedCartonUsd.toFixed(4),
        ...(isMini ? { salePriceFc: discountedCartonFcNum.toFixed(4) } : {}),
        ...(cartonDiscountPct > 0 ? { originalUnitPrice: effectiveCartonUsd.toFixed(4) } : {}),
        ...(reason ? { discountReason: reason } : {}),
        receiptId,
        ...(confirmedOverride ? { confirmedOverride: true } : {}),
      });
      setLastSaleIds(saleIdOf(sale) ? [saleIdOf(sale)!] : []);
      // Prompt first, close the sheet, then refresh caches — the prompt is the
      // only modal left on screen (stacking it over the open pageSheet is what
      // the normal-sale flow avoids too).
      offerCartonReceipt(receiptId);
      invalidate();
      onClose();
    } catch (err) {
      if (isPriceGuardWarning(err)) {
        const w = getPriceGuardWarning(err);
        Alert.alert(t.sizedSale.priceGuardTitle, w?.message ?? '', [
          { text: t.common.cancel, style: 'cancel' },
          { text: t.sizedSale.confirmLoss, style: 'destructive', onPress: () => void submitCarton(true) },
        ]);
      } else {
        Alert.alert(t.common.error, getErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── By-size submit — one salesApi.record() call per selected size, all
  // sharing one receiptId so a reprint regroups them into one receipt. Returns
  // both the rows that recorded successfully and the ones that need a
  // price-guard confirmation, so a partial batch can still be fully receipted
  // once the pending rows are resolved.
  const submitSizeRows = async (
    rows: SizeCartRow[],
    receiptId: string,
    confirmedOverride = false,
  ): Promise<{
    succeeded: SizeCartRow[];
    priceGuard: SizePriceGuardPending[];
    saleIds: string[];
  }> => {
    const succeeded: SizeCartRow[] = [];
    const priceGuard: SizePriceGuardPending[] = [];
    const saleIds: string[] = [];
    for (const row of rows) {
      try {
        const salePriceUsd = (row.unitPriceFc / (parseFloat(row.rate) || 1)).toFixed(4);
        const sale = await salesApi.record({
          productName: group.productName,
          variantId: row.variantId,
          qtySold: row.qty,
          salePrice: salePriceUsd,
          ...(isMini ? { salePriceFc: row.unitPriceFc.toFixed(4) } : {}),
          receiptId,
          ...(confirmedOverride ? { confirmedOverride: true } : {}),
        });
        const id = saleIdOf(sale);
        if (id) saleIds.push(id);
        succeeded.push(row);
      } catch (err) {
        if (isPriceGuardWarning(err)) {
          const w = getPriceGuardWarning(err);
          priceGuard.push({ row, warning: w?.message ?? '' });
        } else {
          Alert.alert(t.common.error, `${row.label}: ${getErrorMessage(err)}`);
        }
      }
    }
    return { succeeded, priceGuard, saleIds };
  };

  async function handleSizeSubmit() {
    if (sizeCartArray.length === 0) return;
    const receiptId = generateReceiptId();
    setLastReceiptId(receiptId);
    setSubmitting(true);
    const { succeeded, priceGuard, saleIds } = await submitSizeRows(sizeCartArray, receiptId);
    setSubmitting(false);
    setLastSaleIds(saleIds);
    if (priceGuard.length > 0) {
      // Rows that already recorded ride along so the eventual receipt (once
      // the pending ones are confirmed or abandoned) still includes them.
      setSizeRowsAlreadySold(succeeded);
      setSizePriceGuardPending(priceGuard);
      return;
    }
    // Every row failed for a non-price-guard reason (already alerted) — leave
    // the sheet open on the merchant's selection rather than offering a
    // receipt with nothing on it.
    if (succeeded.length === 0) {
      invalidate();
      return;
    }
    offerSizeReceipt(succeeded, receiptId);
    setSizeCart(new Map());
    invalidate();
    onClose();
  }

  async function handleSizeConfirmOverrides() {
    const rows = sizePriceGuardPending.map((p) => p.row);
    const receiptId = lastReceiptId ?? generateReceiptId();
    setSubmitting(true);
    const { succeeded, saleIds } = await submitSizeRows(rows, receiptId, true);
    setSubmitting(false);
    // Append: rows recorded on the first pass carry the same receiptId, and
    // the client PATCH fans out from whichever row it lands on.
    setLastSaleIds((prev) => [...prev, ...saleIds]);
    setSizePriceGuardPending([]);
    const sold = [...sizeRowsAlreadySold, ...succeeded];
    setSizeRowsAlreadySold([]);
    setSizeCart(new Map());
    invalidate();
    if (sold.length === 0) return;
    offerSizeReceipt(sold, receiptId);
    onClose();
  }

  // The price-guard sub-screen below renders with a hardcoded `visible` (not
  // tied to the `visible` prop), same pattern as RecordSaleModal — so canceling
  // out of it must clear the pending state itself before calling onClose(),
  // or this sub-screen would stay stuck on top after the parent thinks it closed.
  const handleCancelSizePriceGuard = (): void => {
    setSizePriceGuardPending([]);
    setSizeRowsAlreadySold([]);
    setSizeCart(new Map());
    onClose();
  };

  const canSubmit =
    mode === 'carton' ? canCarton && cartonPriceFcNum > 0 : sizeCartArray.length > 0;

  // ── Sub-screen: by-size price guard confirmation ──────────────────────────
  if (sizePriceGuardPending.length > 0) {
    return (
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <ScrollView className="flex-1 bg-background" contentContainerClassName="px-6 py-8">
          <View className="bg-card border border-danger rounded-2xl p-5 mb-5">
            <Text className="text-2xl mb-2">⚠️</Text>
            <Text className="text-danger font-bold text-lg mb-1">{t.sizedSale.priceGuardTitle}</Text>
            {sizePriceGuardPending.map(({ row, warning }) => (
              <View key={row.variantId} className="border-t border-border pt-3 mb-2">
                <Text className="text-text font-semibold capitalize">
                  {group.productName} · {row.label}
                </Text>
                <Text className="text-muted text-xs mt-0.5">{warning}</Text>
              </View>
            ))}
          </View>
          <Button
            label={t.sizedSale.confirmLoss}
            variant="danger"
            onPress={() => void handleSizeConfirmOverrides()}
            loading={submitting}
            className="mb-3"
          />
          <Button label={t.common.cancel} variant="ghost" onPress={handleCancelSizePriceGuard} />
        </ScrollView>
      </Modal>
    );
  }

  return (
    <>
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="px-6 py-8"
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-xl font-bold text-text capitalize flex-1 mr-2" numberOfLines={2}>
            {group.productName}
          </Text>
          <Pressable onPress={onClose}>
            <Text className="text-primary font-medium">{t.common.cancel}</Text>
          </Pressable>
        </View>

        {/* Mode tabs */}
        <View className="flex-row bg-card rounded-xl p-1 mb-5">
          <Pressable
            onPress={() => {
              if (!canCarton) return;
              setMode('carton');
              setQty(1);
            }}
            className={`flex-1 py-2.5 rounded-lg items-center ${mode === 'carton' ? 'bg-primary' : ''}`}
            style={{ opacity: canCarton ? 1 : 0.4 }}
          >
            <Text className={mode === 'carton' ? 'text-white font-semibold' : 'text-text'}>
              {t.sizedSale.cartonTab}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode('size')}
            className={`flex-1 py-2.5 rounded-lg items-center ${mode === 'size' ? 'bg-primary' : ''}`}
          >
            <Text className={mode === 'size' ? 'text-white font-semibold' : 'text-text'}>
              {t.sizedSale.sizeTab}
            </Text>
          </Pressable>
        </View>

        {mode === 'carton' ? (
          <>
            <View className="bg-card rounded-xl px-4 py-4 mb-4">
              {canCarton ? (
                <>
                  <Text className="text-muted text-sm mb-1">
                    {t.sizedSale.cartonPriceEditable}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <TextInput
                      value={cartonPriceFc}
                      onChangeText={(v) => setCartonPriceFc(v.replace(/[^0-9]/g, ''))}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={brand.mutedSubtle}
                      className="flex-1 bg-surface border border-border rounded-xl px-4 py-3 text-text text-base"
                    />
                    <Text className="text-muted text-sm">
                      FC {t.sizedSale.perCarton}
                    </Text>
                  </View>
                  <Text className="text-muted text-xs mt-1.5">
                    {t.sizedSale.cartonsAvailable(cartonsAvailable)}
                  </Text>
                </>
              ) : (
                <Text className="text-muted text-sm">{t.sizedSale.noCartonPrice}</Text>
              )}
            </View>

            {/* Quantity stepper */}
            {canCarton && (
              <View className="flex-row justify-between items-center bg-card rounded-xl px-4 py-3 mb-4">
                <Text className="text-text font-medium">{t.sizedSale.cartonQtyLabel}</Text>
                <View className="flex-row items-center gap-4">
                  <Pressable
                    onPress={() => setQty((q) => Math.max(1, q - 1))}
                    className="w-10 h-10 rounded-full bg-surface items-center justify-center"
                  >
                    <Text className="text-text text-xl">−</Text>
                  </Pressable>
                  <Text className="text-text text-lg font-bold w-8 text-center">{clampedQty}</Text>
                  <Pressable
                    onPress={() => setQty((q) => Math.min(maxQty, q + 1))}
                    className="w-10 h-10 rounded-full bg-surface items-center justify-center"
                  >
                    <Text className="text-text text-xl">+</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Quantity discount — whole-carton sales only (sizes are single products) */}
            {canCarton && qdConfig?.enabled && (
              <View className="rounded-xl border border-border px-4 py-3 mb-4">
                <Pressable
                  onPress={() => setApplyDiscount((v) => !v)}
                  className="flex-row items-center justify-between"
                >
                  <Text className="text-text text-sm font-medium flex-1 mr-2">
                    {t.recordSaleModal.qdToggle}
                  </Text>
                  <View
                    className={`w-11 h-6 rounded-full px-0.5 justify-center ${
                      applyDiscount ? 'bg-primary' : 'bg-muted-subtle'
                    }`}
                  >
                    <View className={`w-5 h-5 rounded-full bg-white ${applyDiscount ? 'self-end' : 'self-start'}`} />
                  </View>
                </Pressable>

                {applyDiscount &&
                  (cartonAutoPct <= 0 && !discountPctOverride.trim() ? (
                    <Text className="text-muted text-[11px] mt-2">
                      {t.recordSaleModal.qdNotQualified}
                    </Text>
                  ) : (
                    <View className="mt-2">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-muted text-xs flex-1">
                          {cartonTier
                            ? t.recordSaleModal.qdTierApplied(tierName(cartonTier))
                            : t.recordSaleModal.qdCustom}
                        </Text>
                        <TextInput
                          value={discountPctOverride}
                          onChangeText={(v) => setDiscountPctOverride(v.replace(/[^0-9.]/g, ''))}
                          keyboardType="decimal-pad"
                          placeholder={String(cartonAutoPct)}
                          placeholderTextColor={brand.mutedSubtle}
                          selectTextOnFocus
                          className="text-text font-semibold text-base w-14 text-center border-b border-border"
                        />
                        <Text className="text-muted text-sm">%</Text>
                      </View>
                      <Text className="text-success text-[11px] mt-1.5">
                        −{cartonDiscountPct}% → {formatMoney(discountedCartonUsd.toString(), groupRate)}{' '}
                        {t.sizedSale.perCarton}
                      </Text>
                    </View>
                  ))}
              </View>
            )}

            {/* Total */}
            {canCarton && (
              <View className="flex-row justify-between items-center mb-5">
                <Text className="text-muted">{t.sizedSale.total}</Text>
                <Text className="text-text text-xl font-bold">
                  {formatMoney(cartonLineTotalUsd.toString(), groupRate)}
                </Text>
              </View>
            )}
          </>
        ) : (
          <>
            <Text className="text-muted text-sm mb-1">{t.sizedSale.pickSize}</Text>
            <Text className="text-muted text-xs mb-3">{t.sizedSale.multiSizeHint}</Text>
            {variants.map((v) => {
              const row = sizeCart.get(v.variantId);
              const isSel = !!row;
              const out = v.available <= 0;
              return (
                <View
                  key={v.variantId}
                  className={`rounded-xl mb-2 border ${
                    isSel ? 'border-primary bg-primary/5' : 'border-border bg-card'
                  }`}
                  style={{ opacity: out ? 0.45 : 1 }}
                >
                  <Pressable
                    onPress={() => toggleVariant(v)}
                    disabled={out}
                    className="flex-row justify-between items-center px-4 py-3"
                  >
                    <View className="flex-1 mr-2">
                      <Text className="text-text font-semibold capitalize">{v.label}</Text>
                      <Text className="text-muted text-xs">
                        {out ? t.sizedSale.outOfStock : t.sizedSale.sizeAvailable(v.available)}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <Text className="text-text font-medium">
                        {formatMoney(v.sellingPrice, rateFor(v))}{' '}
                        <Text className="text-muted text-xs">{t.sizedSale.perPiece}</Text>
                      </Text>
                      <View
                        className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                          isSel ? 'bg-primary border-primary' : 'border-border'
                        }`}
                      >
                        {isSel && <Text className="text-white text-xs font-bold leading-none">✓</Text>}
                      </View>
                    </View>
                  </Pressable>

                  {isSel && row && (
                    <View className="flex-row justify-between items-center px-4 pb-3 pt-1 border-t border-primary/20">
                      <Text className="text-muted text-xs">{t.sizedSale.quantity}</Text>
                      <View className="flex-row items-center gap-3">
                        <TouchableOpacity
                          onPress={() => adjustSizeQty(v.variantId, -1)}
                          className="w-8 h-8 rounded-full bg-background items-center justify-center"
                        >
                          <Text className="text-text font-bold text-lg leading-none">−</Text>
                        </TouchableOpacity>
                        <Text className="text-text font-bold w-6 text-center">{row.qty}</Text>
                        <TouchableOpacity
                          onPress={() => adjustSizeQty(v.variantId, 1)}
                          className="w-8 h-8 rounded-full bg-background items-center justify-center"
                        >
                          <Text className="text-text font-bold text-lg leading-none">+</Text>
                        </TouchableOpacity>
                        <Text className="text-primary font-semibold text-sm ml-1">
                          {formatFcValue(row.unitPriceFc * row.qty)}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}

            {sizeCartArray.length > 0 && (
              <View className="flex-row justify-between items-center mt-3 mb-5">
                <Text className="text-muted">
                  {t.sizedSale.sizesSelected(sizeCartArray.length)}
                </Text>
                <Text className="text-text text-xl font-bold">
                  {formatFcValue(sizeGrandTotalFc)}
                </Text>
              </View>
            )}
          </>
        )}

        <Button
          label={submitting ? t.sizedSale.selling : t.sizedSale.sell}
          onPress={() => void (mode === 'carton' ? submitCarton(false) : handleSizeSubmit())}
          loading={submitting}
          disabled={!canSubmit || submitting}
        />

        {/* Escape hatch to the multi-product cart. Sizes only — the cart sells
            sized products by the piece; a whole carton stays here. */}
        {mode === 'size' && onSellWithOthers && (
          <View className="mt-4">
            <Button
              label={t.sizedSale.sellWithOthers}
              variant="ghost"
              onPress={onSellWithOthers}
              disabled={submitting}
            />
            <Text className="text-muted text-xs text-center mt-1">
              {t.sizedSale.sellWithOthersHint}
            </Text>
          </View>
        )}
      </ScrollView>
    </Modal>

    {/* Post-sale: print/share/skip the receipt (covers whole-carton and by-size sales alike). */}
    {receiptPromptModal}
    </>
  );
}
