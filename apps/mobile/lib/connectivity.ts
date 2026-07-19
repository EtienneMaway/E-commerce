import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import { onlineManager, focusManager } from '@tanstack/react-query';
import { useOfflineStore } from '../store/offline.store';
import { syncPendingSales } from './sync';

/**
 * Connectivity wiring. Before this existed the app had NO network awareness at
 * all: losing signal did nothing (queries kept firing and timing out one by
 * one), regaining it did nothing (the pending-sales queue only drained when the
 * merchant remembered to press "Sync" on the home tab), and React Query's
 * `onlineManager` was never bridged — so `networkMode` and `refetchOnReconnect`
 * were inert on React Native.
 *
 * Call `initConnectivity()` once at app start. Returns a teardown function.
 */

/** Guards against two syncs overlapping (e.g. reconnect + foreground together). */
let syncInFlight = false;

/**
 * Drain the offline queue, at most one run at a time. Safe to call on every
 * reconnect: `syncPendingSales` no-ops when the queue is empty, and every row
 * carries a stable clientSaleId so a replay can never double-record.
 */
export async function drainQueueIfNeeded(reason: string): Promise<void> {
  if (syncInFlight) return;
  const { pendingSales, pendingExpenses, isOffline } = useOfflineStore.getState();
  // Manual offline mode is an explicit user choice — never sync behind their
  // back while they have it switched on.
  if (isOffline) return;
  if (pendingSales.length === 0 && pendingExpenses.length === 0) return;

  syncInFlight = true;
  try {
    await syncPendingSales();
  } catch {
    // syncPendingSales already records per-row errors into the store, which the
    // home-tab banner surfaces. Nothing useful to do here.
  } finally {
    syncInFlight = false;
  }
  void reason; // kept for future telemetry
}

/** True when the device has a usable connection. */
function isOnline(state: NetInfoState): boolean {
  // `isInternetReachable` is null while NetInfo is still probing. Treat null as
  // online: assuming offline on an unknown state would pause queries at every
  // cold start before the first probe completes.
  return Boolean(state.isConnected) && state.isInternetReachable !== false;
}

export function initConnectivity(): () => void {
  // 1. Tell React Query whether we are online, so it pauses rather than firing
  //    requests into a dead link and waiting out the full timeout on each.
  const unsubscribeNet = NetInfo.addEventListener((state) => {
    const online = isOnline(state);
    onlineManager.setOnline(online);
    // Coming back from a real outage is the moment queued sales should go out.
    if (online) void drainQueueIfNeeded('reconnect');
  });

  // 2. React Native has no window focus; bridge AppState instead so React Query
  //    knows when the app is actually in front of the user.
  const onAppStateChange = (status: AppStateStatus): void => {
    focusManager.setFocused(status === 'active');
    if (status === 'active') void drainQueueIfNeeded('foreground');
  };
  const appStateSub = AppState.addEventListener('change', onAppStateChange);

  // 3. Seed the initial state — listeners only fire on change, so without this
  //    the app starts on React Query's web-shim assumption of "always online".
  void NetInfo.fetch().then((state) => {
    onlineManager.setOnline(isOnline(state));
    if (isOnline(state)) void drainQueueIfNeeded('startup');
  });

  return () => {
    unsubscribeNet();
    appStateSub.remove();
  };
}
