import { useMemo, useState } from 'react';
import { Modal, ScrollView, View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { consignmentsApi, type ConsignmentSummary } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useExchangeRate, useFormatCurrency } from '../../lib/currency';
import { breakdownQuantity, formatBreakdown, getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';
import { useAuthStore } from '../../store/auth.store';
import { usePrinterStore } from '../../store/printer.store';
import {
  printReceivedGoods,
  printReceivedGoodsViaSystem,
  shareReceivedGoodsPdf,
  toReceivedGoodsSlip,
} from '../../lib/handover-receipt';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Mini-employee inbox of products the owner has assigned to them. Confirming a
 * consignment moves the stock onto the mini's own books (CONSIGNED_IN) and
 * records what they now owe; rejecting has no effect.
 */
export function ReceiveConsignmentModal({ visible, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const rate = useExchangeRate();
  const user = useAuthStore((s) => s.user);
  // The consignment just confirmed — kept so the mini can print/share a record
  // of what they received, since it drops out of the PENDING list on confirm.
  const [justReceived, setJustReceived] = useState<ConsignmentSummary | null>(null);
  const [printing, setPrinting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: QK.consignmentsIncoming,
    queryFn: consignmentsApi.incoming,
    enabled: visible,
    staleTime: 15_000,
  });
  const pending = ((data as ConsignmentSummary[] | undefined) ?? []).filter((c) => c.status === 'PENDING');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: QK.consignmentsIncoming });
    qc.invalidateQueries({ queryKey: QK.inventoryProducts });
    qc.invalidateQueries({ queryKey: QK.inventory() });
    // Accepting products raises "I owe" and the balance on the mini's home stats.
    qc.invalidateQueries({ queryKey: QK.miniBalance });
    qc.invalidateQueries({ queryKey: ['mini-settlements', 'stats'] });
  };

  const confirmM = useMutation({
    mutationFn: (c: ConsignmentSummary) => consignmentsApi.confirm(c.id),
    onSuccess: (_data, c) => {
      invalidate();
      // Surface the print/share record for the goods just accepted.
      setJustReceived(c);
    },
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });
  const rejectM = useMutation({
    mutationFn: (id: string) => consignmentsApi.reject(id),
    onSuccess: invalidate,
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });
  const busy = confirmM.isPending || rejectM.isPending;

  // Slip for the most recently received consignment (shared with the received-
  // items history tab so a reprint matches this one).
  const receivedSlip = useMemo(
    () =>
      justReceived
        ? toReceivedGoodsSlip(
            justReceived,
            { name: user?.name ?? undefined, handle: user?.username },
            rate,
          )
        : null,
    [justReceived, rate, user],
  );

  const handlePrint = async () => {
    if (!receivedSlip) return;
    setPrinting(true);
    try {
      await printReceivedGoods(receivedSlip);
    } catch (err) {
      if (usePrinterStore.getState().printer) {
        Alert.alert(t.printer.printFailed, getErrorMessage(err), [
          { text: t.common.cancel, style: 'cancel' },
          { text: t.printer.fallbackUsed, onPress: () => void printReceivedGoodsViaSystem(receivedSlip) },
        ]);
      } else {
        Alert.alert(t.printer.printFailed, getErrorMessage(err));
      }
    } finally {
      setPrinting(false);
    }
  };

  const close = () => {
    setJustReceived(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <ScrollView className="flex-1 bg-surface dark:bg-slate-900" contentContainerClassName="px-6 py-8">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-xl font-bold text-text dark:text-slate-100">{t.miniEmployee.receiveTitle}</Text>
          <TouchableOpacity onPress={close}>
            <Text className="text-primary font-medium">{t.common.cancel}</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-muted dark:text-slate-500 text-sm mb-5">{t.miniEmployee.receiveSubtitle}</Text>

        {receivedSlip && (
          <View className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 rounded-2xl px-4 py-4 mb-4">
            <View className="flex-row items-start gap-2">
              <Text className="text-base mt-0.5">✅</Text>
              <View className="flex-1">
                <Text className="text-emerald-700 dark:text-emerald-300 font-semibold text-sm">
                  {t.miniEmployee.receivedDoneTitle}
                </Text>
                <Text className="text-emerald-600 dark:text-emerald-400 text-xs mt-0.5">
                  {t.miniEmployee.receivedDoneSub}
                </Text>
              </View>
            </View>
            <View className="flex-row gap-2 mt-3">
              <TouchableOpacity
                onPress={() => void handlePrint()}
                disabled={printing}
                className="flex-1 bg-emerald-600 rounded-xl py-2.5 flex-row items-center justify-center gap-2"
                style={{ opacity: printing ? 0.6 : 1 }}
              >
                {printing && <ActivityIndicator size="small" color="#fff" />}
                <Text className="text-white font-semibold text-sm">{t.miniEmployee.printBtn}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void shareReceivedGoodsPdf(receivedSlip)}
                className="px-4 rounded-xl py-2.5 items-center justify-center border border-emerald-600"
              >
                <Text className="text-emerald-700 dark:text-emerald-300 font-semibold text-sm">
                  {t.miniEmployee.shareBtn}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setJustReceived(null)}
                className="px-4 rounded-xl py-2.5 items-center justify-center"
              >
                <Text className="text-muted dark:text-slate-400 font-semibold text-sm">
                  {t.miniEmployee.printDone}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isLoading ? (
          <ActivityIndicator className="mt-8" />
        ) : pending.length === 0 ? (
          <Text className="text-muted dark:text-slate-500 text-center mt-10">{t.miniEmployee.receiveEmpty}</Text>
        ) : (
          pending.map((c) => (
            <View
              key={c.id}
              className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl px-4 py-4 mb-3"
            >
              <Text className="text-text dark:text-slate-100 font-semibold">
                {t.miniEmployee.receiveFrom} @{c.supplier?.username ?? '—'}
              </Text>
              {c.note ? <Text className="text-muted dark:text-slate-500 text-xs mt-0.5 italic">{c.note}</Text> : null}
              <View className="mt-2 gap-2">
                {(() => {
                  // Composite (sized) items share a groupId — show them as ONE
                  // product with a carton count + per-size composition, instead
                  // of "N cartons" on every size. Simple items render as before.
                  const composite = new Map<string, typeof c.items>();
                  const simpleItems: typeof c.items = [];
                  for (const it of c.items) {
                    if (it.groupId) {
                      const arr = composite.get(it.groupId) ?? [];
                      arr.push(it);
                      composite.set(it.groupId, arr);
                    } else {
                      simpleItems.push(it);
                    }
                  }

                  return (
                    <>
                      {[...composite.entries()].map(([gid, items]) => {
                        const name = items[0].productName;
                        const cartons = Math.min(
                          ...items.map((i) => Math.floor(i.quantity / (i.piecesPerCarton || 1))),
                        );
                        const owed = items.reduce(
                          (s, i) => s + parseFloat(i.agreedUnitPrice) * i.quantity,
                          0,
                        );
                        return (
                          <View key={gid} className="border-t border-border dark:border-slate-700 pt-2">
                            <View className="flex-row justify-between items-center">
                              <Text className="text-text dark:text-slate-100 font-semibold capitalize">
                                {name}
                              </Text>
                              <Text className="text-xs rounded px-2 py-0.5 bg-surface dark:bg-slate-900 text-text dark:text-slate-200">
                                {t.sizedSale.cartonCount(cartons)}
                              </Text>
                            </View>
                            {items.map((it) => (
                              <View key={it.id} className="flex-row justify-between mt-0.5">
                                <Text className="text-muted dark:text-slate-400 text-sm capitalize">
                                  {it.variantLabel ?? '—'}
                                </Text>
                                <Text className="text-muted dark:text-slate-500 text-xs">
                                  {t.sizedSale.perCartonPieces(it.piecesPerCarton || 1)} · {it.quantity} pcs
                                </Text>
                              </View>
                            ))}
                            <View className="flex-row justify-between mt-1">
                              <Text className="text-muted dark:text-slate-500 text-xs">
                                {t.sizedSale.owed}
                              </Text>
                              <Text className="text-text dark:text-slate-100 text-sm font-medium">
                                {formatCurrency(owed.toString())}
                              </Text>
                            </View>
                          </View>
                        );
                      })}

                      {simpleItems.map((it) => {
                        const ppc = it.piecesPerCarton ?? null;
                        const bd = breakdownQuantity(it.quantity, ppc);
                        const priceValue = ppc
                          ? (parseFloat(it.agreedUnitPrice) * ppc).toFixed(4)
                          : it.agreedUnitPrice;
                        const priceSuffix = ppc ? t.miniEmployee.perCarton : t.miniEmployee.perPiece;
                        return (
                          <View key={it.id} className="flex-row justify-between">
                            <Text className="text-text dark:text-slate-200 text-sm capitalize">
                              {formatBreakdown(bd)} · {it.productName}
                            </Text>
                            <Text className="text-muted dark:text-slate-400 text-sm">
                              {formatCurrency(priceValue)} {priceSuffix}
                            </Text>
                          </View>
                        );
                      })}
                    </>
                  );
                })()}
              </View>
              <View className="flex-row gap-2 mt-3">
                <TouchableOpacity
                  onPress={() => confirmM.mutate(c)}
                  disabled={busy}
                  className="flex-1 bg-success rounded-xl py-2.5 items-center"
                  style={{ opacity: busy ? 0.5 : 1 }}
                >
                  <Text className="text-white font-semibold text-sm">{t.miniEmployee.receiveConfirm}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => rejectM.mutate(c.id)}
                  disabled={busy}
                  className="px-4 rounded-xl py-2.5 items-center justify-center border border-danger"
                  style={{ opacity: busy ? 0.5 : 1 }}
                >
                  <Text className="text-danger font-semibold text-sm">{t.miniEmployee.receiveReject}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </Modal>
  );
}
