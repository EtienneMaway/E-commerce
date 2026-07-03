import { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { miniSettlementsApi, type MiniStatsPeriod } from '../lib/api';
import { QK } from '../lib/query-keys';
import { formatFcValue } from '../lib/currency';
import { formatDate, getErrorMessage } from '../lib/utils';
import { useT } from '../lib/i18n';
import { Card } from './ui/Card';
import { StatCard } from './ui/StatCard';

/**
 * Home-screen statistics for a mini employee. Replaces the owner-oriented cards
 * (net position / owed-to-me / all-time profit) with the three figures a mini
 * actually cares about, all scoped to a period that defaults to "since my last
 * handover" (their current un-settled cycle):
 *   - Cash to hand over  — what they owe for sold goods, net of expenses
 *   - I owe              — value of products taken and not yet handed over
 *   - Profit made        — their markup on the sold goods
 * No "owed to me" — nobody owes a mini employee.
 */
export function MiniHomeStats() {
  const t = useT();
  const [period, setPeriod] = useState<MiniStatsPeriod>('since_handover');

  const { data: stats, isLoading, error } = useQuery({
    queryKey: QK.miniStats(period),
    queryFn: () => miniSettlementsApi.stats(period),
    staleTime: 15_000,
  });

  const periods: { value: MiniStatsPeriod; label: string }[] = [
    { value: 'since_handover', label: t.miniEmployee.periodSinceHandover },
    { value: 'today', label: t.miniEmployee.periodToday },
    { value: 'week', label: t.miniEmployee.periodWeek },
    { value: 'month', label: t.miniEmployee.periodMonth },
    { value: 'all', label: t.miniEmployee.periodAll },
  ];

  // All FC-native from the server (each row at its consignment's locked rate),
  // so a rate change never moves these. Cash to hand over = owed for sold goods
  // minus the period's pending expenses, floored at 0 — all in FC.
  const cashForSoldFc = parseFloat(stats?.cashForSoldFc ?? '0') || 0;
  const expensesFc = parseFloat(stats?.expensesFc ?? '0') || 0;
  const netFc = Math.max(0, cashForSoldFc - expensesFc);

  // Notice text: for the default cycle window, remind them where it starts.
  const notice =
    period === 'since_handover'
      ? stats?.lastHandoverAt
        ? t.miniEmployee.statsNoticeSinceHandover(formatDate(stats.lastHandoverAt))
        : t.miniEmployee.statsNoticeNeverHandover
      : t.miniEmployee.statsNoticeWindow;

  return (
    <View className="mb-4">
      {/* Period selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 pb-2"
        className="mb-3"
      >
        {periods.map((p) => {
          const active = p.value === period;
          return (
            <Pressable
              key={p.value}
              onPress={() => setPeriod(p.value)}
              className={`px-3.5 py-1.5 rounded-full border ${
                active
                  ? 'bg-primary border-primary'
                  : 'bg-card dark:bg-slate-800 border-border dark:border-slate-700'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  active ? 'text-white' : 'text-muted dark:text-slate-400'
                }`}
              >
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {error ? (
        <Card className="mb-3">
          <Text className="text-danger text-sm">{getErrorMessage(error)}</Text>
        </Card>
      ) : (
        <>
          {/* Cash to hand over — the mini's "available business cash". */}
          <Card className="mb-3">
            <Text className="text-muted dark:text-slate-500 text-sm font-medium uppercase tracking-wide mb-1">
              {t.miniEmployee.statsCashToHandover}
            </Text>
            <Text className="text-3xl font-bold text-success">
              {isLoading ? '—' : formatFcValue(netFc)}
            </Text>
            <Text className="text-muted dark:text-slate-500 text-sm mt-1">
              {t.miniEmployee.statsCashToHandoverSub}
            </Text>
          </Card>

          {/* I owe + Profit made */}
          <View className="flex-row gap-3 mb-3">
            <StatCard
              label={t.miniEmployee.statsIOwe}
              value={isLoading ? '—' : formatFcValue(stats?.iOweFc ?? '0')}
              sub={t.miniEmployee.statsIOweSub}
              color="danger"
            />
            <StatCard
              label={t.miniEmployee.statsProfitMade}
              value={isLoading ? '—' : formatFcValue(stats?.profitMadeFc ?? '0')}
              sub={t.miniEmployee.statsProfitMadeSub}
              color={parseFloat(stats?.profitMadeFc ?? '0') >= 0 ? 'success' : 'danger'}
            />
          </View>

          {/* Memory-jogging notice about the active window */}
          <View className="flex-row items-start gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2.5 mb-1">
            {isLoading ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <Text className="text-sm">💡</Text>
            )}
            <Text className="flex-1 text-muted dark:text-slate-400 text-xs leading-4">{notice}</Text>
          </View>
        </>
      )}
    </View>
  );
}
