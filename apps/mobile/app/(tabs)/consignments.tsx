import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { consignmentsApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import { EmptyState } from '../../components/ui/EmptyState';
import type { ConsignmentRequest, ConsignmentStatus } from '@trading-app/types';

const STATUS_COLOR: Record<ConsignmentStatus, string> = {
  PENDING: 'text-warning',
  ACCEPTED: 'text-success',
  REJECTED: 'text-danger',
  CANCELLED: 'text-muted dark:text-slate-500',
};

function ConsignmentCard({
  request,
  direction,
  onConfirm,
  onReject,
  onCancel,
  isActing,
}: {
  request: ConsignmentRequest;
  direction: 'incoming' | 'outgoing';
  onConfirm?: (id: string) => void;
  onReject?: (id: string) => void;
  onCancel?: (id: string) => void;
  isActing: boolean;
}) {
  const t = useT();
  const formatCurrency = useFormatCurrency();

  const statusLabel: Record<ConsignmentStatus, string> = {
    PENDING: direction === 'incoming'
      ? t.consignments.awaitingConfirmation
      : t.consignments.awaitingDebtorConfirmation,
    ACCEPTED: t.consignments.accepted,
    REJECTED: t.consignments.rejected,
    CANCELLED: t.consignments.cancelledBySupplier,
  };

  const totalValue = request.items.reduce(
    (sum, item) => sum + parseFloat(item.agreedUnitPrice) * item.quantity,
    0,
  );

  const counterparty = direction === 'incoming'
    ? request.supplier?.username
    : request.debtor?.username;

  return (
    <View className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl p-4 mb-3">
      {/* Header */}
      <View className="flex-row justify-between items-start mb-3">
        <View className="flex-1 mr-2">
          <Text className="text-text dark:text-slate-100 font-semibold text-base">
            {direction === 'incoming' ? t.consignments.from : t.consignments.to}{' '}
            @{counterparty ?? '—'}
          </Text>
          <Text className="text-muted dark:text-slate-500 text-xs mt-0.5">
            {new Date(request.createdAt).toLocaleDateString()}
          </Text>
        </View>
        <Text className={`text-xs font-semibold ${STATUS_COLOR[request.status]}`}>
          {statusLabel[request.status]}
        </Text>
      </View>

      {/* Items */}
      {request.items.map((item) => (
        <View
          key={item.id}
          className="flex-row justify-between items-center py-1.5 border-t border-border dark:border-slate-700"
        >
          <Text className="text-text dark:text-slate-100 text-sm flex-1 mr-2" numberOfLines={1}>
            {item.productName.charAt(0).toUpperCase() + item.productName.slice(1)}
          </Text>
          <Text className="text-muted dark:text-slate-500 text-xs mr-3">×{item.quantity}</Text>
          <Text className="text-text dark:text-slate-100 text-sm font-medium">
            {formatCurrency(item.agreedUnitPrice)}{t.consignments.perUnit}
          </Text>
        </View>
      ))}

      {/* Total */}
      <View className="flex-row justify-between mt-3 pt-2 border-t border-border dark:border-slate-700">
        <Text className="text-muted dark:text-slate-500 text-sm">{t.consignments.totalValue}</Text>
        <Text className="text-text dark:text-slate-100 font-bold text-base">
          {formatCurrency(totalValue.toFixed(2))}
        </Text>
      </View>

      {/* Note */}
      {request.note && (
        <Text className="text-muted dark:text-slate-500 text-xs italic mt-2">
          "{request.note}"
        </Text>
      )}

      {/* Incoming actions — PENDING only */}
      {direction === 'incoming' && request.status === 'PENDING' && (
        <View className="flex-row gap-3 mt-4">
          <TouchableOpacity
            onPress={() => onReject?.(request.id)}
            disabled={isActing}
            className="flex-1 border border-danger rounded-xl py-2.5 items-center"
          >
            <Text className="text-danger font-semibold text-sm">{t.consignments.reject}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onConfirm?.(request.id)}
            disabled={isActing}
            className="flex-1 bg-primary rounded-xl py-2.5 items-center"
          >
            <Text className="text-white font-semibold text-sm">{t.consignments.confirmReceipt}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Outgoing actions — PENDING only */}
      {direction === 'outgoing' && request.status === 'PENDING' && (
        <TouchableOpacity
          onPress={() => onCancel?.(request.id)}
          disabled={isActing}
          className="mt-4 border border-border dark:border-slate-600 rounded-xl py-2.5 items-center"
        >
          <Text className="text-muted dark:text-slate-400 font-semibold text-sm">
            {t.consignments.cancel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function ConsignmentsScreen() {
  const t = useT();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [actionId, setActionId] = useState<string | null>(null);

  const {
    data: incomingData,
    isFetching: incomingFetching,
    refetch: refetchIncoming,
  } = useQuery({
    queryKey: QK.consignmentsIncoming,
    queryFn: () => consignmentsApi.incoming(),
    staleTime: 15_000,
  });

  const {
    data: outgoingData,
    isFetching: outgoingFetching,
    refetch: refetchOutgoing,
  } = useQuery({
    queryKey: QK.consignmentsOutgoing,
    queryFn: () => consignmentsApi.outgoing(),
    staleTime: 15_000,
  });

  const incoming = (incomingData as ConsignmentRequest[] | undefined) ?? [];
  const outgoing = (outgoingData as ConsignmentRequest[] | undefined) ?? [];
  const pendingIncomingCount = incoming.filter((r) => r.status === 'PENDING').length;

  const confirmMutation = useMutation({
    mutationFn: (id: string) => consignmentsApi.confirm(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QK.consignmentsIncoming });
      void qc.invalidateQueries({ queryKey: QK.inventoryProducts });
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to confirm';
      Alert.alert('Error', msg);
    },
    onSettled: () => setActionId(null),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => consignmentsApi.reject(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: QK.consignmentsIncoming }),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to reject';
      Alert.alert('Error', msg);
    },
    onSettled: () => setActionId(null),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => consignmentsApi.cancel(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: QK.consignmentsOutgoing }),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to cancel';
      Alert.alert('Error', msg);
    },
    onSettled: () => setActionId(null),
  });

  const handleConfirm = (id: string) => {
    Alert.alert(
      t.consignments.confirmAlertTitle,
      t.consignments.confirmAlertMsg,
      [
        { text: t.consignments.confirmAlertCancel, style: 'cancel' },
        {
          text: t.consignments.confirmAlertConfirm,
          onPress: () => { setActionId(id); confirmMutation.mutate(id); },
        },
      ],
    );
  };

  const handleReject = (id: string) => {
    Alert.alert(
      t.consignments.rejectAlertTitle,
      t.consignments.rejectAlertMsg,
      [
        { text: t.consignments.rejectAlertCancel, style: 'cancel' },
        {
          text: t.consignments.rejectAlertReject,
          style: 'destructive',
          onPress: () => { setActionId(id); rejectMutation.mutate(id); },
        },
      ],
    );
  };

  const handleCancel = (id: string) => {
    Alert.alert(
      t.consignments.cancelAlertTitle,
      t.consignments.cancelAlertMsg,
      [
        { text: t.consignments.cancelAlertKeep, style: 'cancel' },
        {
          text: t.consignments.cancelAlertConfirm,
          style: 'destructive',
          onPress: () => { setActionId(id); cancelMutation.mutate(id); },
        },
      ],
    );
  };

  const isFetching = tab === 'incoming' ? incomingFetching : outgoingFetching;
  const refetch = tab === 'incoming' ? refetchIncoming : refetchOutgoing;
  const listData = tab === 'incoming' ? incoming : outgoing;

  return (
    <View className="flex-1 bg-surface dark:bg-slate-900">
      {/* Header */}
      <View className="bg-card dark:bg-slate-800 border-b border-border dark:border-slate-700 px-6 pt-14 pb-4">
        <Text className="text-2xl font-bold text-text dark:text-slate-100 mb-4">
          {t.consignments.title}
        </Text>

        {/* Tab toggle */}
        <View className="flex-row bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          <TouchableOpacity
            onPress={() => setTab('incoming')}
            className={`flex-1 py-2 rounded-lg items-center flex-row justify-center gap-1.5 ${tab === 'incoming' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''}`}
          >
            <Text className={`text-sm font-semibold ${tab === 'incoming' ? 'text-text dark:text-slate-100' : 'text-muted dark:text-slate-500'}`}>
              {t.consignments.tabIncoming}
            </Text>
            {pendingIncomingCount > 0 && (
              <View className="bg-primary rounded-full w-5 h-5 items-center justify-center">
                <Text className="text-white text-[10px] font-bold">{pendingIncomingCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab('outgoing')}
            className={`flex-1 py-2 rounded-lg items-center ${tab === 'outgoing' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''}`}
          >
            <Text className={`text-sm font-semibold ${tab === 'outgoing' ? 'text-text dark:text-slate-100' : 'text-muted dark:text-slate-500'}`}>
              {t.consignments.tabOutgoing}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* List */}
      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConsignmentCard
            request={item}
            direction={tab}
            onConfirm={handleConfirm}
            onReject={handleReject}
            onCancel={handleCancel}
            isActing={actionId === item.id}
          />
        )}
        contentContainerClassName="px-4 pt-4 pb-8"
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#2563EB" />
        }
        ListHeaderComponent={
          isFetching && listData.length === 0 ? (
            <ActivityIndicator className="mt-12" color="#2563EB" />
          ) : null
        }
        ListEmptyComponent={
          !isFetching ? (
            <EmptyState
              emoji={tab === 'incoming' ? '📬' : '📤'}
              title={tab === 'incoming' ? t.consignments.noConsignments : t.consignments.noOutgoing}
              subtitle={tab === 'incoming' ? t.consignments.noConsignmentsSub : t.consignments.noOutgoingSub}
            />
          ) : null
        }
      />
    </View>
  );
}
