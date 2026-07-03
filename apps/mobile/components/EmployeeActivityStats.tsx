import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../lib/api';
import { QK } from '../lib/query-keys';
import { useFormatCurrency } from '../lib/currency';
import { useT } from '../lib/i18n';
import { Card } from './ui/Card';

type Period = 'today' | 'week' | 'month' | 'all';

/**
 * "My activity" period card for a FULL employee acting on their employer's
 * books. The employee already sees exactly what the owner sees (the shared
 * dashboard cards); this adds a self-scoped view — the sales, revenue and profit
 * that THEY personally rang up — filterable by period. Uses the existing
 * profit-summary endpoint with actorId='self' (viewer-relative: an employee's
 * own rows on the employer's books).
 */
export function EmployeeActivityStats() {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const [period, setPeriod] = useState<Period>('today');

  const { data, isLoading } = useQuery({
    queryKey: QK.profitSummary({ actor: 'self', period }),
    queryFn: () => dashboardApi.profitSummary({ period, actorId: 'self' }),
    staleTime: 15_000,
  });

  const periods: { value: Period; label: string }[] = [
    { value: 'today', label: t.home.periodToday },
    { value: 'week', label: t.home.periodWeek },
    { value: 'month', label: t.home.periodMonth },
    { value: 'all', label: t.home.periodAll },
  ];

  return (
    <Card className="mb-4">
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-muted dark:text-slate-500 text-sm font-medium uppercase tracking-wide">
          {t.home.myActivityTitle}
        </Text>
      </View>
      <Text className="text-muted dark:text-slate-500 text-xs mb-3">{t.home.myActivitySub}</Text>

      {/* Period selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 pb-1"
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
                  : 'bg-surface dark:bg-slate-900 border-border dark:border-slate-700'
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

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Text className="text-muted dark:text-slate-500 text-xs mb-0.5">
            {t.home.myActivitySales}
          </Text>
          <Text className="text-lg font-bold text-text dark:text-slate-100 tabular-nums">
            {isLoading ? '—' : (data?.salesCount ?? 0)}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-muted dark:text-slate-500 text-xs mb-0.5">
            {t.home.myActivityRevenue}
          </Text>
          <Text className="text-lg font-bold text-text dark:text-slate-100">
            {isLoading ? '—' : formatCurrency(data?.totalRevenue ?? '0')}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-muted dark:text-slate-500 text-xs mb-0.5">
            {t.home.myActivityProfit}
          </Text>
          <Text
            className={`text-lg font-bold ${
              parseFloat(data?.totalProfit ?? '0') >= 0 ? 'text-success' : 'text-danger'
            }`}
          >
            {isLoading ? '—' : formatCurrency(data?.totalProfit ?? '0')}
          </Text>
        </View>
      </View>
    </Card>
  );
}
