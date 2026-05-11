import { useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  RefreshControl,
  Alert,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { salaryPaymentsApi, type SalaryPayment, type SalaryPaymentStatus } from '../lib/api';
import { QK } from '../lib/query-keys';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { formatCurrency, formatDate, getErrorMessage } from '../lib/utils';

const STATUS_LABELS: Record<SalaryPaymentStatus, string> = {
  PENDING_CONFIRMATION: 'Awaiting your confirmation',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

const STATUS_PILL: Record<SalaryPaymentStatus, string> = {
  PENDING_CONFIRMATION: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300',
  CONFIRMED: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  REJECTED: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',
  CANCELLED: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
};

function formatPeriodMonth(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(y, m - 1, 1),
  );
}

export default function SalaryScreen() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [rejectTarget, setRejectTarget] = useState<SalaryPayment | null>(null);

  const { data: pending, isRefetching: refPending, refetch: refetchPending } = useQuery({
    queryKey: QK.salaryPaymentsPending,
    queryFn: salaryPaymentsApi.pending,
    staleTime: 15_000,
  });
  const { data: history, isRefetching: refHistory, refetch: refetchHistory } = useQuery({
    queryKey: QK.salaryHistory,
    queryFn: salaryPaymentsApi.myHistory,
    staleTime: 15_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['salary-payments'] });
  };

  const confirmM = useMutation({
    mutationFn: (id: string) => salaryPaymentsApi.confirm(id),
    onSuccess: invalidate,
    onError: (err) => Alert.alert('Could not confirm', getErrorMessage(err)),
  });

  const handleConfirm = (p: SalaryPayment) => {
    Alert.alert(
      'Confirm cash received',
      `Confirm that you received ${formatCurrency(p.amount)} from ${p.employer?.username ?? 'your employer'} for ${formatPeriodMonth(p.periodMonth)}? This will count toward your salary paid.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => confirmM.mutate(p.id) },
      ],
    );
  };

  const list = tab === 'pending' ? (pending ?? []) : (history ?? []);
  const refreshing = tab === 'pending' ? refPending : refHistory;
  const refresh = tab === 'pending' ? refetchPending : refetchHistory;

  return (
    <View className="flex-1 bg-surface dark:bg-slate-900">
      <Stack.Screen options={{ title: 'Salary', headerBackTitle: 'Back' }} />

      <View className="px-4 pt-3 pb-2 flex-row gap-2">
        <TabButton active={tab === 'pending'} onPress={() => setTab('pending')} label={`Pending${pending?.length ? ` (${pending.length})` : ''}`} />
        <TabButton active={tab === 'history'} onPress={() => setTab('history')} label="History" />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {list.length === 0 ? (
          <EmptyState
            emoji={tab === 'pending' ? '✅' : '📒'}
            title={tab === 'pending' ? 'No payments awaiting confirmation' : 'No salary payments yet'}
            subtitle={
              tab === 'pending'
                ? "When your employer records a salary payment, it'll show up here for you to confirm."
                : 'Your confirmed and rejected payments will appear here.'
            }
          />
        ) : (
          <View className="gap-3 mt-2">
            {list.map((p) => (
              <PaymentCard
                key={p.id}
                payment={p}
                onConfirm={() => handleConfirm(p)}
                onReject={() => setRejectTarget(p)}
                confirming={confirmM.isPending && confirmM.variables === p.id}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <RejectModal
        payment={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onSuccess={invalidate}
      />
    </View>
  );
}

function TabButton({ active, onPress, label }: { active: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 py-2.5 rounded-xl items-center ${
        active ? 'bg-primary' : 'bg-card dark:bg-slate-800 border border-border dark:border-slate-700'
      }`}
    >
      <Text className={`font-semibold text-sm ${active ? 'text-white' : 'text-text dark:text-slate-200'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function PaymentCard({
  payment: p,
  onConfirm,
  onReject,
  confirming,
}: {
  payment: SalaryPayment;
  onConfirm: () => void;
  onReject: () => void;
  confirming: boolean;
}) {
  const isPending = p.status === 'PENDING_CONFIRMATION';
  return (
    <Card>
      <View className="flex-row items-start justify-between">
        <View className="flex-1 mr-3">
          <Text className="text-2xl font-bold text-text dark:text-slate-100">
            {formatCurrency(p.amount)}
          </Text>
          <Text className="text-muted dark:text-slate-400 text-xs mt-0.5">
            From @{p.employer?.username ?? '—'} · {formatPeriodMonth(p.periodMonth)}
          </Text>
        </View>
        <View className={`px-2.5 py-1 rounded-md ${STATUS_PILL[p.status]}`}>
          <Text className={`text-[10px] font-bold ${STATUS_PILL[p.status].split(' ').filter((c) => c.startsWith('text-')).join(' ')}`}>
            {STATUS_LABELS[p.status]}
          </Text>
        </View>
      </View>

      <Text className="text-muted dark:text-slate-500 text-xs mt-2">
        Recorded {formatDate(p.paidAt)}
        {p.confirmedAt ? ` · Confirmed ${formatDate(p.confirmedAt)}` : ''}
        {p.rejectedAt ? ` · Rejected ${formatDate(p.rejectedAt)}` : ''}
      </Text>

      {p.note && (
        <Text className="text-text dark:text-slate-300 text-sm mt-2 italic">
          "{p.note}"
        </Text>
      )}
      {p.rejectionReason && (
        <Text className="text-red-600 dark:text-red-400 text-xs mt-2">
          Reason: {p.rejectionReason}
        </Text>
      )}

      {isPending && (
        <View className="flex-row gap-2 mt-3">
          <Button
            label="Confirm receipt"
            onPress={onConfirm}
            loading={confirming}
            className="flex-1"
          />
          <Button
            label="Dispute"
            variant="outline"
            onPress={onReject}
            className="flex-1"
          />
        </View>
      )}
    </Card>
  );
}

function RejectModal({
  payment,
  onClose,
  onSuccess,
}: {
  payment: SalaryPayment | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: (id: string) => salaryPaymentsApi.reject(id, reason || undefined),
    onSuccess: () => {
      onSuccess();
      setReason('');
      onClose();
    },
    onError: (err) => Alert.alert('Could not dispute', getErrorMessage(err)),
  });

  if (!payment) return null;

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end bg-black/50"
      >
        <View className="bg-surface dark:bg-slate-900 rounded-t-3xl p-5">
          <Text className="text-text dark:text-slate-100 font-bold text-lg mb-2">
            Dispute payment
          </Text>
          <Text className="text-muted dark:text-slate-400 text-sm mb-4">
            Use this only if the cash was never received. Your employer will see the dispute.
          </Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Reason (optional)"
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={3}
            className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl px-4 py-3 text-text dark:text-slate-100 text-base"
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
          <View className="flex-row gap-2 mt-4">
            <Button label="Cancel" variant="outline" onPress={onClose} className="flex-1" />
            <Button
              label="Submit dispute"
              variant="danger"
              loading={m.isPending}
              onPress={() => m.mutate(payment.id)}
              className="flex-1"
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function navigateToSalary() {
  router.push('/salary');
}
