import { useState } from 'react';
import { ScrollView, View, Text, RefreshControl, TouchableOpacity, Pressable, Alert, ActivityIndicator } from 'react-native';
import Constants from 'expo-constants';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { dashboardApi, inventoryApi, salaryPaymentsApi, currencyApi, type SalaryPayment } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useFormatCurrency, useExchangeRate } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import { StatCard } from '../../components/ui/StatCard';
import { Card } from '../../components/ui/Card';
import { PersonaSwitcher } from '../../components/ui/PersonaSwitcher';
import { PersonaBanner } from '../../components/ui/PersonaBanner';
import { useAuthStore } from '../../store/auth.store';
import { useThemeStore } from '../../store/theme.store';
import { useLocaleStore } from '../../store/locale.store';
import { useOfflineStore } from '../../store/offline.store';
import { syncPendingSales } from '../../lib/sync';
import { formatMoney } from '../../lib/currency';
import type { AlertItem } from '../../lib/notifications';

interface ProductSummary {
  productName: string;
  category: string | null;
  piecesPerCarton: number | null;
  latestCartonPrice: string | null;
  latestUnitCost: string;
  latestSellingPrice: string;
  totalAvailable: number;
}

export default function DashboardScreen() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  // Show salary surfaces whenever the user has an active employment — the
  // salary is theirs regardless of which persona they're currently acting as.
  const isEmployee = !!user?.activeEmployment;
  const { theme, toggle } = useThemeStore();
  const formatCurrency = useFormatCurrency();
  const exchangeRate = useExchangeRate();
  const locale = useLocaleStore((s) => s.locale);
  const qc = useQueryClient();
  const [preparingOffline, setPreparingOffline] = useState(false);

  const {
    isOffline,
    pendingSales,
    syncStatus,
    syncProgress,
    lastSyncedAt,
    snapshotTakenAt,
    enableOfflineMode,
    disableOfflineMode,
    clearSyncErrors,
  } = useOfflineStore();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: QK.dashboard,
    queryFn: dashboardApi.summary,
    enabled: !isOffline,
  });

  const { data: suppliers } = useQuery({
    queryKey: QK.suppliers,
    queryFn: dashboardApi.suppliers,
    enabled: !isOffline,
  });

  const { data: alertsData } = useQuery({
    queryKey: QK.alerts,
    queryFn: dashboardApi.alerts,
    staleTime: 5 * 60_000,
    enabled: !isOffline,
  });

  const { data: cashData } = useQuery({
    queryKey: QK.cashPosition,
    queryFn: dashboardApi.cashPosition,
    enabled: !isOffline,
    staleTime: 30_000,
  });

  const { data: pendingSalaryData } = useQuery({
    queryKey: QK.salaryPaymentsPending,
    queryFn: salaryPaymentsApi.pending,
    staleTime: 30_000,
    enabled: !isOffline,
  });
  const pendingSalary = (pendingSalaryData as SalaryPayment[] | undefined) ?? [];
  const pendingSalaryTotal = pendingSalary.reduce((sum, p) => sum + parseFloat(p.amount), 0);

  const alerts = (alertsData as AlertItem[] | undefined) ?? [];
  const lowStockItems = alerts.filter((a) => a.type === 'low_stock');

  // Pending sales stats for sync banner
  const pendingCount = pendingSales.length;
  const pendingTotalFc = pendingSales.reduce((sum, s) => {
    const rate = parseFloat(exchangeRate) || 1;
    return sum + parseFloat(s.salePrice) * s.qtySold * rate;
  }, 0);
  const isSyncing = syncStatus === 'syncing';
  const hasSyncErrors = pendingSales.some((s) => s.syncError);
  const syncPct =
    syncProgress && syncProgress.total > 0
      ? Math.min(100, Math.round((syncProgress.completed / syncProgress.total) * 100))
      : 0;

  const handleToggleOffline = () => {
    if (isOffline) {
      Alert.alert(t.home.onlineConfirmTitle, t.home.onlineConfirmMsg, [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.home.goOnline, onPress: () => disableOfflineMode() },
      ]);
    } else {
      Alert.alert(t.home.offlineConfirmTitle, t.home.offlineConfirmMsg, [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.home.goOffline,
          onPress: async () => {
            setPreparingOffline(true);
            try {
              // Fetch the current rate + products in parallel so the offline
              // snapshot freezes both at the same moment. The rate is admin-
              // set on the API and doesn't change intraday, so locking it in
              // for the session keeps every FC display correct without
              // re-querying.
              const [products, rate] = await Promise.all([
                inventoryApi.listProducts() as Promise<ProductSummary[]>,
                currencyApi.getRate(),
              ]);
              enableOfflineMode(
                products
                  .filter((p) => p.totalAvailable > 0)
                  .map((p) => ({
                    productName: p.productName,
                    unitCost: p.latestUnitCost,
                    availableQty: p.totalAvailable,
                    piecesPerCarton: p.piecesPerCarton,
                    latestSellingPrice: p.latestSellingPrice,
                    latestCartonPrice: p.latestCartonPrice,
                    category: p.category,
                  })),
                rate.usdToFcRate,
              );
            } catch {
              Alert.alert(t.common.error, t.home.preparingOffline);
            } finally {
              setPreparingOffline(false);
            }
          },
        },
      ]);
    }
  };

  const runSync = async () => {
    const result = await syncPendingSales();
    qc.invalidateQueries({ queryKey: QK.dashboard });
    qc.invalidateQueries({ queryKey: QK.inventory() });
    qc.invalidateQueries({ queryKey: QK.salesHistory() });

    if (result.failed === 0) {
      // Nothing to report when there was nothing to do (e.g. a no-op restart).
      if (result.synced > 0) Alert.alert('✅', t.home.syncDone(result.synced));
    } else {
      Alert.alert(
        t.home.syncFailed(result.failed),
        result.errors.length > 0 ? `${t.home.syncErrors}\n${result.errors.join('\n')}` : undefined,
      );
    }
  };

  // Resume: continue from where it stopped — already-synced rows were removed
  // from the queue, so this only re-attempts the remaining/failed ones.
  const handleSync = () => {
    if (syncStatus === 'syncing') return;
    void runSync();
  };

  // Restart: clear stale error flags first, then re-run. Synced rows are
  // already gone from the queue (and the server dedupes on clientSaleId), so a
  // restart never re-sends a completed sale — it just retries the rest.
  const handleRestart = () => {
    if (syncStatus === 'syncing') return;
    clearSyncErrors();
    void runSync();
  };

  const snapshotLabel = snapshotTakenAt
    ? t.home.offlineSnapshotAt(new Date(snapshotTakenAt).toLocaleTimeString())
    : null;

  const lastSyncedLabel = lastSyncedAt
    ? t.home.lastSynced(new Date(lastSyncedAt).toLocaleTimeString())
    : null;

  return (
    <ScrollView
      className="flex-1 bg-surface dark:bg-slate-900"
      contentContainerClassName="px-4 pt-14 pb-8"
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} enabled={!isOffline} />
      }
    >
      {/* Header */}
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-1 pr-2">
          <Text className="text-2xl font-bold text-text dark:text-slate-100">{t.home.title}</Text>
          <View className="flex-row items-center gap-2 mt-0.5">
            <Text className="text-muted dark:text-slate-500 text-sm">@{user?.username}</Text>
            <PersonaSwitcher />
          </View>
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
          <TouchableOpacity
            onPress={() => router.push('/account')}
            hitSlop={8}
            accessibilityLabel={t.account.menuTitle}
          >
            <Text className="text-xl">👤</Text>
          </TouchableOpacity>
        </View>
      </View>

      <PersonaBanner />

      {/* Offline mode toggle */}
      <TouchableOpacity
        onPress={preparingOffline ? undefined : handleToggleOffline}
        className={`flex-row items-center justify-between rounded-2xl px-4 py-3 mb-4 border ${
          isOffline
            ? 'bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-700'
            : 'bg-card dark:bg-slate-800 border-border dark:border-slate-700'
        }`}
        activeOpacity={0.8}
      >
        <View className="flex-row items-center gap-3">
          {preparingOffline ? (
            <ActivityIndicator size="small" color="#d97706" />
          ) : (
            <Text className="text-base">{isOffline ? '📴' : '📶'}</Text>
          )}
          <View>
            <Text className={`font-semibold text-sm ${isOffline ? 'text-amber-700 dark:text-amber-300' : 'text-text dark:text-slate-100'}`}>
              {preparingOffline ? t.home.preparingOffline : isOffline ? t.home.offlineModeActive : t.home.goOffline}
            </Text>
            {isOffline && snapshotLabel && (
              <Text className="text-amber-600 dark:text-amber-400 text-xs">{snapshotLabel}</Text>
            )}
          </View>
        </View>
        {!preparingOffline && (
          <View className={`px-3 py-1 rounded-full ${isOffline ? 'bg-amber-200 dark:bg-amber-800' : 'bg-slate-100 dark:bg-slate-700'}`}>
            <Text className={`text-xs font-bold ${isOffline ? 'text-amber-800 dark:text-amber-200' : 'text-muted dark:text-slate-400'}`}>
              {isOffline ? t.home.goOnline : 'OFF'}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Sync banner — shown whenever there are pending sales */}
      {pendingCount > 0 && (
        <View className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-2xl px-4 py-3 mb-4">
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-1 pr-2">
              <Text className="text-blue-700 dark:text-blue-300 font-bold text-sm">
                🔄 {t.home.pendingSalesCount(pendingCount)}
              </Text>
              <Text className="text-blue-600 dark:text-blue-400 text-xs mt-0.5">
                {formatMoney(pendingTotalFc, '1')} total
              </Text>
              {isSyncing && syncProgress ? (
                <Text className="text-blue-600 dark:text-blue-400 text-xs mt-0.5 tabular-nums">
                  {t.home.syncProgress(syncProgress.completed, syncProgress.total, syncPct)}
                </Text>
              ) : (
                lastSyncedLabel && (
                  <Text className="text-blue-500 dark:text-blue-500 text-xs mt-0.5">{lastSyncedLabel}</Text>
                )
              )}
            </View>

            {/* Action area: spinner while syncing; Resume+Restart after a
                partial failure; a single Sync button otherwise. */}
            {isSyncing ? (
              <View className="px-4 py-2 rounded-xl bg-blue-200 dark:bg-blue-800">
                <ActivityIndicator size="small" color="#3b82f6" />
              </View>
            ) : hasSyncErrors ? (
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={handleSync}
                  className="px-3 py-2 rounded-xl bg-blue-600"
                  activeOpacity={0.8}
                >
                  <Text className="text-white font-semibold text-sm">{t.home.syncResume}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleRestart}
                  className="px-3 py-2 rounded-xl border border-blue-400 dark:border-blue-600"
                  activeOpacity={0.8}
                >
                  <Text className="text-blue-700 dark:text-blue-300 font-semibold text-sm">
                    {t.home.syncRestart}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleSync}
                className="px-4 py-2 rounded-xl bg-blue-600"
                activeOpacity={0.8}
              >
                <Text className="text-white font-semibold text-sm">{t.home.syncNow}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Progress bar — real width from completed/total */}
          {(isSyncing || (syncProgress && syncProgress.completed < syncProgress.total)) && (
            <View className="h-1.5 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden mt-1">
              <View
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${syncPct}%` }}
              />
            </View>
          )}

          {/* Failed sales list + retry hint */}
          {hasSyncErrors && (
            <View className="mt-2 border-t border-blue-200 dark:border-blue-700 pt-2 gap-1">
              {pendingSales
                .filter((s) => s.syncError)
                .map((s) => (
                  <Text key={s.id} className="text-red-500 text-xs">
                    ⚠ {s.productName} ×{s.qtySold} — {s.syncError}
                  </Text>
                ))}
              <Text className="text-blue-500 dark:text-blue-500 text-[11px] mt-1">
                {t.home.syncRetryHint}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Pending salary confirmations — shown to anyone with an active employment */}
      {!isOffline && isEmployee && pendingSalary.length > 0 && (
        <Pressable
          onPress={() => router.push('/salary')}
          className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3 mb-4 flex-row items-start gap-3"
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
        >
          <Text className="text-lg">💵</Text>
          <View className="flex-1">
            <Text className="text-amber-700 dark:text-amber-300 font-semibold text-sm">
              {pendingSalary.length === 1
                ? '1 salary payment to confirm'
                : `${pendingSalary.length} salary payments to confirm`}
            </Text>
            <Text className="text-amber-600 dark:text-amber-400 text-sm mt-0.5">
              {formatCurrency(pendingSalaryTotal.toFixed(4))} total · tap to review
            </Text>
          </View>
          <Text className="text-amber-700 dark:text-amber-300 text-sm font-medium">›</Text>
        </Pressable>
      )}

      {/* Alerts banner — only in online mode */}
      {!isOffline && lowStockItems.length > 0 && (
        <View className="mb-4 gap-2">
          {lowStockItems.length > 0 && (
            <Pressable
              onPress={() => router.push('/(tabs)/inventory')}
              className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-900 rounded-xl px-4 py-3 flex-row items-start gap-3"
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
            >
              <Text className="text-lg">📦</Text>
              <View className="flex-1">
                <Text className="text-warning font-semibold text-sm">
                  {t.home.lowStockItems(lowStockItems.length)}
                </Text>
                <Text className="text-warning text-sm mt-0.5">
                  {lowStockItems.slice(0, 2).map((a) => a.productName).join(', ')}
                  {lowStockItems.length > 2 && ` +${lowStockItems.length - 2} more`}
                  {` ${t.home.lowStockSuffix}`}
                </Text>
              </View>
              <Text className="text-warning text-sm font-medium">{t.home.viewArrow}</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Offline mode — simplified view */}
      {isOffline ? (
        <View className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-2xl px-4 py-6 items-center">
          <Text className="text-3xl mb-2">📴</Text>
          <Text className="text-amber-700 dark:text-amber-300 font-bold text-base text-center">
            {t.home.offlineModeActive}
          </Text>
          <Text className="text-amber-600 dark:text-amber-400 text-sm text-center mt-1">
            {useOfflineStore.getState().cachedProducts.length} products available
          </Text>
          <Text className="text-amber-500 dark:text-amber-500 text-xs text-center mt-1">
            Go to the Sales tab to record sales offline
          </Text>
        </View>
      ) : (
        <>
          {/* Net Position */}
          <Card className="mb-3">
            <Text className="text-muted dark:text-slate-500 text-sm font-medium uppercase tracking-wide mb-1">{t.home.netPosition}</Text>
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
            <Text className="text-muted dark:text-slate-500 text-sm mt-1">{t.home.netPositionSub}</Text>
          </Card>

          {/* Available Business Cash — what's actually in the till. Honors persona via X-Acting-As. */}
          <Card className="mb-4">
            <Text className="text-muted dark:text-slate-500 text-sm font-medium uppercase tracking-wide mb-1">
              {t.home.availableBusinessCash}
            </Text>
            {cashData ? (
              <Text
                className={`text-3xl font-bold ${
                  parseFloat(cashData.availableBusinessCash) >= 0 ? 'text-success' : 'text-danger'
                }`}
              >
                {formatCurrency(cashData.availableBusinessCash)}
              </Text>
            ) : (
              <Text className="text-3xl font-bold text-text dark:text-slate-100">—</Text>
            )}
            <Text className="text-muted dark:text-slate-500 text-sm mt-1">
              {cashData && parseFloat(cashData.availableBusinessCash) < 0
                ? t.home.availableBusinessCashOver
                : t.home.availableBusinessCashSub}
            </Text>
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

          {/* Expenses entry tile */}
          <Pressable
            onPress={() => router.push('/expenses')}
            className="flex-row items-center bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl px-4 py-4 mb-3"
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
          >
            <Text className="text-2xl mr-3">🧾</Text>
            <View className="flex-1">
              <Text className="text-text dark:text-slate-100 font-semibold text-base">{t.expenses.title}</Text>
              <Text className="text-muted dark:text-slate-400 text-xs mt-0.5">{t.expenses.subtitle}</Text>
            </View>
            <Text className="text-muted dark:text-slate-500 text-xl">›</Text>
          </Pressable>

          {/* Salary entry tile — shown to anyone with an active employment */}
          {isEmployee && (
            <Pressable
              onPress={() => router.push('/salary')}
              className="flex-row items-center bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl px-4 py-4 mb-5"
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
            >
              <Text className="text-2xl mr-3">💵</Text>
              <View className="flex-1">
                <Text className="text-text dark:text-slate-100 font-semibold text-base">{t.salary.title}</Text>
                <Text className="text-muted dark:text-slate-400 text-xs mt-0.5">{t.salary.homeSubtitle}</Text>
              </View>
              <Text className="text-muted dark:text-slate-500 text-xl">›</Text>
            </Pressable>
          )}

          {/* Top Suppliers */}
          {(suppliers?.length ?? 0) > 0 && (
            <View className="mb-5">
              <Text className="text-text dark:text-slate-100 font-semibold text-lg mb-2">{t.home.topSuppliers}</Text>
              {(suppliers as Array<{ supplierUserId: string; supplierUsername: string; outstandingBalance: string }>)
                .slice(0, 3)
                .map((s) => (
                  <Pressable
                    key={s.supplierUserId}
                    onPress={() => router.push(`/supplier/${s.supplierUserId}`)}
                    className="flex-row items-center justify-between bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl px-4 py-3 mb-2"
                    style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
                  >
                    <View>
                      <Text className="text-text dark:text-slate-100 font-semibold text-base">@{s.supplierUsername}</Text>
                      <Text className="text-muted dark:text-slate-500 text-sm">{t.home.youOwe}</Text>
                    </View>
                    <Text className="text-danger font-bold text-base">{formatCurrency(s.outstandingBalance)}</Text>
                  </Pressable>
                ))}
              <TouchableOpacity onPress={() => router.push('/(tabs)/network')}>
                <Text className="text-primary text-sm font-medium text-center mt-1">{t.home.viewAllSuppliers}</Text>
              </TouchableOpacity>
            </View>
          )}

        </>
      )}

      {/* App version footer — keep last so the value is easy for users to read out during bug reports. */}
      <View className="items-center mt-8 mb-4">
        <Text className="text-muted dark:text-slate-500 text-xs tabular-nums">
          v{Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '—'}
          {Constants.nativeBuildVersion ? ` (${Constants.nativeBuildVersion})` : ''}
        </Text>
      </View>
    </ScrollView>
  );
}
