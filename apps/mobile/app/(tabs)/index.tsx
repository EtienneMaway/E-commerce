import { ScrollView, View, Text, RefreshControl, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { dashboardApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import { StatCard } from '../../components/ui/StatCard';
import { Card } from '../../components/ui/Card';
import { useAuthStore } from '../../store/auth.store';
import { useThemeStore } from '../../store/theme.store';
import { useLocaleStore } from '../../store/locale.store';
import type { AlertItem } from '../../lib/notifications';

export default function DashboardScreen() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { theme, toggle } = useThemeStore();
  const formatCurrency = useFormatCurrency();
  const locale = useLocaleStore((s) => s.locale);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: QK.dashboard,
    queryFn: dashboardApi.summary,
  });

  const { data: suppliers } = useQuery({
    queryKey: QK.suppliers,
    queryFn: dashboardApi.suppliers,
  });

  const { data: debtors } = useQuery({
    queryKey: QK.debtors,
    queryFn: dashboardApi.debtors,
  });

  const { data: alertsData } = useQuery({
    queryKey: QK.alerts,
    queryFn: dashboardApi.alerts,
    staleTime: 5 * 60_000, // 5 min — no need to hammer this
  });

  const alerts = (alertsData as AlertItem[] | undefined) ?? [];
  const overdueDebtors = alerts.filter((a) => a.type === 'overdue_debtor');
  const lowStockItems = alerts.filter((a) => a.type === 'low_stock');

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <ScrollView
      className="flex-1 bg-surface dark:bg-slate-900"
      contentContainerClassName="px-4 pt-14 pb-8"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-2xl font-bold text-text dark:text-slate-100">{t.home.title}</Text>
          <Text className="text-muted dark:text-slate-500 text-sm">@{user?.username}</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <TouchableOpacity onPress={toggle}>
            <Text className="text-xl">{theme === 'dark' ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
          <View className="flex-row items-center gap-1 bg-card dark:bg-slate-800 rounded-lg px-1 py-0.5">
            {(['en', 'fr'] as const).map((l) => (
              <TouchableOpacity
                key={l}
                onPress={() => void useLocaleStore.getState().setLocale(l)}
                className={`px-2 py-1 rounded-md ${locale === l ? 'bg-primary' : ''}`}
              >
                <Text className={`text-xs font-bold ${locale === l ? 'text-white' : 'text-muted dark:text-slate-500'}`}>
                  {l.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={handleLogout}>
            <Text className="text-danger font-medium">{t.home.logout}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Alerts banner */}
      {alerts.length > 0 && (
        <View className="mb-4 gap-2">
          {overdueDebtors.length > 0 && (
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/network')}
              className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 flex-row items-start gap-3"
            >
              <Text className="text-lg">⏰</Text>
              <View className="flex-1">
                <Text className="text-danger font-semibold text-sm">
                  {t.home.overdueDebtors(overdueDebtors.length)}
                </Text>
                <Text className="text-danger text-xs mt-0.5">
                  {overdueDebtors.slice(0, 2).map((a) => `@${a.debtorUsername}`).join(', ')}
                  {overdueDebtors.length > 2 && ` +${overdueDebtors.length - 2} more`}
                  {` ${t.home.overdueSuffix}`}
                </Text>
              </View>
              <Text className="text-danger text-xs font-medium">{t.home.viewArrow}</Text>
            </TouchableOpacity>
          )}
          {lowStockItems.length > 0 && (
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/inventory')}
              className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-900 rounded-xl px-4 py-3 flex-row items-start gap-3"
            >
              <Text className="text-lg">📦</Text>
              <View className="flex-1">
                <Text className="text-warning font-semibold text-sm">
                  {t.home.lowStockItems(lowStockItems.length)}
                </Text>
                <Text className="text-warning text-xs mt-0.5">
                  {lowStockItems.slice(0, 2).map((a) => a.productName).join(', ')}
                  {lowStockItems.length > 2 && ` +${lowStockItems.length - 2} more`}
                  {` ${t.home.lowStockSuffix}`}
                </Text>
              </View>
              <Text className="text-warning text-xs font-medium">{t.home.viewArrow}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Net Position */}
      <Card className="mb-4">
        <Text className="text-muted dark:text-slate-500 text-xs font-medium uppercase tracking-wide mb-1">{t.home.netPosition}</Text>
        {isLoading ? (
          <Text className="text-3xl font-bold text-text dark:text-slate-100">—</Text>
        ) : (
          <Text
            className={`text-3xl font-bold ${
              parseFloat(data?.netPosition ?? '0') >= 0 ? 'text-success' : 'text-danger'
            }`}
          >
            {formatCurrency(data?.netPosition ?? '0')}
          </Text>
        )}
        <Text className="text-muted dark:text-slate-500 text-xs mt-1">{t.home.netPositionSub}</Text>
      </Card>

      {/* KPI row 1 */}
      <View className="flex-row gap-3 mb-3">
        <StatCard
          label={t.home.iOwe}
          value={isLoading ? '—' : formatCurrency(data?.totalIOwe ?? '0')}
          color="danger"
        />
        <StatCard
          label={t.home.owedToMe}
          value={isLoading ? '—' : formatCurrency(data?.totalOwedToMe ?? '0')}
          color="success"
        />
      </View>

      {/* All-time profit */}
      <StatCard
        label={t.home.totalProfit}
        value={isLoading ? '—' : formatCurrency(data?.totalProfitAllTime ?? '0')}
        color={parseFloat(data?.totalProfitAllTime ?? '0') >= 0 ? 'success' : 'danger'}
        className="mb-6"
      />

      {/* Top Suppliers */}
      {(suppliers?.length ?? 0) > 0 && (
        <View className="mb-5">
          <Text className="text-text dark:text-slate-100 font-semibold text-base mb-2">{t.home.topSuppliers}</Text>
          {(suppliers as Array<{ supplierUserId: string; supplierUsername: string; outstandingBalance: string }>)
            .slice(0, 3)
            .map((s) => (
              <TouchableOpacity
                key={s.supplierUserId}
                onPress={() => router.push(`/supplier/${s.supplierUserId}`)}
                className="flex-row items-center justify-between bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl px-4 py-3 mb-2"
              >
                <View>
                  <Text className="text-text dark:text-slate-100 font-medium">@{s.supplierUsername}</Text>
                  <Text className="text-muted dark:text-slate-500 text-xs">{t.home.youOwe}</Text>
                </View>
                <Text className="text-danger font-semibold">{formatCurrency(s.outstandingBalance)}</Text>
              </TouchableOpacity>
            ))}
          <TouchableOpacity onPress={() => router.push('/(tabs)/network')}>
            <Text className="text-primary text-sm font-medium text-center mt-1">{t.home.viewAllSuppliers}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Top Debtors */}
      {(debtors?.length ?? 0) > 0 && (
        <View>
          <Text className="text-text dark:text-slate-100 font-semibold text-base mb-2">{t.home.topDebtors}</Text>
          {(debtors as Array<{ debtorUserId: string; debtorUsername: string; outstandingBalance: string }>)
            .slice(0, 3)
            .map((d) => (
              <TouchableOpacity
                key={d.debtorUserId}
                onPress={() => router.push(`/debtor/${d.debtorUserId}`)}
                className="flex-row items-center justify-between bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl px-4 py-3 mb-2"
              >
                <View>
                  <Text className="text-text dark:text-slate-100 font-medium">@{d.debtorUsername}</Text>
                  <Text className="text-muted dark:text-slate-500 text-xs">{t.home.owesYou}</Text>
                </View>
                <Text className="text-success font-semibold">{formatCurrency(d.outstandingBalance)}</Text>
              </TouchableOpacity>
            ))}
          <TouchableOpacity onPress={() => router.push('/(tabs)/network')}>
            <Text className="text-primary text-sm font-medium text-center mt-1">{t.home.viewAllDebtors}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}
