import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useT } from '../../lib/i18n';
import { formatDate, getErrorMessage } from '../../lib/utils';
import { usePendingHandover } from '../../hooks/use-pending-handover';
import { useAuthStore } from '../../store/auth.store';
import { useExchangeRate } from '../../lib/currency';
import {
  printApprovedHandover,
  shareApprovedHandoverPdf,
  toApprovedHandoverSlip,
} from '../../lib/handover-receipt';
import type { MiniSettlementSummary } from '../../lib/api';

/**
 * Standing indicator for a mini employee's most recent handover:
 *  - PENDING  → amber "waiting for approval" (the only signal besides the
 *    one-shot submit alert, so the mini doesn't re-submit blind).
 *  - REJECTED → red, which nothing else surfaces.
 *  - APPROVED → green confirmation with the option to print / share the
 *    approved handover record. Persists until the next handover is opened.
 * Renders nothing for owners, full employees, and minis who never handed over.
 */
export function HandoverStatusBanner() {
  const t = useT();
  const { pending, latestRejected, latestApproved } = usePendingHandover();

  if (pending) {
    return (
      <View className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3 mb-4 flex-row items-start gap-3">
        <Text className="text-base mt-0.5">⏳</Text>
        <View className="flex-1">
          <Text className="text-amber-700 dark:text-amber-300 font-semibold text-sm">
            {t.miniEmployee.handoverPendingTitle}
          </Text>
          <Text className="text-amber-600 dark:text-amber-400 text-xs mt-0.5">
            {t.miniEmployee.handoverPendingSub}
          </Text>
          <Text className="text-amber-600/80 dark:text-amber-400/80 text-xs mt-1">
            {t.miniEmployee.handoverPendingSince(formatDate(pending.createdAt))}
          </Text>
        </View>
      </View>
    );
  }

  if (latestApproved) {
    return <ApprovedHandoverBanner settlement={latestApproved} />;
  }

  if (latestRejected) {
    return (
      <View className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 mb-4 flex-row items-start gap-3">
        <Text className="text-base mt-0.5">⚠️</Text>
        <View className="flex-1">
          <Text className="text-red-700 dark:text-red-300 font-semibold text-sm">
            {t.miniEmployee.handoverRejectedTitle}
          </Text>
          <Text className="text-red-600 dark:text-red-400 text-xs mt-0.5">
            {t.miniEmployee.handoverRejectedSub}
          </Text>
        </View>
      </View>
    );
  }

  return null;
}

/**
 * Green confirmation for an approved handover, with Print / Share actions that
 * emit the "handover receipt" record. Split out so its print state and the slip
 * memo don't live on the parent, which renders three mutually-exclusive states.
 */
function ApprovedHandoverBanner({ settlement }: { settlement: MiniSettlementSummary }) {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const rate = useExchangeRate();
  const [printing, setPrinting] = useState(false);

  const slip = useMemo(
    () => toApprovedHandoverSlip(settlement, { name: user?.name ?? undefined, handle: user?.username }, rate),
    [settlement, user, rate],
  );

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printApprovedHandover(slip);
    } catch (err) {
      Alert.alert(t.printer.printFailed, getErrorMessage(err));
    } finally {
      setPrinting(false);
    }
  };

  return (
    <View className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 rounded-xl px-4 py-3 mb-4">
      <View className="flex-row items-start gap-3">
        <Text className="text-base mt-0.5">✅</Text>
        <View className="flex-1">
          <Text className="text-emerald-700 dark:text-emerald-300 font-semibold text-sm">
            {t.miniEmployee.handoverApprovedTitle}
          </Text>
          <Text className="text-emerald-600 dark:text-emerald-400 text-xs mt-0.5">
            {t.miniEmployee.handoverApprovedSub}
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
          onPress={() => void shareApprovedHandoverPdf(slip)}
          className="px-4 rounded-xl py-2.5 items-center justify-center border border-emerald-600"
        >
          <Text className="text-emerald-700 dark:text-emerald-300 font-semibold text-sm">
            {t.miniEmployee.shareBtn}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
