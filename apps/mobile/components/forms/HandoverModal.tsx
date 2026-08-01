import { Modal, ScrollView, View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { miniSettlementsApi, type ActiveTeamMember, type HandoverPreview } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { formatFcValue } from '../../lib/currency';
import { breakdownQuantity, formatBreakdown, getErrorMessage } from '../../lib/utils';
import { Button } from '../ui/Button';
import { useT } from '../../lib/i18n';
import { useOfflineStore } from '../../store/offline.store';
import { syncPendingSales } from '../../lib/sync';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Mini-employee close-out. Shows, automatically, what each product sold generated
 * (revenue, the mini's profit, and what's owed to the owner), the total cash to
 * hand over (owed − expenses), and — cleanly separated — the unsold items being
 * handed back. The mini just reviews and confirms.
 */
export function HandoverModal({ visible, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();

  // The preview is computed server-side from *synced* rows. Anything still in
  // the offline queue would understate the cash owed (unsynced sales) and land
  // its expenses on the next cycle instead of this one (the API claims only
  // already-persisted expenses onto the handover). So the queue must drain
  // before the mini is shown — let alone asked to confirm — a cash figure.
  const { isOffline, pendingSales, pendingExpenses } = useOfflineStore();
  const queued = pendingSales.length + pendingExpenses.length;
  const blocked = isOffline || queued > 0;

  const { data, isLoading, error } = useQuery({
    queryKey: ['mini-settlements', 'handover-preview'],
    queryFn: () => miniSettlementsApi.handoverPreview(),
    enabled: visible && !blocked,
    staleTime: 5_000,
  });

  // Who the employer recorded as being out with these goods. Read-only here —
  // the list is maintained on the dashboard and travels onto this handover.
  const { data: teamData } = useQuery({
    queryKey: QK.miniTeam,
    queryFn: miniSettlementsApi.myTeam,
    enabled: visible && !blocked,
    staleTime: 30_000,
  });
  const team = (teamData as ActiveTeamMember[] | undefined) ?? [];

  const { mutate: runSync, isPending: syncing } = useMutation({
    mutationFn: syncPendingSales,
    onSuccess: (result) => {
      if (result.failed > 0) {
        Alert.alert(t.miniEmployee.handoverSyncFailed, result.errors.join('\n'));
        return;
      }
      qc.invalidateQueries({ queryKey: ['mini-settlements', 'handover-preview'] });
      qc.invalidateQueries({ queryKey: ['mini-settlements', 'stats'] });
      qc.invalidateQueries({ queryKey: QK.miniExpenses });
    },
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });

  const preview = data as HandoverPreview | undefined;
  const sold = preview?.sold ?? [];
  const returns = preview?.returns ?? [];
  const expenses = preview?.expenses ?? [];
  // Everything the mini sees is FC-native at each consignment's locked rate
  // (server-computed) so a rate change never moves it. The USD `cashForSold` is
  // still what books on the owner's (USD) ledger at handover.
  const cashForSoldUsd = parseFloat(preview?.cashForSold ?? '0') || 0;
  const cashForSoldFc = parseFloat(preview?.cashForSoldFc ?? '0') || 0;
  const profitFc = parseFloat(preview?.profitMadeFc ?? '0') || 0;
  const expensesFc = parseFloat(preview?.expensesFc ?? '0') || 0;
  const netFc = Math.max(0, cashForSoldFc - expensesFc);

  const hasSomething = cashForSoldUsd > 0 || returns.length > 0 || expenses.length > 0;

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      miniSettlementsApi.create({
        ...(cashForSoldUsd > 0
          ? { cashAmount: cashForSoldUsd.toFixed(4), cashAmountFc: cashForSoldFc.toFixed(4) }
          : {}),
        ...(returns.length > 0
          ? {
              returns: returns.map((l) => ({
                productName: l.productName,
                quantity: l.quantity,
                ...(l.variantId ? { variantId: l.variantId } : {}),
              })),
            }
          : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.miniSettlementsOutgoing });
      qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      qc.invalidateQueries({ queryKey: QK.inventory() });
      qc.invalidateQueries({ queryKey: QK.miniBalance });
      qc.invalidateQueries({ queryKey: QK.miniExpenses });
      qc.invalidateQueries({ queryKey: ['mini-settlements', 'handover-preview'] });
      qc.invalidateQueries({ queryKey: ['mini-settlements', 'stats'] });
      // The handover claims the team, so the next cycle starts with none.
      qc.invalidateQueries({ queryKey: QK.miniTeam });
      onClose();
      Alert.alert('✅', t.miniEmployee.handoverSubmitted);
    },
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView className="flex-1 bg-surface dark:bg-slate-900" contentContainerClassName="px-6 py-8">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-xl font-bold text-text dark:text-slate-100">{t.miniEmployee.handoverTitle}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text className="text-primary font-medium">{t.common.cancel}</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-muted dark:text-slate-500 text-sm mb-5">{t.miniEmployee.handoverAutoSubtitle}</Text>

        {blocked ? (
          <View className="mt-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-2xl px-4 py-4">
            <Text className="text-amber-700 dark:text-amber-300 font-semibold text-base">
              {isOffline ? t.miniEmployee.handoverOfflineTitle : t.miniEmployee.handoverSyncTitle}
            </Text>
            <Text className="text-amber-600 dark:text-amber-400 text-sm mt-1">
              {isOffline
                ? t.miniEmployee.handoverOfflineSub
                : t.miniEmployee.handoverSyncSub(queued)}
            </Text>
            {!isOffline && (
              <Button
                label={t.miniEmployee.handoverSyncNow}
                onPress={() => runSync()}
                loading={syncing}
                className="mt-4"
              />
            )}
          </View>
        ) : isLoading ? (
          <ActivityIndicator className="mt-8" />
        ) : error ? (
          <Text className="text-danger text-center mt-10">{getErrorMessage(error)}</Text>
        ) : !hasSomething ? (
          <Text className="text-muted dark:text-slate-500 text-center mt-10">{t.miniEmployee.handoverNothingOwed}</Text>
        ) : (
          <>
            {/* ── What you sold ── */}
            <Text className="text-xs font-bold uppercase tracking-wider text-primary mb-2">
              {t.miniEmployee.handoverSoldSection}
            </Text>
            {sold.length === 0 ? (
              <Text className="text-muted dark:text-slate-500 text-sm mb-2">{t.miniEmployee.miniNoSalesShort}</Text>
            ) : (
              sold.map((s) => (
                <View
                  key={s.variantId ?? s.productName}
                  className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl px-4 py-3 mb-2"
                >
                  <View className="flex-row justify-between items-center">
                    <Text className="text-text dark:text-slate-100 font-semibold capitalize">
                      {s.productName}
                      {s.variantLabel ? ` · ${s.variantLabel}` : ''}
                    </Text>
                    <Text className="text-muted dark:text-slate-400 text-xs">
                      {formatBreakdown(breakdownQuantity(s.qtySold, s.piecesPerCarton))}
                    </Text>
                  </View>
                  <View className="flex-row justify-between mt-1.5">
                    <Text className="text-muted dark:text-slate-400 text-xs">{t.miniEmployee.handoverRevenue}</Text>
                    <Text className="text-text dark:text-slate-200 text-xs">
                      {formatFcValue((parseFloat(s.agreedValueFc) || 0) + (parseFloat(s.profitFc) || 0))}
                    </Text>
                  </View>
                  <View className="flex-row justify-between mt-0.5">
                    <Text className="text-muted dark:text-slate-400 text-xs">{t.miniEmployee.handoverProfit}</Text>
                    <Text className="text-xs" style={{ color: '#10B981' }}>{formatFcValue(s.profitFc)}</Text>
                  </View>
                  <View className="flex-row justify-between mt-0.5">
                    <Text className="text-muted dark:text-slate-400 text-xs">{t.miniEmployee.handoverOwed}</Text>
                    <Text className="text-text dark:text-slate-100 text-xs font-semibold">{formatFcValue(s.agreedValueFc)}</Text>
                  </View>
                </View>
              ))
            )}

            {/* ── Cash summary ── */}
            <View className="mt-3 bg-primary/10 border border-primary/30 rounded-2xl px-4 py-3">
              <View className="flex-row justify-between">
                <Text className="text-muted dark:text-slate-400 text-sm">{t.miniEmployee.handoverSoldCash}</Text>
                <Text className="text-text dark:text-slate-200 text-sm">{formatFcValue(cashForSoldFc)}</Text>
              </View>
              {expensesFc > 0 && (
                <View className="flex-row justify-between mt-1">
                  <Text className="text-muted dark:text-slate-400 text-sm">{t.miniEmployee.handoverExpenses}</Text>
                  <Text className="text-danger text-sm">− {formatFcValue(expensesFc)}</Text>
                </View>
              )}
              <View className="flex-row justify-between mt-2 pt-2 border-t border-primary/20">
                <Text className="text-text dark:text-slate-100 font-semibold">{t.miniEmployee.handoverTotalCash}</Text>
                <Text className="text-text dark:text-slate-100 font-bold text-lg">{formatFcValue(netFc)}</Text>
              </View>
              <View className="flex-row justify-between mt-1">
                <Text className="text-muted dark:text-slate-400 text-sm">{t.miniEmployee.handoverProfitMade}</Text>
                <Text className="text-sm font-semibold" style={{ color: '#10B981' }}>{formatFcValue(profitFc)}</Text>
              </View>
            </View>

            {/* ── Expenses spent (deducted from the cash) ── */}
            {expenses.length > 0 && (
              <>
                <Text className="text-xs font-bold uppercase tracking-wider text-primary mt-6 mb-2">
                  {t.miniEmployee.handoverExpensesSection}
                </Text>
                {expenses.map((e, i) => (
                  <View
                    key={`${e.category}-${i}`}
                    className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl px-4 py-2.5 mb-2 flex-row justify-between"
                  >
                    <Text className="text-text dark:text-slate-200 text-sm">
                      {t.miniEmployee.expenseCat[e.category as keyof typeof t.miniEmployee.expenseCat] ?? e.category}
                      {e.description ? ` · ${e.description}` : ''}
                    </Text>
                    <Text className="text-danger text-sm">− {formatFcValue(e.amount)}</Text>
                  </View>
                ))}
              </>
            )}

            {/* ── Team out with the goods (record only, no money attached) ── */}
            {team.length > 0 && (
              <>
                <Text className="text-xs font-bold uppercase tracking-wider text-primary mt-6 mb-2">
                  {t.miniEmployee.teamSection}
                </Text>
                {team.map((m) => (
                  <View
                    key={m.id}
                    className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl px-4 py-2.5 mb-2 flex-row justify-between"
                  >
                    <Text className="text-text dark:text-slate-200 text-sm">{m.name}</Text>
                    <Text className="text-muted dark:text-slate-400 text-sm">
                      {m.phone ?? t.miniEmployee.teamNoPhone}
                    </Text>
                  </View>
                ))}
              </>
            )}

            {/* ── Returning to owner ── */}
            <Text className="text-xs font-bold uppercase tracking-wider text-primary mt-6 mb-2">
              {t.miniEmployee.handoverReturnsSection}
            </Text>
            {returns.length === 0 ? (
              <Text className="text-muted dark:text-slate-500 text-sm">{t.miniEmployee.handoverNothingToReturn}</Text>
            ) : (
              returns.map((l) => (
                <View
                  key={l.variantId ?? l.productName}
                  className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl px-4 py-2.5 mb-2 flex-row justify-between"
                >
                  <Text className="text-text dark:text-slate-200 text-sm capitalize">
                    {l.productName}
                    {l.variantLabel ? ` · ${l.variantLabel}` : ''}
                  </Text>
                  <Text className="text-muted dark:text-slate-400 text-sm">
                    {formatBreakdown(breakdownQuantity(l.quantity, l.piecesPerCarton))}
                  </Text>
                </View>
              ))
            )}

            <Button
              label={t.miniEmployee.handoverSubmit}
              onPress={() => mutate()}
              loading={isPending}
              className="mt-6"
            />
          </>
        )}
      </ScrollView>
    </Modal>
  );
}
