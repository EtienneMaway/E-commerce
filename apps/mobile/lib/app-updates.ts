import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';

/**
 * Two different kinds of update reach this app, and they are not
 * interchangeable:
 *
 *  - **OTA** (`expo-updates`): a JavaScript-only release, downloaded silently
 *    and applied on the next launch. Fast, free, invisible — and easy for a
 *    merchant to never receive, because they leave the app resident for weeks
 *    and it never cold-starts.
 *  - **Store**: a new `.aab` on Play. Needed for a native change or a version
 *    bump, and nothing this app does can install it — the user must tap
 *    "Update" in the Play listing.
 *
 * This module supplies the facts for both; `hooks/use-app-update.ts` decides
 * what to show.
 */

/** Permanent Play package id — see PLAY_STORE_RELEASE.md. */
export const ANDROID_PACKAGE = 'com.kmb.mobile';

/**
 * The version this install is running.
 *
 * `expoConfig.version` is the value from the loaded bundle's app.json rather
 * than the value baked into the APK, which would normally make it the wrong
 * thing to compare against the store. Here it is exact: `runtimeVersion.policy`
 * is `appVersion`, so an OTA update can only ever be delivered to a build whose
 * native version already matches the bundle's. Reading it this way avoids
 * pulling in `expo-application`, which is a native module — and a native module
 * added for this feature could not itself be delivered over the air to the
 * installs that need telling.
 */
export const INSTALLED_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';

/**
 * The build number this install was published as — Android `versionCode`, iOS
 * `buildNumber` — or null when it is not in the embedded config.
 *
 * This is the signal that actually moves. `expo.version` is a manual edit in
 * app.json and has read "1.0.0" for every build so far, while EAS increments
 * the versionCode on each build (`autoIncrement`, with the counter held
 * remotely under `appVersionSource: "remote"`). Comparing names alone made
 * versionCode 3, 4 and 5 indistinguishable.
 *
 * Null is a real possibility: with the remote version source the number is
 * injected by EAS at build time, so whether it reaches the embedded config is
 * not guaranteed. Everything downstream treats null as "unknown" and falls back
 * to the version name, so the worst case is the behaviour we had before, never
 * a wrong answer.
 */
export const INSTALLED_BUILD: number | null = (() => {
  const raw =
    Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber
      : Constants.expoConfig?.android?.versionCode;
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
})();

/** Remembers a version the user has waved away, so the banner asks once. */
const DISMISSED_KEY = 'update_dismissed_version';

export async function getDismissedVersion(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

export async function setDismissedVersion(version: string): Promise<void> {
  try {
    await AsyncStorage.setItem(DISMISSED_KEY, version);
  } catch {
    // A failed dismissal just means the banner returns next launch. Never worth
    // an error in front of the merchant.
  }
}

/**
 * Opens the store listing at the update button.
 *
 * `market://` hands straight to the Play app, which is where the Update button
 * lives; the https listing is the fallback for a device without Play (or for
 * the emulator), and for iOS once there is an App Store URL to fall back to.
 */
export async function openStore(storeUrl: string | null): Promise<void> {
  const web = storeUrl ?? `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

  if (Platform.OS === 'android') {
    try {
      await Linking.openURL(`market://details?id=${ANDROID_PACKAGE}`);
      return;
    } catch {
      // No Play app installed — fall through to the browser.
    }
  }

  try {
    await Linking.openURL(web);
  } catch {
    // Nothing sensible left to do; the banner stays up so they can retry.
  }
}

/** True when OTA updates are actually operating (not in Expo Go / dev client). */
export const OTA_ENABLED: boolean = Updates.isEnabled && !__DEV__;

/**
 * Asks the update server whether a newer bundle exists and downloads it.
 *
 * expo-updates already does this once per cold start. This is the same check on
 * demand, for the app that has been foregrounded for days without restarting.
 * Resolves true when a bundle is downloaded and waiting for a reload.
 */
let otaCheckInFlight: Promise<boolean> | null = null;

export async function fetchOtaUpdate(): Promise<boolean> {
  // The banner and the required-update gate both ask on every foreground.
  // Sharing one in-flight check keeps that a single network round-trip.
  if (otaCheckInFlight) return otaCheckInFlight;
  otaCheckInFlight = runOtaCheck().finally(() => {
    otaCheckInFlight = null;
  });
  return otaCheckInFlight;
}

async function runOtaCheck(): Promise<boolean> {
  if (!OTA_ENABLED) return false;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return false;
    const fetched = await Updates.fetchUpdateAsync();
    return fetched.isNew;
  } catch {
    // Offline, or the update server is unreachable. Silent by design: an update
    // check is never worth interrupting the merchant's work.
    return false;
  }
}

/** Applies a downloaded OTA bundle by restarting into it. */
export async function applyOtaUpdate(): Promise<void> {
  await Updates.reloadAsync();
}
