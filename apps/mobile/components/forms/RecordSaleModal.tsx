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
import { salesApi, inventoryApi, quantityDiscountsApi, type ProductSummary } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import {
  resolveQuantityDiscountPercent,
  quantityTierFor,
  clampPercent,
  type QuantityTier,
} from '../../lib/quantity-discount';
import { Button } from '../ui/Button';
import {
  getErrorMessage,
  getPriceGuardWarning,
  isPriceGuardWarning,
  isDiscountReasonRequired,
  getDiscountReasonInfo,
  isNetworkError,
} from '../../lib/utils';
import { useFormatCurrency, useExchangeRate, usdToFcStr, formatFcValue, formatMoney } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import { useAuthStore } from '../../store/auth.store';
import { useOfflineStore } from '../../store/offline.store';
import { printReceipt, shareReceiptAsPdf, generateReceiptId, type ReceiptData } from '../../lib/receipt';
import { usePersonaStore } from '../../store/persona.store';
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
 * **All price fields are FC strings.** Mobile is FC-only — no USD ever
 * surfaces in the UI. The API speaks USD, so prices are converted on
 * submission via the current exchange rate.
 *
 * `unitCostFc` is derived once from `product.latestUnitCost` × rate at the
 * moment the product is added to the cart (read-only reference).
 */
/**
 * Mints a client-side sale id. Same shape as the offline queue's row ids
 * (store/offline.store.ts), so online and replayed sales share one key space —
 * both land in sale_transactions.client_sale_id and dedupe the same way.
 */
function newClientSaleId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface CartItem {
  /**
   * Idempotency key for this cart line, minted once when the line is added and
   * reused by every submit attempt. The server dedupes on (ownerId,
   * clientSaleId), so a request that timed out after the server committed is
   * recognised on retry instead of recording the sale twice.
   *
   * It deliberately does NOT derive from receiptId: a fresh receiptId is minted
   * on every tap of Record Sale (see handleSubmit), which is exactly the retry
   * this key has to survive.
   */
  clientSaleId: string;
  productName: string;
  unitCostFc: string;        // FC, read-only reference
  piecesPerCarton: number | null;
  totalAvailable: number;
  /** FC/USD rate to convert THIS product's prices. For a mini it's the
   *  consignment's locked rate (so the agreement stays fixed); otherwise the
   *  live rate. Captured when the product is added so submit + display agree. */
  rate: string;
  // Quantity
  cartons: string;
  extraPieces: string;
  showExtraPieces: boolean;
  // Pricing — FC
  unitPriceFc: string;       // per piece, in FC (pre-discount)
  cartonPriceFc: string;     // per carton, FC (bidirectionally bound to unitPriceFc via ppc)
  // Original dashboard-set price, in FC, for the "set in dashboard" hint.
  dashboardPriceFc: string;
  // Quantity ("group of prices") discount — off by default. When on, the tier
  // is auto-picked from the line quantity; `discountPctOverride` (blank = use
  // the auto tier %) lets the seller tweak it for this sale.
  applyDiscount: boolean;
  discountPctOverride: string;
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

/** Carton price = unit price × pieces-per-carton. Same direction regardless of currency. */
function deriveCartonPrice(unitPrice: string, ppc: number | null): string {
  const up = parseFloat(unitPrice);
  if (isNaN(up) || up <= 0 || !ppc) return '';
  // Whole-number FC for nicer display in the carton input.
  return String(Math.round(up * ppc));
}

export function RecordSaleModal({ visible, onClose, prefilledProduct = '' }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const exchangeRate = useExchangeRate();
  const user = useAuthStore((s) => s.user);
  // A mini converts each product's prices at its consignment's locked rate, not
  // the live rate — so a rate change never shifts the agreed prices or what they
  // enter/owe. Owner/full employees always use the live rate.
  const isMini = user?.activeEmployment?.tier === 'SALES_ONLY';
  const rateForProduct = (p: Pick<ProductSummary, 'usdToFcRateSnapshot'>): string =>
    isMini && p.usdToFcRateSnapshot ? p.usdToFcRateSnapshot : exchangeRate;
  const { isOffline, cachedProducts, recordOfflineSale, attachOfflineClient } = useOfflineStore();

  const [search, setSearch] = useState(prefilledProduct);
  const [cart, setCart] = useState<Map<string, CartItem>>(new Map());
  const [priceGuardPending, setPriceGuardPending] = useState<PriceGuardPending[]>([]);
  const [discountPending, setDiscountPending] = useState<DiscountPending[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receiptPrompt, setReceiptPrompt] = useState<ReceiptData | null>(null);
  const [receiptClientName, setReceiptClientName] = useState('');
  const [receiptClientPhone, setReceiptClientPhone] = useState('');
  // IDs of the sale rows just created by submitItems — used by the post-sale
  // prompt to PATCH the client info onto them via salesApi.updateClient. The
  // server is the source of truth for buyer details after this; the prompt
  // is just a UX-friendly capture point that runs after the sale lands.
  const [lastOnlineSaleIds, setLastOnlineSaleIds] = useState<string[]>([]);
  // ReceiptId shared across every row of one cart submission. Generated at
  // submit time, sent to the API with each record() / queued with each
  // recordOfflineSale() so a later reprint can regroup the whole receipt.
  const [lastReceiptId, setLastReceiptId] = useState<string | null>(null);

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

  // Shop quantity-discount tiers. Cached long so a config fetched while online
  // stays available if the modal is reopened offline in the same session.
  const { data: qdConfig } = useQuery({
    queryKey: QK.quantityDiscounts,
    queryFn: quantityDiscountsApi.get,
    staleTime: 5 * 60_000,
    enabled: visible && !isOffline,
  });

  const onlineProducts: ProductSummary[] = (productsData ?? []).filter(
    (p) => p.totalAvailable > 0,
  );

  // Offline fallback uses the snapshotted cache. Newer snapshots carry the
  // full carton-aware fields (ppc, latest selling price, latest carton price,
  // category) so the modal offers the same UX as online — sell in cartons,
  // edit carton + unit price, see the dashboard-set selling price as the
  // default. Older snapshots that predate that change fall back gracefully
  // to piece-only mode with selling price = cost.
  const products: ProductSummary[] = isOffline
    ? cachedProducts
        .filter((p) => p.availableQty > 0)
        .map((p) => ({
          productName: p.productName,
          category: p.category ?? null,
          piecesPerCarton: p.piecesPerCarton ?? null,
          latestCartonPrice: p.latestCartonPrice ?? null,
          totalAvailable: p.availableQty,
          sourceBreakdown: { personal: 0, supplier: 0, consignedIn: 0, consignedOut: 0 },
          latestSellingPrice: p.latestSellingPrice ?? p.unitCost,
          latestUnitCost: p.unitCost,
        }))
    : onlineProducts;

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.productName.includes(q));
  }, [products, search]);

  const cartArray = Array.from(cart.values());

  // ── Quantity discount helpers ──────────────────────────────────────────────
  /** Auto tier % for the line's current quantity (0 when no tier is reached). */
  const autoPctFor = (item: CartItem): number =>
    resolveQuantityDiscountPercent(totalPiecesOf(item), item.piecesPerCarton, qdConfig);

  /** Percentage actually applied: the override if typed, else the auto tier %. */
  const effectivePctFor = (item: CartItem): number => {
    if (!qdConfig?.enabled || !item.applyDiscount) return 0;
    const ov = item.discountPctOverride.trim();
    return ov !== '' ? clampPercent(parseFloat(ov)) : autoPctFor(item);
  };

  /** Discounted per-piece FC price (whole FC), or the plain price when no discount. */
  const effectiveUnitPriceFc = (item: CartItem): number => {
    const base = parseFloat(item.unitPriceFc) || 0;
    const pct = effectivePctFor(item);
    return pct > 0 ? Math.round(base * (1 - pct / 100)) : base;
  };

  const tierName = (tier: QuantityTier | null): string =>
    tier === 'carton'
      ? t.recordSaleModal.qdTierCarton
      : tier === 'dozen'
        ? t.recordSaleModal.qdTierDozen
        : tier === 'half_dozen'
          ? t.recordSaleModal.qdTierHalfDozen
          : '';

  /** Free-text discount reason stored on the sale (satisfies the employee rule). */
  const qdReasonFor = (item: CartItem): string | undefined => {
    const pct = effectivePctFor(item);
    if (pct <= 0) return undefined;
    const tier = quantityTierFor(totalPiecesOf(item), item.piecesPerCarton, qdConfig);
    const prefix = t.recordSaleModal.qdReasonPrefix;
    // No tier when the seller manually overrode below the first threshold.
    return tier ? `${prefix}: ${tierName(tier)} (${pct}%)` : `${prefix} (${pct}%)`;
  };

  /** Row total in FC (uses the discounted unit price when a discount applies). */
  const computeRowTotal = (item: CartItem): number => {
    const up = effectiveUnitPriceFc(item);
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
      // Convert the USD API values to FC for in-modal display + input at this
      // product's rate (locked for a mini). The dashboard-set selling price
      // becomes the default; the cost is shown read-only as an FC reference.
      const rate = rateForProduct(product);
      const unitPriceFc = usdToFcStr(product.latestSellingPrice ?? '0', rate);
      const unitCostFc = usdToFcStr(product.latestUnitCost ?? '0', rate);
      next.set(product.productName, {
        clientSaleId: newClientSaleId(),
        productName: product.productName,
        unitCostFc,
        piecesPerCarton: ppc,
        totalAvailable: product.totalAvailable,
        rate,
        // If product has piecesPerCarton, "cartons" starts at 1 carton.
        // Otherwise quantity is in raw pieces, starting at 1.
        cartons: '1',
        extraPieces: '',
        showExtraPieces: false,
        unitPriceFc,
        cartonPriceFc: deriveCartonPrice(unitPriceFc, ppc),
        dashboardPriceFc: unitPriceFc,
        applyDiscount: false,
        discountPctOverride: '',
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

  const setUnitPriceFc = (productName: string, value: string): void => {
    updateItem(productName, {
      unitPriceFc: value,
      cartonPriceFc: deriveCartonPrice(value, cart.get(productName)?.piecesPerCarton ?? null),
    });
  };

  const setCartonPriceFc = (productName: string, value: string): void => {
    const item = cart.get(productName);
    if (!item?.piecesPerCarton) return;
    const cp = parseFloat(value);
    // FC values are whole numbers, so round here to keep the bound unit price tidy.
    const derivedUnit =
      !isNaN(cp) && cp > 0 ? String(Math.round(cp / item.piecesPerCarton)) : item.unitPriceFc;
    updateItem(productName, { cartonPriceFc: value, unitPriceFc: derivedUnit });
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
    const up = parseFloat(item.unitPriceFc);
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
    items: { item: CartItem; totalPieces: number; salePrice: string; salePriceFc?: number; confirmedOverride?: boolean; discountReason?: string; originalUnitPrice?: string }[],
    receiptId: string,
  ): Promise<{
    priceGuard: PriceGuardPending[];
    discount: DiscountPending[];
    saleIds: string[];
    /** Product names whose sale was queued for sync after a network failure. */
    queued: string[];
  }> => {
    const priceGuard: PriceGuardPending[] = [];
    const discount: DiscountPending[] = [];
    const saleIds: string[] = [];
    const queued: string[] = [];
    for (const { item, totalPieces, salePrice, salePriceFc, confirmedOverride, discountReason, originalUnitPrice } of items) {
      try {
        const sale = await salesApi.record({
          productName: item.productName,
          qtySold: totalPieces,
          salePrice,
          // Stable across retries — if this request already committed server-side
          // but the response never arrived, the retry returns that row instead
          // of recording a second sale.
          clientSaleId: item.clientSaleId,
          // Minis send the FC price so the server books each deducted lot at its
          // own locked rate (exact across batches given at different rates).
          ...(isMini && salePriceFc ? { salePriceFc: salePriceFc.toFixed(4) } : {}),
          receiptId,
          ...(confirmedOverride ? { confirmedOverride: true } : {}),
          ...(discountReason ? { discountReason } : {}),
          ...(originalUnitPrice ? { originalUnitPrice } : {}),
        });
        if (sale && typeof sale === 'object' && 'id' in sale && typeof sale.id === 'string') {
          saleIds.push(sale.id);
        }
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
        } else if (isNetworkError(err)) {
          // No verdict from the server — the write may or may not have landed.
          // Queue it under the SAME clientSaleId that was just sent, so the
          // replay either records it once or is recognised as already done.
          // Previously this fell through to a plain alert and the sale was lost.
          recordOfflineSale(item.productName, totalPieces, salePrice, {
            id: item.clientSaleId,
            receiptId,
            ...(originalUnitPrice ? { originalUnitPrice } : {}),
            ...(discountReason ? { discountReason } : {}),
          });
          queued.push(item.productName);
        } else {
          Alert.alert(t.common.error, `${item.productName}: ${getErrorMessage(err)}`);
        }
      }
    }
    if (queued.length > 0) {
      Alert.alert(t.sales.queuedTitle, t.sales.queuedBody(queued.join(', ')));
    }
    return { priceGuard, discount, saleIds, queued };
  };

  const invalidate = (): void => {
    qc.invalidateQueries({ queryKey: QK.inventoryProducts });
    qc.invalidateQueries({ queryKey: QK.inventory() });
    qc.invalidateQueries({ queryKey: QK.salesHistory() });
    // Prefix key: covers summary, home, cash-position, alerts, suppliers.
    qc.invalidateQueries({ queryKey: QK.dashboardAll });
    // Mini employees: refresh their home stats (cash to hand over, I owe, profit).
    qc.invalidateQueries({ queryKey: ['mini-settlements', 'stats'] });
  };

  const offerReceipt = (
    soldItems: { item: CartItem; totalPieces: number; salePrice: string; salePriceFc: number }[],
    receiptId: string,
  ): void => {
    // Resolve the "business" identity based on the current persona:
    //   - Employer mode: the receipt is on the employer's books, so they
    //     are the business.
    //   - Self mode: the user themselves is the business.
    // The "seller" is always the logged-in user — the person who pressed
    // Record Sale, regardless of persona.
    const persona = usePersonaStore.getState().kind;
    const isEmployerMode = persona === 'employer' && !!user?.activeEmployment;

    const businessName = isEmployerMode
      ? undefined // we don't have employer's display name on the client, so the @handle stands alone
      : user?.name ?? undefined;
    const businessHandle = isEmployerMode
      ? user?.activeEmployment?.employer.username
      : user?.username;

    const receiptData: ReceiptData = {
      // Receipt is FC-native — pass per-row FC prices directly (typed by the
      // user) so what the customer sees on the printout matches what was
      // entered, without an extra USD-rate round-trip that can drift by 1 FC.
      items: soldItems.map(({ item, totalPieces, salePriceFc }) => {
        // Pass the merchant-typed carton price through to the receipt so the
        // printed "X FC / ctn" matches the headline number on the quote.
        // The cart's cartonPriceFc is bidirectionally bound to unitPriceFc
        // via piecesPerCarton, but small rounding differences can exist when
        // the merchant edited the carton price directly — preserve what was
        // typed rather than re-deriving.
        const cartonPriceFc = parseFloat(item.cartonPriceFc);
        return {
          productName: item.productName,
          qty: totalPieces,
          unitPriceFc: salePriceFc,
          totalFc: salePriceFc * totalPieces,
          cartons: parseInt(item.cartons, 10) || 0,
          extraPieces: parseInt(item.extraPieces, 10) || 0,
          piecesPerCarton: item.piecesPerCarton,
          cartonPriceFc: isFinite(cartonPriceFc) && cartonPriceFc > 0 ? cartonPriceFc : undefined,
        };
      }),
      grandTotalFc: soldItems.reduce(
        (sum, { totalPieces, salePriceFc }) => sum + salePriceFc * totalPieces,
        0,
      ),
      // Per-item pricing — no single markup applies. Receipt builder reads
      // this only for the footer; treat 0 as "n/a" and the printer skips it.
      markupPct: 0,
      date: new Date().toLocaleString('fr-CD'),
      businessName,
      businessHandle,
      sellerName: user?.name ?? undefined,
      sellerUsername: user?.username,
      receiptId,
    };

    setReceiptClientName('');
    setReceiptClientPhone('');
    setReceiptPrompt(receiptData);
  };

  /**
   * Persists the buyer details captured at the prompt — server-side for
   * online sales (PATCH against every just-created row) and locally in the
   * pending-sales queue for offline ones (the queued POST will carry them
   * when sync runs). Best-effort: failures here don't block the receipt
   * print, since the slip already has the buyer's name on it.
   */
  const persistClient = (clientName: string, clientPhone: string): void => {
    const name = clientName.trim();
    const phone = clientPhone.trim();
    if (!name && !phone) return; // nothing to attach

    if (isOffline && lastReceiptId) {
      attachOfflineClient(lastReceiptId, name || undefined, phone || undefined);
      return;
    }
    // Online: PATCH the first row — the server propagates to siblings via
    // receiptId. We send one request instead of N for cleaner network use.
    const firstId = lastOnlineSaleIds[0];
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

  /**
   * Merge the typed client name/phone into the stored receipt before printing
   * or sharing. Keeps the inputs optional — empty strings are dropped.
   */
  const buildPromptReceipt = (base: ReceiptData): ReceiptData => ({
    ...base,
    clientName: receiptClientName.trim() || undefined,
    clientPhone: receiptClientPhone.trim() || undefined,
  });

  const handlePromptPrint = async (): Promise<void> => {
    if (!receiptPrompt) return;
    persistClient(receiptClientName, receiptClientPhone);
    const data = buildPromptReceipt(receiptPrompt);
    setReceiptPrompt(null);
    try {
      await printReceipt(data);
    } catch (err) {
      if (usePrinterStore.getState().printer) {
        Alert.alert(t.printer.printFailed, getErrorMessage(err));
      } else {
        Alert.alert(t.printer.printFailed, t.printer.noPrinterPaired);
      }
    }
  };

  const handlePromptShare = (): void => {
    if (!receiptPrompt) return;
    persistClient(receiptClientName, receiptClientPhone);
    const data = buildPromptReceipt(receiptPrompt);
    setReceiptPrompt(null);
    void shareReceiptAsPdf(data);
  };

  const handlePromptSkip = (): void => {
    // Persist anyway — if the merchant typed a name/phone then chose "Skip"
    // they probably meant "don't print but save the buyer info".
    persistClient(receiptClientName, receiptClientPhone);
    setReceiptPrompt(null);
  };

  /**
   * Build the per-item submission payload. Converts the user-typed FC price
   * to a USD string (4dp) for the API while keeping the FC value around for
   * the receipt + offline cache.
   */
  const buildSubmitItems = (items: CartItem[]) => items.map((item) => itemToPayloadFull(item));

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

    // One receipt id per cart submission — every row in this batch carries
    // it so the server can later regroup them into a single reprintable
    // receipt. Same id is shown to the merchant on the printed slip.
    const receiptId = generateReceiptId();
    setLastReceiptId(receiptId);

    // ── Offline path ─────────────────────────────────────────────────────────
    if (isOffline) {
      const soldItems = buildSubmitItems(cartArray);
      for (const { item, totalPieces, salePrice, originalUnitPrice, discountReason } of soldItems) {
        recordOfflineSale(item.productName, totalPieces, salePrice, {
          receiptId,
          originalUnitPrice,
          discountReason,
        });
      }
      setLastOnlineSaleIds([]);
      // Open the receipt prompt FIRST, then close the main modal. If the
      // parent ever unmounts us when `visible` flips, the prompt state would
      // be lost — offline this branch is fully synchronous so React commits
      // everything in one render pass and the race was guaranteed. Setting
      // the prompt before handleClose() ensures it lands first.
      offerReceipt(soldItems, receiptId);
      handleClose();
      return;
    }

    // ── Online path ───────────────────────────────────────────────────────────
    setIsSubmitting(true);
    const submitInputs = buildSubmitItems(cartArray);
    const { priceGuard, discount, saleIds } = await submitItems(submitInputs, receiptId);
    setIsSubmitting(false);
    setLastOnlineSaleIds(saleIds);

    if (discount.length > 0) {
      // Discount reason flow takes priority — the items are blocked server-side
      // until a reason is provided.
      setDiscountPending(discount);
    } else if (priceGuard.length > 0) {
      setPriceGuardPending(priceGuard);
    } else {
      invalidate();
      offerReceipt(submitInputs, receiptId);
      handleClose();
    }
  };

  /** Map a CartItem to a full submission payload, converting its FC unit price →
   *  USD at the item's rate (a mini's locked consignment rate, or live) and
   *  folding in any quantity discount: the sent price is the DISCOUNTED price,
   *  and the pre-discount price + reason ride along so the sale records them. */
  const itemToPayloadFull = (
    item: CartItem,
  ): {
    item: CartItem;
    totalPieces: number;
    salePrice: string;
    salePriceFc: number;
    originalUnitPrice?: string;
    discountReason?: string;
  } => {
    const rate = parseFloat(item.rate) || 1;
    const baseFc = parseFloat(item.unitPriceFc) || 0;
    const pct = effectivePctFor(item);
    const salePriceFc = effectiveUnitPriceFc(item); // discounted whole FC
    const salePrice = (salePriceFc / rate).toFixed(4);
    return {
      item,
      totalPieces: totalPiecesOf(item),
      salePrice,
      salePriceFc,
      ...(pct > 0 ? { originalUnitPrice: (baseFc / rate).toFixed(4) } : {}),
      ...(pct > 0 ? { discountReason: qdReasonFor(item) } : {}),
    };
  };

  const handleConfirmOverrides = async (): Promise<void> => {
    const inputs = priceGuardPending.map((p) => ({
      ...itemToPayloadFull(p.cartItem),
      totalPieces: p.totalPieces,
      confirmedOverride: true,
    }));
    const receiptId = lastReceiptId ?? generateReceiptId();
    setLastReceiptId(receiptId);
    setIsSubmitting(true);
    const { saleIds } = await submitItems(inputs, receiptId);
    setIsSubmitting(false);
    setLastOnlineSaleIds((prev) => [...prev, ...saleIds]);
    invalidate();
    offerReceipt(inputs, receiptId);
    handleClose();
  };

  const handleSubmitWithDiscountReasons = async (): Promise<void> => {
    // Validate that every pending discount row has a reason filled in.
    const missing = discountPending.some((p) => !p.reason.trim());
    if (missing) {
      Alert.alert(t.common.error, t.recordSaleModal.discountReasonRequiredMsg);
      return;
    }
    const inputs = discountPending.map((p) => ({
      ...itemToPayloadFull(p.cartItem),
      totalPieces: p.totalPieces,
      discountReason: p.reason.trim(),
    }));
    const receiptId = lastReceiptId ?? generateReceiptId();
    setLastReceiptId(receiptId);
    setIsSubmitting(true);
    const { priceGuard, saleIds } = await submitItems(inputs, receiptId);
    setIsSubmitting(false);
    setLastOnlineSaleIds((prev) => [...prev, ...saleIds]);
    if (priceGuard.length > 0) {
      // Got a price-guard 422 on resubmit — chain into that flow.
      setDiscountPending([]);
      setPriceGuardPending(priceGuard);
      return;
    }
    invalidate();
    offerReceipt(inputs, receiptId);
    handleClose();
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
    <>
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
                            {t.recordSaleModal.costPerUnit(formatMoney(product.latestUnitCost, rateForProduct(product)))}
                          </Text>
                          <Text className="text-success text-xs font-semibold">
                            {t.recordSaleModal.sellAt(formatMoney(product.latestSellingPrice, rateForProduct(product)))}
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
                            <View className="mt-2">
                              <View className="flex-row items-center gap-3">
                                <Text className="text-muted dark:text-slate-400 text-xs flex-shrink-0">
                                  {t.recordSaleModal.extraPiecesLabel}
                                </Text>
                                <TextInput
                                  value={cartItem.extraPieces}
                                  onChangeText={(v) => {
                                    // Strip non-digits, then clamp below pieces-per-carton.
                                    // A value ≥ ppc would be a whole carton, so it must
                                    // be entered as an extra carton instead.
                                    const digits = v.replace(/[^0-9]/g, '');
                                    const ppc = cartItem.piecesPerCarton ?? 0;
                                    let clamped = digits;
                                    if (ppc > 0 && digits !== '') {
                                      const n = parseInt(digits, 10);
                                      if (!isNaN(n) && n >= ppc) clamped = String(ppc - 1);
                                    }
                                    updateItem(product.productName, { extraPieces: clamped });
                                  }}
                                  keyboardType="number-pad"
                                  selectTextOnFocus
                                  placeholder="0"
                                  placeholderTextColor="#94A3B8"
                                  className="text-text dark:text-slate-100 font-semibold text-base w-16 text-center border-b border-border dark:border-slate-700"
                                />
                                <Text className="text-muted dark:text-slate-500 text-[11px]">
                                  / {cartItem.piecesPerCarton}
                                </Text>
                                <TouchableOpacity
                                  onPress={() =>
                                    updateItem(product.productName, { showExtraPieces: false, extraPieces: '' })
                                  }
                                >
                                  <Text className="text-danger text-xs">{t.recordSaleModal.extraPiecesRemove}</Text>
                                </TouchableOpacity>
                              </View>
                              <Text className="text-muted dark:text-slate-500 text-[10px] mt-1 italic">
                                {t.recordSaleModal.extraPiecesHint(cartItem.piecesPerCarton)}
                              </Text>
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

                        {/* Price inputs — FC native */}
                        <View className="mt-3">
                          <Text className="text-muted dark:text-slate-400 text-xs mb-1">
                            {t.recordSaleModal.sellingPriceLabel}
                          </Text>
                          <TextInput
                            value={cartItem.unitPriceFc}
                            onChangeText={(v) => setUnitPriceFc(product.productName, v.replace(/[^0-9]/g, ''))}
                            keyboardType="number-pad"
                            placeholder="0"
                            placeholderTextColor="#94A3B8"
                            className="bg-surface dark:bg-slate-900 border border-border dark:border-slate-700 rounded-xl px-3 py-2 text-text dark:text-slate-100 text-base"
                          />
                          {cartItem.dashboardPriceFc && cartItem.unitPriceFc === cartItem.dashboardPriceFc ? (
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
                              value={cartItem.cartonPriceFc}
                              onChangeText={(v) => setCartonPriceFc(product.productName, v.replace(/[^0-9]/g, ''))}
                              keyboardType="number-pad"
                              placeholder="0"
                              placeholderTextColor="#94A3B8"
                              className="bg-surface dark:bg-slate-900 border border-border dark:border-slate-700 rounded-xl px-3 py-2 text-text dark:text-slate-100 text-base"
                            />
                          </View>
                        ) : null}

                        {/* Quantity ("group of prices") discount */}
                        {qdConfig?.enabled ? (
                          <View className="mt-3 rounded-xl border border-border dark:border-slate-700 px-3 py-2.5">
                            <Pressable
                              onPress={() =>
                                updateItem(product.productName, {
                                  applyDiscount: !cartItem.applyDiscount,
                                })
                              }
                              className="flex-row items-center justify-between"
                            >
                              <Text className="text-text dark:text-slate-100 text-sm font-medium flex-1 mr-2">
                                {t.recordSaleModal.qdToggle}
                              </Text>
                              <View
                                className={`w-11 h-6 rounded-full px-0.5 justify-center ${
                                  cartItem.applyDiscount ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'
                                }`}
                              >
                                <View
                                  className={`w-5 h-5 rounded-full bg-white ${
                                    cartItem.applyDiscount ? 'self-end' : 'self-start'
                                  }`}
                                />
                              </View>
                            </Pressable>

                            {cartItem.applyDiscount ? (
                              (() => {
                                const auto = autoPctFor(cartItem);
                                const pct = effectivePctFor(cartItem);
                                const tier = quantityTierFor(
                                  totalPiecesOf(cartItem),
                                  cartItem.piecesPerCarton,
                                  qdConfig,
                                );
                                if (auto <= 0 && !cartItem.discountPctOverride.trim()) {
                                  return (
                                    <Text className="text-muted dark:text-slate-500 text-[11px] mt-2">
                                      {t.recordSaleModal.qdNotQualified}
                                    </Text>
                                  );
                                }
                                return (
                                  <View className="mt-2">
                                    <View className="flex-row items-center gap-2">
                                      <Text className="text-muted dark:text-slate-400 text-xs flex-1">
                                        {tier
                                          ? t.recordSaleModal.qdTierApplied(tierName(tier))
                                          : t.recordSaleModal.qdCustom}
                                      </Text>
                                      <TextInput
                                        value={cartItem.discountPctOverride}
                                        onChangeText={(v) =>
                                          updateItem(product.productName, {
                                            discountPctOverride: v.replace(/[^0-9.]/g, ''),
                                          })
                                        }
                                        keyboardType="decimal-pad"
                                        placeholder={String(auto)}
                                        placeholderTextColor="#94A3B8"
                                        selectTextOnFocus
                                        className="text-text dark:text-slate-100 font-semibold text-base w-14 text-center border-b border-border dark:border-slate-700"
                                      />
                                      <Text className="text-muted dark:text-slate-500 text-sm">%</Text>
                                    </View>
                                    <Text className="text-success text-[11px] mt-1.5">
                                      {t.recordSaleModal.qdPreview(
                                        pct,
                                        formatFcValue(effectiveUnitPriceFc(cartItem)),
                                      )}
                                    </Text>
                                  </View>
                                );
                              })()
                            ) : null}
                          </View>
                        ) : null}

                        {/* Below-cost warning. Both values are FC so they're directly comparable. */}
                        {(() => {
                          const cost = parseFloat(cartItem.unitCostFc);
                          const sell = effectiveUnitPriceFc(cartItem);
                          if (!isNaN(cost) && cost > 0 && !isNaN(sell) && sell > 0 && sell <= cost) {
                            return (
                              <Text className="text-danger text-[11px] mt-2">
                                ⚠ {t.recordSaleModal.sellingBelowCost}
                              </Text>
                            );
                          }
                          return null;
                        })()}

                        {/* Row total — pure FC, no exchange-rate conversion. */}
                        <View className="mt-3 pt-2 border-t border-border dark:border-slate-700 flex-row justify-between items-center">
                          <Text className="text-muted dark:text-slate-500 text-xs">
                            {formatFcValue(effectiveUnitPriceFc(cartItem) || 0)} × {totalPiecesOf(cartItem)}
                          </Text>
                          <Text className="text-primary font-bold text-base">
                            {formatFcValue(computeRowTotal(cartItem))}
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
                  {t.recordSaleModal.total(formatFcValue(grandTotal))}
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

    {/* Post-sale: capture optional client details, then print/share/skip. */}
    <Modal
      visible={receiptPrompt !== null}
      transparent
      animationType="fade"
      onRequestClose={handlePromptSkip}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center bg-black/50 px-6"
      >
        <View className="bg-surface dark:bg-slate-900 rounded-2xl p-5">
          <Text className="text-text dark:text-slate-100 font-bold text-lg">
            {t.recordSaleModal.receiptPromptTitle}
          </Text>
          <Text className="text-muted dark:text-slate-400 text-sm mt-1 mb-4">
            {t.recordSaleModal.receiptPromptSubtitle}
          </Text>

          <Text className="text-text dark:text-slate-200 text-xs font-semibold mb-1">
            {t.recordSaleModal.receiptClientNameLabel}
          </Text>
          <TextInput
            value={receiptClientName}
            onChangeText={setReceiptClientName}
            placeholder=""
            className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-lg px-3 py-2.5 text-text dark:text-slate-100 mb-3"
            autoCapitalize="words"
          />

          <Text className="text-text dark:text-slate-200 text-xs font-semibold mb-1">
            {t.recordSaleModal.receiptClientPhoneLabel}
          </Text>
          <TextInput
            value={receiptClientPhone}
            onChangeText={setReceiptClientPhone}
            placeholder="+243 …"
            keyboardType="phone-pad"
            className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-lg px-3 py-2.5 text-text dark:text-slate-100 mb-4"
          />

          <View className="flex-row gap-2">
            <Button
              label={t.recordSaleModal.receiptSkipBtn}
              variant="ghost"
              onPress={handlePromptSkip}
              className="flex-1"
            />
            <Button
              label={t.recordSaleModal.receiptShareBtn}
              variant="outline"
              onPress={handlePromptShare}
              className="flex-1"
            />
            <Button
              label={t.recordSaleModal.receiptPrintBtn}
              onPress={() => void handlePromptPrint()}
              className="flex-1"
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </>
  );
}
