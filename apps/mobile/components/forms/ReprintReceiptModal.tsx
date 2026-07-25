import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { salesApi, inventoryApi } from '../../lib/api';
import { useExchangeRate } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import { useAuthStore } from '../../store/auth.store';
import { usePersonaStore } from '../../store/persona.store';
import { usePrinterStore } from '../../store/printer.store';
import { Button } from '../ui/Button';
import {
  printReceipt,
  shareReceiptAsPdf,
  type ReceiptData,
  type ReceiptItem,
} from '../../lib/receipt';
import { formatDate, getErrorMessage } from '../../lib/utils';

interface SaleRow {
  id: string;
  productName: string;
  qtySold: number;
  salePrice: string;
  date: string;
  clientName?: string | null;
  clientPhone?: string | null;
  receiptId?: string | null;
  actor?: { id: string; username: string } | null;
}

interface Props {
  /** The sale row the user tapped. Drives the lookup — if it carries a
   *  receiptId, we fetch all sibling rows to reconstruct the full original
   *  receipt; otherwise we reprint just this single row. */
  source: SaleRow | null;
  onClose: () => void;
}

/**
 * Reprint a past sale from the sales history. Reconstructs a `ReceiptData`
 * from the stored row(s) — uses the original USD `salePrice` × current
 * exchange rate to derive the FC amount printed. The original carton vs.
 * loose-piece breakdown isn't preserved on `SaleTransaction` (only total
 * qty is stored), so the reprint shows `qty × unit` without the
 * "3 cartons × 24 pcs + 2 pcs" line, but the carton-tier price line still
 * renders when the product has a known `piecesPerCarton`.
 */
export function ReprintReceiptModal({ source, onClose }: Props) {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const exchangeRate = useExchangeRate();
  const [printing, setPrinting] = useState(false);

  // If the source carries a receiptId we fetch all siblings to rebuild the
  // multi-item receipt. Without one we reprint just the tapped row.
  const receiptId = source?.receiptId ?? null;
  const { data: siblings, isLoading } = useQuery({
    queryKey: ['sales', 'by-receipt', receiptId],
    queryFn: () => salesApi.byReceipt(receiptId!),
    enabled: !!receiptId && !!source,
    staleTime: 30_000,
  });

  // Product list for piecesPerCarton lookup — used so the reprint can render
  // the "X FC / ctn (N pcs)" line even though SaleTransaction doesn't carry
  // ppc directly. Falls back to no carton info if the product was renamed
  // or removed since the sale.
  const { data: products } = useQuery({
    queryKey: ['inventory', 'products'],
    queryFn: () => inventoryApi.listProducts(),
    enabled: !!source,
    staleTime: 5 * 60_000,
  });
  const ppcMap = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const p of (products as { productName: string; piecesPerCarton: number | null }[] | undefined) ?? []) {
      m.set(p.productName, p.piecesPerCarton);
    }
    return m;
  }, [products]);

  // Sibling rows from the API. When no receiptId, fall back to the trigger
  // row only — keeps legacy sales (pre-receiptId migration) reprintable as
  // single-item receipts.
  const rows: SaleRow[] = useMemo(() => {
    if (receiptId && Array.isArray(siblings)) return siblings as SaleRow[];
    return source ? [source] : [];
  }, [receiptId, siblings, source]);

  const receiptData: ReceiptData | null = useMemo(() => {
    if (rows.length === 0) return null;
    const rate = parseFloat(exchangeRate) || 1;
    const items: ReceiptItem[] = rows.map((r) => {
      const unitFc = parseFloat(r.salePrice) * rate;
      return {
        productName: r.productName,
        qty: r.qtySold,
        unitPriceFc: unitFc,
        totalFc: unitFc * r.qtySold,
        piecesPerCarton: ppcMap.get(r.productName) ?? null,
      };
    });
    const grandTotalFc = items.reduce((sum, it) => sum + it.totalFc, 0);

    const persona = usePersonaStore.getState().kind;
    const isEmployerMode = persona === 'employer' && !!user?.activeEmployment;
    const businessName = isEmployerMode ? undefined : user?.name ?? undefined;
    const businessHandle = isEmployerMode
      ? user?.activeEmployment?.employer.username
      : user?.username;

    // Seller = the actor who recorded the original sale (preserved on the row).
    const firstActor = rows.find((r) => r.actor)?.actor;
    const sellerName = firstActor ? undefined : user?.name ?? undefined;
    const sellerUsername = firstActor?.username ?? user?.username;

    const clientName = rows.find((r) => r.clientName)?.clientName ?? undefined;
    const clientPhone = rows.find((r) => r.clientPhone)?.clientPhone ?? undefined;
    const receiptIdent =
      rows.find((r) => r.receiptId)?.receiptId ?? source?.id.slice(0, 6).toUpperCase();

    return {
      items,
      grandTotalFc,
      markupPct: 0,
      date: new Date(rows[0].date).toLocaleString('fr-CD'),
      businessName,
      businessHandle,
      sellerName,
      sellerUsername,
      receiptId: receiptIdent,
      clientName: clientName ?? undefined,
      clientPhone: clientPhone ?? undefined,
    };
  }, [rows, ppcMap, exchangeRate, user, source]);

  // Reset the printing flag when the modal closes.
  useEffect(() => {
    if (!source) setPrinting(false);
  }, [source]);

  if (!source) return null;

  const handlePrint = async () => {
    if (!receiptData) return;
    setPrinting(true);
    try {
      await printReceipt(receiptData);
      onClose();
    } catch (err) {
      if (usePrinterStore.getState().printer) {
        Alert.alert(t.printer.printFailed, getErrorMessage(err));
      } else {
        Alert.alert(t.printer.printFailed, t.printer.noPrinterPaired);
      }
    } finally {
      setPrinting(false);
    }
  };

  const handleShare = () => {
    if (!receiptData) return;
    void shareReceiptAsPdf(receiptData);
    onClose();
  };

  const total = receiptData?.grandTotalFc ?? 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-surface dark:bg-slate-900 rounded-t-3xl px-5 py-6 max-h-[85%]">
          <Text className="text-text dark:text-slate-100 font-bold text-lg mb-1">
            {t.sales.reprintTitle}
          </Text>
          <Text className="text-muted dark:text-slate-500 text-xs mb-3">
            {formatDate(source.date)}
          </Text>

          {isLoading ? (
            <View className="items-center py-8">
              <ActivityIndicator color="#2563EB" />
              <Text className="text-muted dark:text-slate-500 text-sm mt-2">
                {t.sales.reprintLoading}
              </Text>
            </View>
          ) : (
            <ScrollView className="max-h-72 mb-3">
              {/* Client info */}
              {receiptData?.clientName || receiptData?.clientPhone ? (
                <View className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl px-3 py-2 mb-3">
                  <Text className="text-muted dark:text-slate-500 text-xs">
                    {t.sales.clientLabel}
                  </Text>
                  <Text className="text-text dark:text-slate-100 font-semibold">
                    {receiptData?.clientName ?? ''}
                  </Text>
                  {receiptData?.clientPhone ? (
                    <Text className="text-muted dark:text-slate-400 text-sm">
                      {receiptData.clientPhone}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text className="text-muted dark:text-slate-500 text-xs italic mb-3">
                  {t.sales.reprintNoClient}
                </Text>
              )}

              {/* Line items */}
              {receiptData?.items.map((it, idx) => (
                <View
                  key={`${it.productName}-${idx}`}
                  className="flex-row justify-between py-1.5 border-b border-border dark:border-slate-800"
                >
                  <View className="flex-1 mr-2">
                    <Text className="text-text dark:text-slate-100 capitalize">
                      {it.productName} × {it.qty}
                    </Text>
                    {it.piecesPerCarton ? (
                      <Text className="text-muted dark:text-slate-500 text-xs">
                        {Math.round(it.unitPriceFc * it.piecesPerCarton).toLocaleString('fr-CD')} FC / ctn ({it.piecesPerCarton} pcs)
                      </Text>
                    ) : null}
                  </View>
                  <Text className="text-text dark:text-slate-100 font-semibold">
                    {Math.round(it.totalFc).toLocaleString('fr-CD')} FC
                  </Text>
                </View>
              ))}

              <View className="flex-row justify-between mt-3 pt-2 border-t-2 border-text dark:border-slate-100">
                <Text className="text-text dark:text-slate-100 font-bold text-base">TOTAL</Text>
                <Text className="text-text dark:text-slate-100 font-bold text-base">
                  {Math.round(total).toLocaleString('fr-CD')} FC
                </Text>
              </View>
            </ScrollView>
          )}

          <View className="flex-row gap-2 mt-2">
            <Button label={t.sales.reprintClose} variant="ghost" onPress={onClose} className="flex-1" />
            <Button label={t.sales.reprintShare} variant="outline" onPress={handleShare} className="flex-1" />
            <Button
              label={t.sales.reprintPrint}
              onPress={() => void handlePrint()}
              loading={printing}
              className="flex-1"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
