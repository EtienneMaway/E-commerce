import { View, Text } from 'react-native';
import { useT } from '../../lib/i18n';
import { formatDate } from '../../lib/utils';
import { usePendingHandover } from '../../hooks/use-pending-handover';

/**
 * Standing indicator for a mini employee whose handover is awaiting the
 * employer's decision. Without it the only signal is a one-shot alert at submit
 * time, so the employee re-taps "Hand over" having no way to tell whether the
 * first one landed. Also surfaces a rejection, which nothing else shows.
 * Renders nothing for owners, full employees, and minis with no open handover.
 */
export function HandoverStatusBanner() {
  const t = useT();
  const { pending, latestRejected } = usePendingHandover();

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
