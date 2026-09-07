import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { salesApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { getErrorMessage, isNetworkError } from '../../lib/utils';
import { useOfflineStore } from '../../store/offline.store';
import { useT } from '../../lib/i18n';
import { useBrand } from '../../lib/theme';
import { Button } from '../ui/Button';

/**
 * What is being rejected. Two kinds, because a sale can be voided before it has
 * ever reached the server:
 *  - `server`  — a row in the sales history. `id` is the sale id.
 *  - `pending` — a sale still sitting in the offline queue. `id` is the queue
 *                row id; it is marked rejected and sync records-then-rejects it,
 *                so the server ends up with the same history either way.
 */
export interface RejectTarget {
  kind: 'server' | 'pending';
  id: string;
  productName: string;
  variantLabel?: string | null;
  qtySold: number;
}

interface Props {
  target: RejectTarget | null;
  onClose: () => void;
}

/**
 * Confirm rejecting a sale recorded by mistake. Rejection is never a delete:
 * the sale is kept and listed under Rejected, and its quantity goes back on the
 * shelf. Works offline for both kinds of target — an online attempt that fails
 * on the network is queued rather than lost, exactly like recording a sale.
 */
export function RejectSaleModal({ target, onClose }: Props) {
  const t = useT();
  const brand = useBrand();
  const qc = useQueryClient();
  const { isOffline, rejectPendingSale, recordOfflineRejection } = useOfflineStore();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (target) {
      setReason('');
      setSubmitting(false);
    }
  }, [target]);

  if (!target) return null;

  const label = target.variantLabel
    ? `${target.productName} · ${target.variantLabel}`
    : target.productName;

  const invalidate = (): void => {
    qc.invalidateQueries({ queryKey: QK.salesHistory() });
    qc.invalidateQueries({ queryKey: QK.inventoryProducts });
    qc.invalidateQueries({ queryKey: QK.inventory() });
    qc.invalidateQueries({ queryKey: QK.dashboardAll });
    qc.invalidateQueries({ queryKey: ['mini-settlements', 'stats'] });
    qc.invalidateQueries({ queryKey: QK.miniExpenseAllowance });
  };

  const queueIt = (): void => {
    recordOfflineRejection(
      target.id,
      target.productName,
      target.qtySold,
      reason.trim() || undefined,
    );
    onClose();
    Alert.alert(t.sales.rejectQueued, '');
  };

  const handleConfirm = async (): Promise<void> => {
    // Never synced yet — the queue owns this one.
    if (target.kind === 'pending') {
      rejectPendingSale(target.id, reason.trim() || undefined);
      onClose();
      Alert.alert(t.sales.rejectQueued, '');
      return;
    }

    if (isOffline) {
      queueIt();
      return;
    }

    setSubmitting(true);
    try {
      await salesApi.reject(target.id, reason.trim() ? { reason: reason.trim() } : {});
      invalidate();
      onClose();
      Alert.alert(t.sales.rejectDone, '');
    } catch (err) {
      // No verdict from the server — queue it instead of dropping the
      // correction on the floor. The endpoint is idempotent, so replaying it
      // is safe even if this request did land.
      if (isNetworkError(err)) {
        queueIt();
      } else {
        Alert.alert(t.common.error, getErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center bg-black/50 px-6"
      >
        <View className="bg-surface rounded-2xl p-5">
          <Text className="text-text font-bold text-lg">{t.sales.rejectTitle}</Text>
          <Text className="text-muted text-sm mt-1 mb-4 capitalize">
            {t.sales.rejectBody(label, target.qtySold)}
          </Text>

          <Text className="text-text text-xs font-semibold mb-1">
            {t.sales.rejectReasonLabel}
          </Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder={t.sales.rejectReasonPlaceholder}
            placeholderTextColor={brand.mutedSubtle}
            maxLength={300}
            className="bg-card border border-border rounded-lg px-3 py-2.5 text-text mb-4"
          />

          <View className="flex-row gap-2">
            <Button
              label={t.sales.rejectCancel}
              variant="ghost"
              onPress={onClose}
              className="flex-1"
            />
            <Button
              label={t.sales.rejectConfirm}
              variant="danger"
              onPress={() => void handleConfirm()}
              loading={submitting}
              className="flex-1"
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
