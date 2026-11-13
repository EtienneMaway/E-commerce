import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView, View, Text, RefreshControl, TouchableOpacity, Pressable, ActivityIndicator } from 'react-native';
import Constants from 'expo-constants';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { authApi, dashboardApi, inventoryApi, salaryPaymentsApi, currencyApi, miniSettlementsApi, type SalaryPayment, type DashboardHome } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useBrand } from '../../lib/theme';
import { useFormatCurrency, useExchangeRate } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import { usePermissions } from '../../lib/permissions';
import { NoAccessNotice } from '../../components/NoAccessNotice';
import { StatCard } from '../../components/ui/StatCard';
import { Card } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { NavRow } from '../../components/ui/NavRow';
import { Sheet, SheetPoint } from '../../components/ui/Sheet';
import { Button } from '../../components/ui/Button';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PersonaSwitcher } from '../../components/ui/PersonaSwitcher';
import { ShopSwitcher } from '../../components/ui/ShopSwitcher';
import { PersonaBanner } from '../../components/ui/PersonaBanner';
import { UpdateBanner } from '../../components/ui/UpdateNotice';
import { MiniEmployeeHome } from '../../components/MiniEmployeeHome';
import { PendingTierChangeCard } from '../../components/PendingTierChangeCard';
import { MiniHomeStats } from '../../components/MiniHomeStats';
import { EmployeeActivityStats } from '../../components/EmployeeActivityStats';
import { useAuthStore } from '../../store/auth.store';
import { usePersonaStore } from '../../store/persona.store';
import { useThemeStore } from '../../store/theme.store';
import { useLocaleStore } from '../../store/locale.store';
import { useOfflineStore } from '../../store/offline.store';
import { useShopStore } from '../../store/shop.store';
import { syncPendingSales } from '../../lib/sync';
import { formatMoney } from '../../lib/currency';
import type { AlertItem } from '../../lib/notifications';
import { showAlert } from '../../lib/alert';

interface ProductSummary {
  productName: string;
  category: string | null;
  piecesPerCarton: number | null;
  latestCartonPrice: string | null;
  latestUnitCost: string;
  latestSellingPrice: string;
  totalAvailable: number;
  /** Minis: the consignment rate this product's stock is locked at. */
  usdToFcRateSnapshot?: string | null;
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const brand = useBrand();
  const t = useT();
  const user = useAuthStore((s) => s.user);
  // Show salary surfaces whenever the user has an active employment — the
  // salary is theirs regardless of which persona they're currently acting as.
  const { can, canAny, hasNoAccess, unrestricted } = usePermissions();
  const isEmployee = !!user?.activeEmployment;
  // Branch transfers: the owner once the business has a second branch, or the
  // custodian (person in charge) of this branch. Nobody else can act on them.
  const shopCount = useShopStore((s) => s.shops.length);
  const ownsBusiness = useShopStore((s) => !!s.organization?.isOwner);
  // Whose books the money card shows: the branch in view, or — acting for an
  // employer — their business.
  const branchName = useShopStore((s) => s.shops.find((x) => x.id === (s.selectedId ?? s.defaultShopId))?.name);
  const orgName = useShopStore((s) => s.organization?.name);
  const showBranchTransfers =
    (unrestricted && ownsBusiness && shopCount > 1) || (!unrestricted && can('custody.hold'));
  // A mini (SALES_ONLY) employee sees their own handover-oriented stats instead
  // of the owner dashboard cards. A FULL employee sees the owner cards plus a
  // self-scoped "my activity" card while acting on the employer's books.
  const isMini = user?.activeEmployment?.tier === 'SALES_ONLY';
  const isFullEmployee = user?.activeEmployment?.tier === 'FULL';
  const persona = usePersonaStore((s) => s.kind);
  const { theme, toggle } = useThemeStore();
  const formatCurrency = useFormatCurrency();
  const exchangeRate = useExchangeRate();
  const locale = useLocaleStore((s) => s.locale);
  const qc = useQueryClient();
  const [preparingOffline, setPreparingOffline] = useState(false);

  const {
    isOffline,
    pendingSales,
    pendingRejections,
    pendingExpenses,
    syncStatus,
    syncProgress,
    lastSyncedAt,
    snapshotTakenAt,
    enableOfflineMode,
    disableOfflineMode,
    clearSyncErrors,
  } = useOfflineStore();

  // ONE request for the whole owner/full-employee home screen. It is
  // owner/full-employee only — a mini would 403 — so minis skip it entirely and
  // render their own figures via MiniHomeStats instead. This was five
  // separate queries (summary, suppliers, alerts, cash-position, pending
  // salary) firing together on mount — on a 2G uplink they queued behind each
  // other and several timed out from queueing delay alone, not server slowness.
  const { data: homeData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: QK.dashboardHome,
    queryFn: dashboardApi.home,
    enabled: !isOffline && !isMini,
    staleTime: 30_000,
  });

  const home = homeData as DashboardHome | undefined;
  const data = home?.summary;
  const suppliers = home?.suppliers;
  const alertsData = home?.alerts;
  const cashData = home?.cashPosition;

  // Minis are not allowed on /dashboard/home (they 403), but they do have
  // payslips, so they still need this one on its own.
  const { data: miniPendingSalary } = useQuery({
    queryKey: QK.salaryPaymentsPending,
    queryFn: salaryPaymentsApi.pending,
    staleTime: 30_000,
    enabled: !isOffline && isMini,
    // No polling: useInboxSignal invalidates this key when the salary stamp
    // moves (employer recorded or cancelled a payslip).
  });

  // The server now sends the total directly — the screen only ever rendered
  // that, never the individual payslip rows.
  const pendingSalaryTotal = isMini
    ? ((miniPendingSalary as SalaryPayment[] | undefined) ?? []).reduce(
        (sum, p) => sum + parseFloat(p.amount),
        0,
      )
    : parseFloat(home?.pendingSalaryTotal ?? '0') || 0;
  const pendingSalaryCount = isMini
    ? ((miniPendingSalary as SalaryPayment[] | undefined) ?? []).length
    : home?.pendingSalaryCount ?? 0;

  const alerts = (alertsData as AlertItem[] | undefined) ?? [];
  const lowStockItems = alerts.filter((a) => a.type === 'low_stock');
  // Transfers to verify + payments to confirm at this branch.
  const branchWaiting = alerts
    .filter((a) => a.type === 'incoming_branch_transfer' || a.type === 'pending_branch_payment')
    .reduce((n, a) => n + (a.transferCount ?? 0), 0);

  // Pending sales + expenses stats for sync banner
  const pendingCount = pendingSales.length;
  const pendingExpenseCount = pendingExpenses.length;
  const pendingRejectionCount = pendingRejections.length;
  // A sale voided before it synced still has to reach the server (recorded,
  // then rejected), so it stays in the count — but it is no longer money the
  // merchant is holding, so it drops out of the total.
  const pendingTotalFc = pendingSales
    .filter((s) => !s.rejectedOffline)
    .reduce((sum, s) => {
      const rate = parseFloat(exchangeRate) || 1;
      return sum + parseFloat(s.salePrice) * s.qtySold * rate;
    }, 0);
  const isSyncing = syncStatus === 'syncing';
  const hasSyncErrors =
    pendingSales.some((s) => s.syncError) ||
    pendingRejections.some((r) => r.syncError) ||
    pendingExpenses.some((e) => e.syncError);
  const syncPct =
    syncProgress && syncProgress.total > 0
      ? Math.min(100, Math.round((syncProgress.completed / syncProgress.total) * 100))
      : 0;

  // The confirmation sheet replaces the bare system alerts: which way we are
  // going decides its tone, points and button.
  const [offlineSheet, setOfflineSheet] = useState<'goOffline' | 'goOnline' | null>(null);
  const handleToggleOffline = () => setOfflineSheet(isOffline ? 'goOnline' : 'goOffline');

  const confirmGoOffline = async () => {
    setOfflineSheet(null);
    setPreparingOffline(true);
    try {
      // Fetch the current rate + products in parallel so the offline
      // snapshot freezes both at the same moment. The rate is admin-
      // set on the API and doesn't change intraday, so locking it in
      // for the session keeps every FC display correct without
      // re-querying.
      // Minis also carry their expense ceiling into the session, so
      // offline expenses can be checked on the spot instead of piling
      // up to be rejected when the queue drains.
      const [products, rate, allowance] = await Promise.all([
        inventoryApi.listProducts() as Promise<ProductSummary[]>,
        currencyApi.getRate(),
        isMini
          ? miniSettlementsApi.expenseAllowance().catch(() => null)
          : Promise.resolve(null),
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
            usdToFcRateSnapshot: p.usdToFcRateSnapshot,
          })),
        rate.usdToFcRate,
        allowance
          ? { pct: allowance.pct, soldFc: allowance.soldFc, spentFc: allowance.spentFc }
          : null,
      );
    } catch {
      showAlert(t.common.error, t.home.preparingOffline);
    } finally {
      setPreparingOffline(false);
    }
  };

  const confirmGoOnline = () => {
    setOfflineSheet(null);
    disableOfflineMode();
  };

  const runSync = async () => {
    const result = await syncPendingSales();
    qc.invalidateQueries({ queryKey: QK.dashboardAll });
    qc.invalidateQueries({ queryKey: QK.inventory() });
    qc.invalidateQueries({ queryKey: QK.salesHistory() });
    // Minis: their home stats and expense ceiling both depend on synced sales
    // and expenses, so both are stale the moment the queue drains.
    qc.invalidateQueries({ queryKey: ['mini-settlements', 'stats'] });
    qc.invalidateQueries({ queryKey: QK.miniExpenseAllowance });

    if (result.failed === 0) {
      // Nothing to report when there was nothing to do (e.g. a no-op restart).
      if (result.synced > 0) showAlert('✅', t.home.syncDone(result.synced));
    } else {
      showAlert(
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

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t.home.greetMorning : hour < 18 ? t.home.greetAfternoon : t.home.greetEvening;

  const lastSyncedLabel = lastSyncedAt
    ? t.home.lastSynced(new Date(lastSyncedAt).toLocaleTimeString())
    : null;

  return (
    <View className="flex-1 bg-background">
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-5 pb-8"
      // Real status-bar height + a margin: a fixed pt-14 put the date line
      // under the paper strip on phones whose status bar is ~56dp tall.
      contentContainerStyle={{ paddingTop: insets.top + 16 }}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => {
            // Re-read the profile so a role the employer changed since app start
            // takes effect here — otherwise granted features would stay hidden
            // (and revoked ones visible) until the app was restarted.
            void authApi
              .me()
              .then((user) => useAuthStore.getState().setUser(user))
              .catch(() => {
                /* offline or transient — the cached profile still applies */
              });
            // For minis the dashboard query is disabled, so refetch() is a no-op;
            // invalidate their stats explicitly so pull-to-refresh still works.
            if (isMini) qc.invalidateQueries({ queryKey: ['mini-settlements'] });
            else void refetch();
          }}
          enabled={!isOffline}
        />
      }
    >
      {/* Header — greeting in the serif, date as a copper kicker */}
      <Animated.View entering={FadeInDown.duration(420)} className="flex-row items-start justify-between mb-6">
        <View className="flex-1 pr-3">
          <Text className="font-mono text-[10px] uppercase tracking-widest text-accent mb-1.5" numberOfLines={1}>
            {new Date().toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          <Text className="font-display text-[30px] leading-[34px] text-text">
            {greeting}
            {user?.name || user?.username ? ',' : ''}
          </Text>
          {user?.name || user?.username ? (
            <Text className="font-display-italic text-[30px] leading-[36px] text-primary" numberOfLines={1} adjustsFontSizeToFit>
              {user?.name ? user.name.split(' ')[0] : user?.username}
            </Text>
          ) : null}
          <View className="flex-row items-center gap-2 mt-3 flex-wrap">
            <Text className="font-mono text-xs text-muted">@{user?.username}</Text>
            {/* Always rendered for any active employment (PersonaSwitcher itself
                no-ops without one) — a mini (SALES_ONLY) employee needs this too,
                since PersonaBanner's "switch to self" link is a one-way door for
                them otherwise: nothing else can flip them back to Employer mode. */}
            <PersonaSwitcher />
            {/* Owners at a multi-branch business only — renders nothing otherwise. */}
            <ShopSwitcher />
          </View>
        </View>
        <View className="flex-row items-center gap-2 pt-4">
          <TouchableOpacity
            onPress={toggle}
            className="w-10 h-10 rounded-full bg-card border border-border items-center justify-center"
            accessibilityLabel={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
          </TouchableOpacity>
          {/* Both languages on show, the active one filled — tapping the other
              is self-evident, unlike a single "EN" button. */}
          <View className="h-10 flex-row items-center rounded-full bg-card border border-border p-1">
            {(['en', 'fr'] as const).map((l) => (
              <TouchableOpacity
                key={l}
                onPress={() => void useLocaleStore.getState().setLocale(l)}
                className={`h-8 px-2.5 rounded-full items-center justify-center ${locale === l ? 'bg-text' : ''}`}
                accessibilityLabel={l === 'en' ? 'English' : 'Français'}
                accessibilityState={{ selected: locale === l }}
              >
                <Text className={`font-mono-bold text-[11px] ${locale === l ? 'text-background' : 'text-muted'}`}>
                  {l.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            onPress={() => router.push('/account')}
            hitSlop={8}
            accessibilityLabel={t.account.menuTitle}
            className="w-10 h-10 rounded-full bg-primary items-center justify-center"
          >
            <Text className="text-white font-mono-bold text-sm">{(user?.username ?? '?').slice(0, 1).toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <PersonaBanner />

      <UpdateBanner />

      <PendingTierChangeCard />

      {/* Offline mode toggle */}
      <TouchableOpacity
        onPress={preparingOffline ? undefined : handleToggleOffline}
        className={`flex-row items-center justify-between rounded-3xl px-4 py-3 mb-4 border ${
          isOffline ? 'bg-warning-light border-warning/40' : 'bg-card border-border'
        }`}
        activeOpacity={0.8}
      >
        <View className="flex-row items-center gap-3 flex-1">
          <View className={`w-9 h-9 rounded-2xl items-center justify-center ${isOffline ? 'bg-warning/15' : 'bg-surface'}`}>
            {preparingOffline ? (
              <ActivityIndicator size="small" color={brand.warning} />
            ) : (
              <Icon name={isOffline ? 'wifi-off' : 'wifi'} size={17} tone={isOffline ? 'warning' : 'muted'} />
            )}
          </View>
          <View className="flex-1">
            <Text className={`font-semibold text-sm ${isOffline ? 'text-warning' : 'text-text'}`}>
              {preparingOffline ? t.home.preparingOffline : isOffline ? t.home.offlineModeActive : t.home.goOffline}
            </Text>
            {isOffline && snapshotLabel ? (
              <Text className="text-warning text-xs opacity-80">{snapshotLabel}</Text>
            ) : !isOffline && !preparingOffline ? (
              <Text className="text-muted text-xs">{t.home.goOfflineHint}</Text>
            ) : null}
          </View>
        </View>
        {!preparingOffline && (
          // A switch, drawn: the knob sits right when offline mode is on.
          <View className={`w-11 h-6 rounded-full p-0.5 ${isOffline ? 'bg-warning items-end' : 'bg-muted-subtle items-start'}`}>
            <View className="w-5 h-5 rounded-full bg-white" />
          </View>
        )}
      </TouchableOpacity>

      {/* Sync banner — shown whenever there are pending sales or expenses */}
      {(pendingCount > 0 || pendingExpenseCount > 0 || pendingRejectionCount > 0) && (
        <View className="bg-primary-light border border-primary/30 rounded-3xl px-4 py-3.5 mb-4">
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-1 pr-2">
              <Text className="text-primary font-bold text-sm">
                {pendingCount > 0 ? t.home.pendingSalesCount(pendingCount) : t.home.pendingSyncTitle}
              </Text>
              {pendingCount > 0 && (
                <Text className="text-primary/80 text-xs mt-0.5">
                  {formatMoney(pendingTotalFc, '1')} total
                </Text>
              )}
              {pendingExpenseCount > 0 && (
                <Text className="text-primary/80 text-xs mt-0.5">
                  {t.home.pendingExpensesCount(pendingExpenseCount)}
                </Text>
              )}
              {pendingRejectionCount > 0 && (
                <Text className="text-primary/80 text-xs mt-0.5">
                  {t.home.pendingRejectionsCount(pendingRejectionCount)}
                </Text>
              )}
              {isSyncing && syncProgress ? (
                <Text className="text-primary/80 text-xs mt-0.5 tabular-nums">
                  {t.home.syncProgress(syncProgress.completed, syncProgress.total, syncPct)}
                </Text>
              ) : (
                lastSyncedLabel && (
                  <Text className="text-primary/70 text-xs mt-0.5">{lastSyncedLabel}</Text>
                )
              )}
            </View>

            {/* Action area: spinner while syncing; Resume+Restart after a
                partial failure; a single Sync button otherwise. */}
            {isSyncing ? (
              <View className="px-4 py-2 rounded-full bg-primary/15">
                <ActivityIndicator size="small" color={brand.primary} />
              </View>
            ) : hasSyncErrors ? (
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={handleSync}
                  className="px-3 py-2 rounded-full bg-primary"
                  activeOpacity={0.8}
                >
                  <Text className="text-white font-semibold text-sm">{t.home.syncResume}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleRestart}
                  className="px-3 py-2 rounded-full border border-primary/40"
                  activeOpacity={0.8}
                >
                  <Text className="text-primary font-semibold text-sm">
                    {t.home.syncRestart}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleSync}
                className="px-4 py-2 rounded-full bg-primary"
                activeOpacity={0.8}
              >
                <Text className="text-white font-semibold text-sm">{t.home.syncNow}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Progress bar — real width from completed/total */}
          {(isSyncing || (syncProgress && syncProgress.completed < syncProgress.total)) && (
            <View className="h-1.5 bg-primary/15 rounded-full overflow-hidden mt-1">
              <View
                className="h-full bg-primary rounded-full"
                style={{ width: `${syncPct}%` }}
              />
            </View>
          )}

          {/* Failed sales + expenses list + retry hint */}
          {hasSyncErrors && (
            <View className="mt-2 border-t border-primary/20 pt-2 gap-1">
              {pendingSales
                .filter((s) => s.syncError)
                .map((s) => (
                  <Text key={s.id} className="text-danger text-xs">
                    ⚠ {s.productName} ×{s.qtySold} — {s.syncError}
                  </Text>
                ))}
              {pendingRejections
                .filter((r) => r.syncError)
                .map((r) => (
                  <Text key={r.id} className="text-danger text-xs">
                    ⚠ {r.productName} ×{r.qtySold} — {r.syncError}
                  </Text>
                ))}
              {pendingExpenses
                .filter((e) => e.syncError)
                .map((e) => (
                  <Text key={e.id} className="text-danger text-xs">
                    ⚠ {e.amount} — {e.syncError}
                  </Text>
                ))}
              <Text className="text-primary/70 text-[11px] mt-1">
                {t.home.syncRetryHint}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Pending salary confirmations — shown to anyone with an active employment */}
      {!isOffline && isEmployee && pendingSalaryCount > 0 && (
        <Pressable
          onPress={() => router.push('/salary')}
          className="bg-warning-light border border-warning/30 rounded-3xl px-4 py-3.5 mb-4 flex-row items-center gap-3"
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}
        >
          <View className="w-9 h-9 rounded-2xl bg-warning/15 items-center justify-center">
            <Icon name="credit-card" size={17} tone="warning" />
          </View>
          <View className="flex-1">
            <Text className="text-warning font-semibold text-sm">
              {pendingSalaryCount === 1
                ? '1 salary payment to confirm'
                : `${pendingSalaryCount} salary payments to confirm`}
            </Text>
            <Text className="text-warning text-xs mt-0.5 opacity-80">
              {formatCurrency(pendingSalaryTotal.toFixed(4))} total · tap to review
            </Text>
          </View>
          <Icon name="chevron-right" size={18} tone="warning" />
        </Pressable>
      )}

      {/* Alerts banner — only in online mode */}
      {!isOffline && lowStockItems.length > 0 && (
        <View className="mb-4 gap-2">
          {lowStockItems.length > 0 && (
            <Pressable
              onPress={() => router.push('/(tabs)/inventory')}
              className="bg-warning-light border border-warning/30 rounded-3xl px-4 py-3.5 flex-row items-center gap-3"
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}
            >
              <View className="w-9 h-9 rounded-2xl bg-warning/15 items-center justify-center">
                <Icon name="alert-triangle" size={17} tone="warning" />
              </View>
              <View className="flex-1">
                <Text className="text-warning font-semibold text-sm">
                  {t.home.lowStockItems(lowStockItems.length)}
                </Text>
                <Text className="text-warning text-xs mt-0.5 opacity-80">
                  {lowStockItems.slice(0, 2).map((a) => a.productName).join(', ')}
                  {lowStockItems.length > 2 && ` +${lowStockItems.length - 2} more`}
                  {` ${t.home.lowStockSuffix}`}
                </Text>
              </View>
              <Icon name="chevron-right" size={18} tone="warning" />
            </Pressable>
          )}
        </View>
      )}

      {/* Offline mode — simplified view */}
      {isOffline ? (
        <View className="bg-warning-light border border-warning/30 rounded-3xl px-5 py-7 items-center">
          <View className="w-14 h-14 rounded-full bg-warning/15 items-center justify-center mb-3">
            <Icon name="wifi-off" size={24} tone="warning" />
          </View>
          <Text className="font-display text-xl text-warning text-center">{t.home.offlineModeActive}</Text>
          <Text className="text-warning text-sm text-center mt-1 opacity-90">
            {useOfflineStore.getState().cachedProducts.length} products available
          </Text>
          <Text className="text-warning text-xs text-center mt-1 opacity-70">
            Go to the Sales tab to record sales offline
          </Text>

          <View className="self-stretch mt-5">
            <NavRow
              icon="file-text"
              title={t.expenses.title}
              subtitle={t.home.recordExpenseOffline}
              onPress={() => router.push('/expenses')}
              tone="warning"
              className="mb-0"
            />
          </View>
        </View>
      ) : (
        <>
          {/* Employer has opened nothing: every tab but this one is hidden and
              the cards below render empty, so say why. */}
          {hasNoAccess && <NoAccessNotice />}

          {isMini ? (
            /* Mini employee: handover-oriented stats (cash to hand over, I owe,
               profit) scoped to their current cycle, with a date filter. */
            <MiniHomeStats />
          ) : (
          <>
          {/* The business money picture — one grant covers the lot. An employee
              without it still sees their own scoped activity below. */}
          {can('cash.overview') && (
          <>
          {/* The money hero — a deep malachite slip with a copper glow (the
              site's closing band). Cash in the till leads; net position sits
              under the rule. */}
          <Animated.View
            entering={FadeInDown.delay(80).duration(480)}
            className="rounded-[28px] px-5 pt-5 pb-4 mb-4 overflow-hidden"
            style={{
              backgroundColor: '#0B3A2F',
              experimental_backgroundImage:
                'radial-gradient(120% 90% at 100% 0%, rgba(240,154,96,0.35) 0%, rgba(240,154,96,0) 60%), radial-gradient(90% 80% at 0% 100%, rgba(95,217,174,0.18) 0%, rgba(95,217,174,0) 65%)',
              boxShadow: '0px 18px 34px -18px rgba(11, 58, 47, 0.8)',
            }}
          >
            <View className="flex-row items-center justify-between mb-3">
              <Text className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'rgba(239,232,216,0.6)' }}>
                {t.home.availableBusinessCash}
              </Text>
              <View className="flex-row items-center gap-1.5 rounded-full px-2 py-0.5" style={{ backgroundColor: 'rgba(239,232,216,0.1)' }}>
                <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#6FE0B6' }} />
                <Text className="font-mono text-[10px]" style={{ color: 'rgba(239,232,216,0.75)' }} numberOfLines={1}>
                  {user?.activeEmployment
                    ? persona === 'employer'
                      ? (orgName ?? t.home.moneyKicker)
                      : t.persona.selfSub
                    : (branchName ?? orgName ?? t.home.moneyKicker)}
                </Text>
              </View>
            </View>
            <Text
              className="font-display text-[40px] leading-[46px]"
              style={{ color: cashData && parseFloat(cashData.availableBusinessCash) < 0 ? '#F2A27A' : '#EFE8D8' }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {cashData ? formatCurrency(cashData.availableBusinessCash) : '—'}
            </Text>
            <Text className="text-xs mt-1" style={{ color: 'rgba(239,232,216,0.6)' }}>
              {cashData && parseFloat(cashData.availableBusinessCash) < 0
                ? t.home.availableBusinessCashOver
                : t.home.availableBusinessCashSub}
            </Text>
            <View className="my-4" style={{ borderTopWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(239,232,216,0.18)' }} />
            <View className="flex-row items-end justify-between">
              <View className="flex-1 pr-2">
                <Text className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'rgba(239,232,216,0.6)' }}>
                  {t.home.netPosition}
                </Text>
                <Text className="text-[11px] mt-0.5" style={{ color: 'rgba(239,232,216,0.45)' }} numberOfLines={1}>
                  {t.home.netPositionSub}
                </Text>
              </View>
              <Text
                className="font-mono-bold text-lg"
                style={{ color: parseFloat(data?.netPosition ?? '0') >= 0 ? '#6FE0B6' : '#F2A27A' }}
              >
                {isLoading ? '—' : formatCurrency(data?.netPosition ?? '0')}
              </Text>
            </View>
          </Animated.View>

          <Text className="font-mono text-[10px] uppercase tracking-widest text-muted mb-2 ml-1">{t.home.sectionMoney}</Text>
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
          </>
          )}

          {/* Full employee acting on the employer's books: their own scoped
              activity, on top of the shared owner cards above. */}
          {/* Queries dashboard/profit-summary, which needs cash.overview — without
              the check a restricted employee just fires a 403. */}
          {isFullEmployee && persona === 'employer' && can('cash.overview') && (
            <EmployeeActivityStats />
          )}
          </>
          )}

          {/* The custodian's own stock. Gated on the service, not the persona:
              `custody.hold` is grantable to a full employee, and an owner never
              holds it — they are not anybody's custodian. */}
          {can('custody.hold') && (
            <NavRow icon="shield" title={t.custody.homeTile} subtitle={t.custody.homeHint} onPress={() => router.push('/custody')} />
          )}

          {showBranchTransfers && (
            <NavRow
              icon="truck"
              tone="accent"
              title={t.branchTransfers.homeTile}
              subtitle={t.branchTransfers.homeHint}
              badge={branchWaiting}
              onPress={() => router.push('/branch-transfers')}
            />
          )}

          {/* Mini-employee actions (Receive products, Hand over) — placed
              below the statistics and directly above the Expenses tile. */}
          <MiniEmployeeHome />

          {/* Expenses entry tile */}
          {canAny('expenses.view', 'expenses.record') && (
            <NavRow icon="file-text" title={t.expenses.title} subtitle={t.expenses.subtitle} onPress={() => router.push('/expenses')} />
          )}

          {/* Salary entry tile — shown to anyone with an active employment */}
          {isEmployee && (
            <NavRow
              icon="credit-card"
              tone="accent"
              title={t.salary.title}
              subtitle={t.salary.homeSubtitle}
              onPress={() => router.push('/salary')}
              className="mb-5"
            />
          )}

          {/* Top Suppliers — owner/full-employee only; a mini's only "supplier"
              is their employer, already surfaced as "I owe". */}
          {!isMini && can('suppliers.view') && (suppliers?.length ?? 0) > 0 && (
            <View className="mb-5">
              <Text className="font-display text-xl text-text mb-3 mt-2">{t.home.topSuppliers}</Text>
              {(suppliers as Array<{ supplierUserId: string; supplierUsername: string; outstandingBalance: string }>)
                .slice(0, 3)
                .map((s) => (
                  <Pressable
                    key={s.supplierUserId}
                    onPress={() => router.push(`/supplier/${s.supplierUserId}`)}
                    className="flex-row items-center bg-card border border-border rounded-3xl px-4 py-3 mb-2"
                    style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}
                  >
                    <View className="w-10 h-10 rounded-full bg-accent-light items-center justify-center mr-3">
                      <Text className="font-display text-base text-accent">{s.supplierUsername.slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-text font-semibold text-[15px]">@{s.supplierUsername}</Text>
                      <Text className="text-muted text-xs">{t.home.youOwe}</Text>
                    </View>
                    <Text className="font-mono-bold text-danger text-[15px]">{formatCurrency(s.outstandingBalance)}</Text>
                  </Pressable>
                ))}
              <TouchableOpacity onPress={() => router.push('/(tabs)/network')}>
                <Text className="text-primary text-sm font-semibold text-center mt-2">{t.home.viewAllSuppliers}</Text>
              </TouchableOpacity>
            </View>
          )}

        </>
      )}

      {/* App version footer — keep last so the value is easy for users to read out during bug reports. */}
      <View className="items-center mt-8 mb-4">
        <Text className="font-mono text-muted text-[10px] tracking-widest">
          KMB-TALK · v{Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '—'}
          {Constants.nativeBuildVersion ? ` (${Constants.nativeBuildVersion})` : ''}
        </Text>
      </View>
    </ScrollView>
    <Sheet
      visible={offlineSheet !== null}
      onClose={() => setOfflineSheet(null)}
      icon={offlineSheet === 'goOnline' ? 'wifi' : 'wifi-off'}
      tone={offlineSheet === 'goOnline' ? 'primary' : 'warning'}
      title={offlineSheet === 'goOnline' ? t.home.onlineConfirmTitle : t.home.offlineConfirmTitle}
      actions={
        <>
          <Button
            label={offlineSheet === 'goOnline' ? t.home.onlineConfirmBtn : t.home.offlineConfirmBtn}
            icon={offlineSheet === 'goOnline' ? 'wifi' : 'wifi-off'}
            variant={offlineSheet === 'goOnline' ? 'primary' : 'ink'}
            onPress={() => (offlineSheet === 'goOnline' ? confirmGoOnline() : void confirmGoOffline())}
          />
          <Button label={t.common.cancel} variant="ghost" onPress={() => setOfflineSheet(null)} />
        </>
      }
    >
      {offlineSheet === 'goOnline' ? (
        <>
          <SheetPoint icon="refresh-cw" text={t.home.onlinePoint1} />
          <SheetPoint icon="inbox" text={t.home.onlinePoint2} />
          {pendingCount + pendingExpenseCount + pendingRejectionCount > 0 ? (
            <View className="bg-warning-light rounded-2xl px-4 py-3 flex-row items-center gap-2.5 mt-1">
              <Icon name="alert-circle" size={16} tone="warning" />
              <Text className="text-warning text-[13px] flex-1">
                {t.home.onlinePendingNote(pendingCount + pendingExpenseCount + pendingRejectionCount)}
              </Text>
            </View>
          ) : null}
        </>
      ) : (
        <>
          <SheetPoint icon="download" tone="warning" text={t.home.offlinePoint1} />
          <SheetPoint icon="shopping-bag" tone="warning" text={t.home.offlinePoint2} />
          <SheetPoint icon="refresh-cw" tone="warning" text={t.home.offlinePoint3} />
        </>
      )}
    </Sheet>
    {/* Paper strip behind the status bar, so scrolled content slides under it
        instead of colliding with the clock. */}
    <View className="absolute top-0 left-0 right-0 bg-background" style={{ height: insets.top }} pointerEvents="none" />
    </View>
  );
}
