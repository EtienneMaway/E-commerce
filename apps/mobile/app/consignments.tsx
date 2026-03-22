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
import { consignmentsApi } from '../lib/api';
import { QK } from '../lib/query-keys';
import { useFormatCurrency } from '../lib/currency';
import { useT } from '../lib/i18n';
import { EmptyState } from '../components/ui/EmptyState';
import type { ConsignmentRequest, ConsignmentStatus } from '@trading-app/types';

const STATUS_COLOR: Record<ConsignmentStatus, string> = {
  PENDING: 'text-warning',
  ACCEPTED: 'text-success',
  REJECTED: 'text-danger',
  CANCELLED: 'text-muted dark:text-slate-500',
};

function ConsignmentCard({
  request,
  onConfirm,
  onReject,
  isPending,
}: {
  request: ConsignmentRequest;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  isPending: boolean;
}) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const statusLabel: Record<ConsignmentStatus, string> = {
    PENDING: t.consignments.awaitingConfirmation,
    ACCEPTED: t.consignments.accepted,
    REJECTED: t.consignments.rejected,
    CANCELLED: t.consignments.cancelledBySupplier,
  };
  const totalValue = request.items.reduce(
    (sum, item) =>
      sum + parseFloat(item.agreedUnitPrice) * item.quantity,
    0,
  );

  return (
    <View className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl p-4 mb-3">
      {/* Header */}
      <View className="flex-row justify-between items-start mb-3">
        <View className="flex-1 mr-2">
          <Text className="text-text dark:text-slate-100 font-semibold text-base">
            {t.consignments.from}: {request.supplier?.username ?? '—'}
          </Text>
          <Text className="text-muted dark:text-slate-500 text-xs mt-0.5">
            {new Date(request.createdAt).toLocaleDateString()}
          </Text>
        </View>
        <Text className={`text-xs font-medium ${STATUS_COLOR[request.status]}`}>
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
        <Text className="text-text dark:text-slate-100 font-bold text-base">{formatCurrency(String(totalValue.toFixed(2)))}</Text>
      </View>

      {/* Note */}
      {request.note && (
        <Text className="text-muted dark:text-slate-500 text-xs italic mt-2">"{request.note}"</Text>
      )}

      {/* Actions — only shown for PENDING */}
      {request.status === 'PENDING' && (
        <View className="flex-row gap-3 mt-4">
          <TouchableOpacity
            onPress={() => onReject(request.id)}
            disabled={isPending}
            className="flex-1 border border-danger rounded-xl py-2.5 items-center"
          >
            <Text className="text-danger font-semibold text-sm">{t.consignments.reject}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onConfirm(request.id)}
            disabled={isPending}
            className="flex-1 bg-primary rounded-xl py-2.5 items-center"
          >
            <Text className="text-white font-semibold text-sm">{t.consignments.confirmReceipt}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function ConsignmentsInboxScreen() {
  const t = useT();
  const queryClient = useQueryClient();
  const [actionId, setActionId] = useState<string | null>(null);

  const { data, isFetching, refetch } = useQuery({
    queryKey: QK.consignmentsIncoming,
    queryFn: () => consignmentsApi.incoming(),
    staleTime: 15_000,
  });

  const requests = (data as ConsignmentRequest[] | undefined) ?? [];

  const confirmMutation = useMutation({
    mutationFn: (id: string) => consignmentsApi.confirm(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QK.consignmentsIncoming });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message ?? 'Failed to confirm consignment';
      Alert.alert('Error', msg);
    },
    onSettled: () => setActionId(null),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => consignmentsApi.reject(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QK.consignmentsIncoming });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message ?? 'Failed to reject consignment';
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
          onPress: () => {
            setActionId(id);
            confirmMutation.mutate(id);
          },
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
          onPress: () => {
            setActionId(id);
            rejectMutation.mutate(id);
          },
        },
      ],
    );
  };

  return (
    <View className="flex-1 bg-surface dark:bg-slate-900">
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConsignmentCard
            request={item}
            onConfirm={handleConfirm}
            onReject={handleReject}
            isPending={actionId === item.id}
          />
        )}
        contentContainerClassName="px-4 pt-4 pb-8"
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#2563EB" />
        }
        ListHeaderComponent={
          isFetching && requests.length === 0 ? (
            <ActivityIndicator className="mt-12" color="#2563EB" />
          ) : null
        }
        ListEmptyComponent={
          !isFetching ? (
            <EmptyState
              emoji="📬"
              title={t.consignments.noConsignments}
              subtitle={t.consignments.noConsignmentsSub}
            />
          ) : null
        }
      />
    </View>
  );
}
