import { Injectable } from '@nestjs/common';
import { compareVersions } from '../common/version';

export type MobilePlatform = 'android' | 'ios';

export interface AppVersionInfo {
  readonly platform: MobilePlatform;
  /** Newest version name published to the store. */
  readonly latestVersion: string;
  /** Oldest version name still allowed to talk to this API. */
  readonly minSupportedVersion: string;
  /**
   * Newest Android versionCode / iOS build number on the store, when known.
   *
   * The second signal, and the one that cannot be forgotten: EAS increments the
   * build number on every build (`autoIncrement`), while the version *name* is
   * a manual edit in app.json. Version 1.0.0 shipped as versionCode 3, 4 and 5
   * before this existed, and a name-only comparison saw all three as identical.
   */
  readonly latestBuild: number | null;
  /** Deep link to the store listing, or null where the app is not published. */
  readonly storeUrl: string | null;
  readonly releaseNotes: { readonly en: string; readonly fr: string } | null;
  /** installed < latest. False when the client sends no version. */
  readonly updateAvailable: boolean;
  /** installed < minSupported — the client must update before it can be used. */
  readonly updateRequired: boolean;
}

/** Play listing for the Android build. The package id is permanent. */
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.kmb.mobile';

/**
 * What the store currently holds, per platform.
 *
 * Deliberately env-driven with a code fallback: a release only needs the two
 * version strings bumped on the server, not a redeploy of anything else. Keep
 * the fallbacks in step with `apps/mobile/app.json` so a server that was never
 * configured still answers truthfully rather than telling every user they are
 * out of date.
 */
/** Reads an optional positive integer from the environment. */
function envInt(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function config(platform: MobilePlatform): {
  latestVersion: string;
  minSupportedVersion: string;
  latestBuild: number | null;
  minSupportedBuild: number | null;
  storeUrl: string | null;
} {
  if (platform === 'ios') {
    return {
      latestVersion: process.env.MOBILE_IOS_LATEST_VERSION ?? '1.0.0',
      minSupportedVersion: process.env.MOBILE_IOS_MIN_VERSION ?? '1.0.0',
      latestBuild: envInt('MOBILE_IOS_LATEST_BUILD'),
      minSupportedBuild: envInt('MOBILE_IOS_MIN_BUILD'),
      // Not published on the App Store yet — null means "no update button".
      storeUrl: process.env.MOBILE_IOS_STORE_URL ?? null,
    };
  }
  return {
    latestVersion: process.env.MOBILE_ANDROID_LATEST_VERSION ?? '1.0.0',
    minSupportedVersion: process.env.MOBILE_ANDROID_MIN_VERSION ?? '1.0.0',
    // `eas build:version:get --platform android` prints the current value.
    latestBuild: envInt('MOBILE_ANDROID_LATEST_BUILD'),
    minSupportedBuild: envInt('MOBILE_ANDROID_MIN_BUILD'),
    storeUrl: process.env.MOBILE_ANDROID_STORE_URL ?? PLAY_STORE_URL,
  };
}

function releaseNotes(): { en: string; fr: string } | null {
  const en = process.env.MOBILE_RELEASE_NOTES_EN?.trim();
  const fr = process.env.MOBILE_RELEASE_NOTES_FR?.trim();
  if (!en && !fr) return null;
  return { en: en ?? fr ?? '', fr: fr ?? en ?? '' };
}

@Injectable()
export class AppVersionService {
  /**
   * Answers "should this install update?".
   *
   * The comparison lives here rather than on the device so the rule can change
   * without shipping a new build — which is precisely the situation an outdated
   * install is in.
   *
   * Two independent signals, either of which is enough:
   *   - the **version name** ("1.0.0"), a manual edit in app.json; and
   *   - the **build number** (Android versionCode), which EAS increments on
   *     every build whether or not anyone remembered to touch the name.
   *
   * Both are optional on the way in. A client that cannot report one — an older
   * build, or a platform where the value is not embedded — is simply judged on
   * the other, and a client that reports neither is told nothing. Silence is the
   * safe answer: a merchant must never be blocked or nagged because a value was
   * missing.
   */
  check(
    platform: MobilePlatform,
    installedVersion?: string,
    installedBuild?: number,
  ): AppVersionInfo {
    const { latestVersion, minSupportedVersion, latestBuild, minSupportedBuild, storeUrl } =
      config(platform);
    const installed = installedVersion?.trim();
    const build = typeof installedBuild === 'number' ? installedBuild : null;

    const behindByVersion = !!installed && compareVersions(installed, latestVersion) < 0;
    const behindByBuild = build !== null && latestBuild !== null && build < latestBuild;

    const belowMinVersion = !!installed && compareVersions(installed, minSupportedVersion) < 0;
    const belowMinBuild = build !== null && minSupportedBuild !== null && build < minSupportedBuild;

    return {
      platform,
      latestVersion,
      minSupportedVersion,
      latestBuild,
      storeUrl,
      releaseNotes: releaseNotes(),
      updateAvailable: behindByVersion || behindByBuild,
      updateRequired: belowMinVersion || belowMinBuild,
    };
  }
}
