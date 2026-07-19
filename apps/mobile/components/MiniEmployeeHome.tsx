import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  authApi,
  consignmentsApi,
  employmentsApi,
  type ConsignmentSummary,
  type EmploymentSummary,
} from '../lib/api';
import { QK } from '../lib/query-keys';
import { useAuthStore } from '../store/auth.store';
import { getErrorMessage } from '../lib/utils';
import { useT } from '../lib/i18n';
import { ReceiveConsignmentModal } from './forms/ReceiveConsignmentModal';
import { HandoverModal } from './forms/HandoverModal';
import { HandoverStatusBanner } from './ui/HandoverStatusBanner';
import { usePendingHandover } from '../hooks/use-pending-handover';

/**
 * Mini-employee home surfaces. Two states:
 *  - PENDING invite (paired but not yet accepted): accept / decline card.
 *  - ACTIVE: entry points to receive assigned products and to hand over cash +
 *    returns. Renders nothing for non-mini users.
 */
export function MiniEmployeeHome() {
  const t = useT();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  // A handover awaiting approval locks the card — a second one would claim the
  // same unsold units, since stock only leaves the mini's books on approval.
  const { isBlocked: handoverPending } = usePendingHandover();

  // A mini is identified by a Sales-only (SALES_ONLY) employment — not the
  // legacy synthetic-account flag — so a normal user who accepts a sales-only
  // invite gets these surfaces too.
  const active = user?.activeEmployment;
  const isActiveMini = active?.tier === 'SALES_ONLY';

  // Pending invite lookup — runs when the user has no active employment (they
  // may have a pending sales-only invite to accept). Returns nothing for owners.
  const { data: employments, isLoading: loadingEmp } = useQuery({
    queryKey: QK.employments({ role: 'employee' }),
    queryFn: () => employmentsApi.list({ role: 'employee' }),
    enabled: !active,
    staleTime: 15_000,
  });
  const pendingInvite = ((employments as EmploymentSummary[] | undefined) ?? []).find(
    (e) => e.status === 'PENDING' && e.tier === 'SALES_ONLY',
  );

  // Count of consignments waiting to be received (badge on the Receive card).
  const { data: incoming } = useQuery({
    queryKey: QK.consignmentsIncoming,
    queryFn: consignmentsApi.incoming,
    enabled: isActiveMini,
    staleTime: 15_000,
  });
  const pendingReceiveCount = ((incoming as ConsignmentSummary[] | undefined) ?? []).filter(
    (c) => c.status === 'PENDING',
  ).length;

  const refreshMe = async () => {
    const token = useAuthStore.getState().token;
    if (token) {
      const me = await authApi.me();
      await login(token, me);
    }
    qc.invalidateQueries();
  };

  const acceptM = useMutation({
    mutationFn: (id: string) => employmentsApi.accept(id),
    onSuccess: refreshMe,
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });
  const rejectM = useMutation({
    mutationFn: (id: string) => employmentsApi.reject(id),
    onSuccess: refreshMe,
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });

  // ── Pending invite state (or not a mini at all) ──
  if (!isActiveMini) {
    // Active but a full employee, or still loading the invite list → render nothing.
    if (active || loadingEmp || !pendingInvite) return null;
    const busy = acceptM.isPending || rejectM.isPending;
    return (
      <View className="bg-primary/10 border border-primary/30 rounded-2xl px-4 py-4 mb-4">
        <Text className="text-text dark:text-slate-100 font-bold text-base">{t.miniEmployee.inviteTitle}</Text>
        <Text className="text-muted dark:text-slate-400 text-sm mt-1">
          {t.miniEmployee.inviteFrom(pendingInvite.employer?.username ?? '—')}
        </Text>
        <View className="flex-row gap-2 mt-3">
          <Pressable
            onPress={() => acceptM.mutate(pendingInvite.id)}
            disabled={busy}
            className="flex-1 bg-primary rounded-xl py-2.5 items-center"
            style={{ opacity: busy ? 0.5 : 1 }}
          >
            <Text className="text-white font-semibold text-sm">{t.miniEmployee.inviteAccept}</Text>
          </Pressable>
          <Pressable
            onPress={() => rejectM.mutate(pendingInvite.id)}
            disabled={busy}
            className="px-4 rounded-xl py-2.5 items-center justify-center border border-danger"
            style={{ opacity: busy ? 0.5 : 1 }}
          >
            <Text className="text-danger font-semibold text-sm">{t.miniEmployee.inviteDecline}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Active state ──
  return (
    <View className="mb-4 gap-3">
      <HandoverStatusBanner />
      <Pressable
        onPress={() => setReceiveOpen(true)}
        className="flex-row items-center bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl px-4 py-4"
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      >
        <Text className="text-2xl mr-3">📥</Text>
        <View className="flex-1">
          <Text className="text-text dark:text-slate-100 font-semibold text-base">{t.miniEmployee.receiveCardTitle}</Text>
          <Text className="text-muted dark:text-slate-400 text-xs mt-0.5">{t.miniEmployee.receiveCardSub}</Text>
        </View>
        {pendingReceiveCount > 0 && (
          <View className="bg-primary rounded-full min-w-6 h-6 px-1.5 items-center justify-center mr-1">
            <Text className="text-white text-xs font-bold">{pendingReceiveCount}</Text>
          </View>
        )}
        <Text className="text-muted dark:text-slate-500 text-xl">›</Text>
      </Pressable>

      <Pressable
        onPress={() => setHandoverOpen(true)}
        disabled={handoverPending}
        className="flex-row items-center bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl px-4 py-4"
        style={({ pressed }) => ({ opacity: handoverPending ? 0.5 : pressed ? 0.8 : 1 })}
      >
        <Text className="text-2xl mr-3">🤲</Text>
        <View className="flex-1">
          <Text className="text-text dark:text-slate-100 font-semibold text-base">{t.miniEmployee.handoverCardTitle}</Text>
          <Text className="text-muted dark:text-slate-400 text-xs mt-0.5">
            {handoverPending ? t.miniEmployee.handoverCardWaiting : t.miniEmployee.handoverCardSub}
          </Text>
        </View>
        {!handoverPending && <Text className="text-muted dark:text-slate-500 text-xl">›</Text>}
      </Pressable>

      <ReceiveConsignmentModal visible={receiveOpen} onClose={() => setReceiveOpen(false)} />
      <HandoverModal visible={handoverOpen} onClose={() => setHandoverOpen(false)} />
    </View>
  );
}
