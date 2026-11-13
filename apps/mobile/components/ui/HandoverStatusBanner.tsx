import { View, Text } from 'react-native';
import { useT } from '../../lib/i18n';
import { formatDate } from '../../lib/utils';
import { usePendingHandover } from '../../hooks/use-pending-handover';
import { Icon } from './Icon';

/**
 * Standing indicator for a mini employee's most recent handover:
 *  - PENDING  → amber "waiting for approval" (the only signal besides the
 *    one-shot submit alert, so the mini doesn't re-submit blind).
 *  - REJECTED → red, which nothing else surfaces.
 * An APPROVED handover shows nothing here — the handover-history screen carries
 * the record (and reprint), so a homepage confirmation would just be noise.
 * Renders nothing for owners, full employees, and minis with no open handover.
 */
export function HandoverStatusBanner() {
  const t = useT();
  const { pending, latestRejected } = usePendingHandover();

  if (pending) {
    return (
      <View className="bg-warning-light border border-warning/30 rounded-xl px-4 py-3 mb-4 flex-row items-start gap-3">
        <View className="mt-0.5"><Icon name="clock" size={16} tone="warning" /></View>
        <View className="flex-1">
          <Text className="text-warning font-semibold text-sm">
            {t.miniEmployee.handoverPendingTitle}
          </Text>
          <Text className="text-warning text-xs mt-0.5">
            {t.miniEmployee.handoverPendingSub}
          </Text>
          <Text className="text-warning/80 /80 text-xs mt-1">
            {t.miniEmployee.handoverPendingSince(formatDate(pending.createdAt))}
          </Text>
        </View>
      </View>
    );
  }

  if (latestRejected) {
    return (
      <View className="bg-danger-light border border-danger/30 rounded-xl px-4 py-3 mb-4 flex-row items-start gap-3">
        <View className="mt-0.5"><Icon name="alert-triangle" size={16} tone="danger" /></View>
        <View className="flex-1">
          <Text className="text-danger font-semibold text-sm">
            {t.miniEmployee.handoverRejectedTitle}
          </Text>
          <Text className="text-danger text-xs mt-0.5">
            {t.miniEmployee.handoverRejectedSub}
          </Text>
        </View>
      </View>
    );
  }

  return null;
}
