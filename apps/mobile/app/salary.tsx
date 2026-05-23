import { useMemo, useState } from 'react';
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
import { useAuthStore } from '../store/auth.store';
import { useLocaleStore } from '../store/locale.store';
import { formatCurrency, formatDate, getErrorMessage } from '../lib/utils';
import { useT } from '../lib/i18n';

const STATUS_PILL: Record<SalaryPaymentStatus, string> = {
  PENDING_CONFIRMATION: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300',
  CONFIRMED: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  REJECTED: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',
  CANCELLED: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
};

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function SalaryScreen() {
  const t = useT();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const locale = useLocaleStore((s) => s.locale);
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [period, setPeriod] = useState<string>(currentPeriod());
  const [rejectTarget, setRejectTarget] = useState<SalaryPayment | null>(null);

  const employmentId = user?.activeEmployment?.id;
  const employerName = user?.activeEmployment?.employer.username;

  const formatPeriodMonth = (p: string): string => {
    const [y, m] = p.split('-').map(Number);
    return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(y, m - 1, 1));
  };

  const { data: summary } = useQuery({
    queryKey: QK.salarySummary(employmentId ?? '', period),
    queryFn: () => salaryPaymentsApi.summary(employmentId!, period),
    enabled: !!employmentId,
    staleTime: 15_000,
  });

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
    onError: (err) => Alert.alert(t.salary.rejectFailed, getErrorMessage(err)),
  });

  const handleConfirm = (p: SalaryPayment) => {
    Alert.alert(
      t.salary.confirmCash,
      t.salary.confirmCashMsg(
        formatCurrency(p.amount),
        p.employer?.username ?? '—',
        formatPeriodMonth(p.periodMonth),
      ),
      [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.salary.confirmBtn, onPress: () => confirmM.mutate(p.id) },
      ],
    );
  };

  const list = tab === 'pending' ? (pending ?? []) : (history ?? []);
  const refreshing = tab === 'pending' ? refPending : refHistory;
  const refresh = tab === 'pending' ? refetchPending : refetchHistory;

  // Group history by period for a quick recent-months breakdown (history tab only).
  const periodSummary = useMemo(() => {
    if (tab !== 'history') return null;
    const byPeriod = new Map<string, { confirmed: number; pending: number }>();
    for (const p of history ?? []) {
      const entry = byPeriod.get(p.periodMonth) ?? { confirmed: 0, pending: 0 };
      const amt = parseFloat(p.amount);
      if (p.status === 'CONFIRMED') entry.confirmed += amt;
      else if (p.status === 'PENDING_CONFIRMATION') entry.pending += amt;
      byPeriod.set(p.periodMonth, entry);
    }
    return Array.from(byPeriod.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6);
  }, [history, tab]);

  // No active employment — show the "not employed" message.
  if (user && !user.activeEmployment) {
    return (
      <View className="flex-1 bg-surface dark:bg-slate-900 p-6">
        <Stack.Screen options={{ title: t.salary.title, headerBackTitle: t.salary.headerBack }} />
        <EmptyState emoji="🏢" title={t.salary.title} subtitle={t.salary.noEmployment} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface dark:bg-slate-900">
      <Stack.Screen options={{ title: t.salary.title, headerBackTitle: t.salary.headerBack }} />

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-3 pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {/* Employer banner */}
        {employerName && (
          <Text className="text-muted dark:text-slate-400 text-sm mb-3">
            {t.salary.employerLabel}: <Text className="font-bold text-text dark:text-slate-100">@{employerName}</Text>
          </Text>
        )}

        {/* Monthly summary */}
        <Card className="mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <View>
              <Text className="text-text dark:text-slate-100 font-semibold text-base">
                {formatPeriodMonth(period)}
              </Text>
              <Text className="text-muted dark:text-slate-500 text-xs mt-0.5">
                {summary?.monthlyPay ? t.salary.monthlyTarget : t.salary.monthlyTargetNotSet}
              </Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Pressable
                onPress={() => setPeriod((p) => shiftPeriod(p, -1))}
                hitSlop={8}
                className="bg-surface dark:bg-slate-700 border border-border dark:border-slate-600 rounded-lg px-3 py-1"
              >
                <Text className="text-text dark:text-slate-200 font-bold">‹</Text>
              </Pressable>
              <Pressable
                onPress={() => setPeriod(currentPeriod())}
                hitSlop={8}
                className="bg-surface dark:bg-slate-700 border border-border dark:border-slate-600 rounded-lg px-2 py-1"
              >
                <Text className="text-text dark:text-slate-200 text-[11px] font-semibold">●</Text>
              </Pressable>
              <Pressable
                onPress={() => setPeriod((p) => shiftPeriod(p, +1))}
                hitSlop={8}
                className="bg-surface dark:bg-slate-700 border border-border dark:border-slate-600 rounded-lg px-3 py-1"
              >
                <Text className="text-text dark:text-slate-200 font-bold">›</Text>
              </Pressable>
            </View>
          </View>

          <View className="flex-row flex-wrap -mx-1">
            <SummaryCell
              label={t.salary.monthlyPay}
              value={summary?.monthlyPay ? formatCurrency(summary.monthlyPay) : '—'}
            />
            <SummaryCell
              label={t.salary.collectedSoFar}
              value={formatCurrency(summary?.paidConfirmed ?? '0')}
              tone="success"
            />
            <SummaryCell
              label={t.salary.pending}
              value={formatCurrency(summary?.pendingConfirmation ?? '0')}
              tone={summary && parseFloat(summary.pendingConfirmation) > 0 ? 'warning' : undefined}
              hint={
                summary && parseFloat(summary.pendingConfirmation) > 0
                  ? t.salary.pendingHint
                  : undefined
              }
            />
            <SummaryCell
              label={t.salary.remaining}
              value={summary?.balanceRemaining ? formatCurrency(summary.balanceRemaining) : '—'}
              tone="info"
              hint={
                summary?.balanceRemaining && parseFloat(summary.balanceRemaining) === 0
                  ? t.salary.fullyPaid
                  : undefined
              }
            />
          </View>
        </Card>

        {/* Tabs */}
        <View className="flex-row gap-2 mb-3">
          <TabButton
            active={tab === 'pending'}
            onPress={() => setTab('pending')}
            label={t.salary.tabPending(pending?.length ?? 0)}
          />
          <TabButton active={tab === 'history'} onPress={() => setTab('history')} label={t.salary.tabHistory} />
        </View>

        {/* History monthly breakdown */}
        {tab === 'history' && periodSummary && periodSummary.length > 0 && (
          <View className="flex-row flex-wrap -mx-1 mb-3">
            {periodSummary.map(([p, totals]) => (
              <View key={p} className="w-1/2 px-1 mb-2">
                <View className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl px-3 py-2">
                  <Text className="text-muted dark:text-slate-500 text-[10px]">{formatPeriodMonth(p)}</Text>
                  <Text className="text-success font-bold text-sm">
                    {formatCurrency(totals.confirmed.toFixed(4))}
                  </Text>
                  {totals.pending > 0 && (
                    <Text className="text-amber-600 dark:text-amber-400 text-[10px]">
                      + {formatCurrency(totals.pending.toFixed(4))} {t.salary.pending.toLowerCase()}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* List */}
        {list.length === 0 ? (
          <EmptyState
            emoji={tab === 'pending' ? '✅' : '📒'}
            title={tab === 'pending' ? t.salary.nothingToConfirm : t.salary.noPaymentsYet}
          />
        ) : (
          <View className="gap-3 mt-1">
            {list.map((p) => (
              <PaymentCard
                key={p.id}
                payment={p}
                onConfirm={() => handleConfirm(p)}
                onReject={() => setRejectTarget(p)}
                confirming={confirmM.isPending && confirmM.variables === p.id}
                formatPeriodMonth={formatPeriodMonth}
                t={t}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <RejectModal
        payment={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onSuccess={invalidate}
        t={t}
      />
    </View>
  );
}

function SummaryCell({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'warning' | 'info';
  hint?: string;
}) {
  const toneCls =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : tone === 'info'
          ? 'text-indigo-600 dark:text-indigo-300'
          : 'text-text dark:text-slate-100';
  return (
    <View className="w-1/2 px-1 mb-2">
      <Text className="text-muted dark:text-slate-500 text-[10px] uppercase tracking-wide">
        {label}
      </Text>
      <Text className={`text-base font-bold mt-0.5 ${toneCls}`}>{value}</Text>
      {hint && (
        <Text className="text-muted dark:text-slate-500 text-[10px] mt-0.5">{hint}</Text>
      )}
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
  formatPeriodMonth,
  t,
}: {
  payment: SalaryPayment;
  onConfirm: () => void;
  onReject: () => void;
  confirming: boolean;
  formatPeriodMonth: (p: string) => string;
  t: ReturnType<typeof useT>;
}) {
  const isPending = p.status === 'PENDING_CONFIRMATION';
  const statusLabel: Record<SalaryPaymentStatus, string> = {
    PENDING_CONFIRMATION: t.salary.statusAwaiting,
    CONFIRMED: t.salary.statusConfirmed,
    REJECTED: t.salary.statusRejected,
    CANCELLED: t.salary.statusCancelled,
  };
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
            {statusLabel[p.status]}
          </Text>
        </View>
      </View>

      <Text className="text-muted dark:text-slate-500 text-xs mt-2">
        {formatDate(p.paidAt)}
        {p.confirmedAt ? ` · ${t.salary.statusConfirmed} ${formatDate(p.confirmedAt)}` : ''}
        {p.rejectedAt ? ` · ${t.salary.statusRejected} ${formatDate(p.rejectedAt)}` : ''}
      </Text>

      {p.note && (
        <Text className="text-text dark:text-slate-300 text-sm mt-2 italic">
          "{p.note}"
        </Text>
      )}
      {p.rejectionReason && (
        <Text className="text-red-600 dark:text-red-400 text-xs mt-2">
          {p.rejectionReason}
        </Text>
      )}

      {isPending && (
        <View className="flex-row gap-2 mt-3">
          <Button
            label={confirming ? t.salary.confirming : t.salary.confirmBtn}
            onPress={onConfirm}
            loading={confirming}
            className="flex-1"
          />
          <Button
            label={t.salary.rejectBtn}
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
  t,
}: {
  payment: SalaryPayment | null;
  onClose: () => void;
  onSuccess: () => void;
  t: ReturnType<typeof useT>;
}) {
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: (id: string) => salaryPaymentsApi.reject(id, reason || undefined),
    onSuccess: () => {
      onSuccess();
      setReason('');
      onClose();
    },
    onError: (err) => Alert.alert(t.salary.rejectFailed, getErrorMessage(err)),
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
            {t.salary.rejectBtn}
          </Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder=""
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={3}
            className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl px-4 py-3 text-text dark:text-slate-100 text-base"
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
          <View className="flex-row gap-2 mt-4">
            <Button label={t.common.cancel} variant="outline" onPress={onClose} className="flex-1" />
            <Button
              label={t.salary.rejectBtn}
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
