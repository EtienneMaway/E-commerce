import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useUpdates } from 'expo-updates';
import { appVersionApi, type AppVersionInfo } from '../lib/api';
import { QK } from '../lib/query-keys';
import { useLocaleStore } from '../store/locale.store';
import {
  INSTALLED_BUILD,
  INSTALLED_VERSION,
  applyOtaUpdate,
  fetchOtaUpdate,
  getDismissedVersion,
  openStore,
  setDismissedVersion,
} from '../lib/app-updates';

/** How often to re-ask the server what the store holds. */
const CHECK_STALE_MS = 6 * 60 * 60_000; // 6h

export type UpdateKind = 'none' | 'store' | 'ota';

export interface AppUpdate {
  /** Which update, if any, the user should be told about right now. */
  kind: UpdateKind;
  /** Installed version is below the minimum the API still supports. */
  required: boolean;
  installedVersion: string;
  /** Android versionCode of this install, when the embedded config carries one. */
  installedBuild: number | null;
  /** Newest store version, when known. */
  latestVersion: string | null;
  /**
   * True when the update carries the same version name as the installed build —
   * i.e. it was caught by the build number. The copy must not then announce
   * "version 1.0.0 is available" to someone already running 1.0.0.
   */
  sameVersionName: boolean;
  /** Release notes in the user's language, when the server supplies any. */
  notes: string | null;
  /** Send the user to the Play listing (store updates). */
  goToStore: () => void;
  /** Restart into the downloaded bundle (OTA updates). */
  restart: () => void;
  /** Hide an optional update until the next version. Never applies to `required`. */
  dismiss: () => void;
  /** Ask again now — both routes. Backs the manual button on the account screen. */
  check: () => Promise<void>;
  checking: boolean;
  busy: boolean;
}

/**
 * One answer to "is this install out of date?", covering both routes.
 *
 * Precedence is deliberate:
 *   1. A **required** store update outranks everything — the API has declared
 *      this build too old, so nothing else on screen matters.
 *   2. A **pending OTA** comes next: the bundle is already on the device and a
 *      restart is one tap, so there is no reason to send someone to Play for a
 *      fix they have already downloaded.
 *   3. An optional **store** update last, and dismissible.
 *
 * Everything degrades to `kind: 'none'` when offline or when the check fails —
 * a merchant on a dead 2G link must never be nagged about an update they cannot
 * download.
 */
export function useAppUpdate(): AppUpdate {
  const locale = useLocaleStore((s) => s.locale);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [otaReady, setOtaReady] = useState(false);
  const [busy, setBusy] = useState(false);

  // expo-updates' own view: a bundle downloaded at launch is already pending
  // before this hook ever runs a check of its own.
  const { isUpdatePending } = useUpdates();

  useEffect(() => {
    void getDismissedVersion().then(setDismissed);
  }, []);

  const { data, refetch, isFetching } = useQuery<AppVersionInfo>({
    queryKey: QK.appVersion(INSTALLED_VERSION, INSTALLED_BUILD),
    queryFn: () =>
      appVersionApi.check(
        Platform.OS === 'ios' ? 'ios' : 'android',
        INSTALLED_VERSION,
        INSTALLED_BUILD,
      ),
    staleTime: CHECK_STALE_MS,
    gcTime: 7 * 24 * 60 * 60_000,
    // The endpoint is public, so this works on the login screen too — an install
    // below the minimum supported version should learn that before it tries to
    // sign in and fails for reasons it cannot explain.
    retry: 1,
  });

  // Look for a JS bundle whenever the app comes back to the foreground. Without
  // this, a session left resident for days only ever sees the check that ran at
  // its cold start.
  useEffect(() => {
    let cancelled = false;
    const check = (): void => {
      void fetchOtaUpdate().then((ready) => {
        if (!cancelled && ready) setOtaReady(true);
      });
    };

    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const latestVersion = data?.latestVersion ?? null;
  const required = data?.updateRequired ?? false;
  const storeAvailable = (data?.updateAvailable ?? false) && !required;
  const otaPending = isUpdatePending || otaReady;

  const kind: UpdateKind = required
    ? 'store'
    : otaPending
      ? 'ota'
      : storeAvailable && latestVersion !== dismissed
        ? 'store'
        : 'none';

  const [checkingOta, setCheckingOta] = useState(false);

  const check = useCallback(async () => {
    setCheckingOta(true);
    try {
      const [, ready] = await Promise.all([refetch(), fetchOtaUpdate()]);
      if (ready) setOtaReady(true);
    } finally {
      setCheckingOta(false);
    }
  }, [refetch]);

  const goToStore = useCallback(() => {
    void openStore(data?.storeUrl ?? null);
  }, [data?.storeUrl]);

  const restart = useCallback(() => {
    setBusy(true);
    void applyOtaUpdate().catch(() => setBusy(false));
  }, []);

  const dismiss = useCallback(() => {
    if (!latestVersion) return;
    setDismissed(latestVersion);
    void setDismissedVersion(latestVersion);
  }, [latestVersion]);

  return {
    kind,
    required,
    installedVersion: INSTALLED_VERSION,
    installedBuild: INSTALLED_BUILD,
    latestVersion,
    sameVersionName: !!latestVersion && latestVersion === INSTALLED_VERSION,
    notes: data?.releaseNotes ? data.releaseNotes[locale] : null,
    goToStore,
    restart,
    dismiss,
    check,
    checking: isFetching || checkingOta,
    busy,
  };
}
