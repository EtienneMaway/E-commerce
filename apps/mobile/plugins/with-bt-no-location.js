const { withAndroidManifest } = require('expo/config-plugins');

/**
 * `react-native-bluetooth-classic` declares ACCESS_FINE_LOCATION in its own
 * library manifest, so the merger pulls it into our APK whether or not we use
 * it — and we do not. Location is required for Bluetooth *discovery* (actively
 * scanning for nearby radios, which on Android <= 11 can infer position).
 * `lib/bluetooth-printer.ts` only ever calls `getBondedDevices()`; pairing
 * happens in the OS Bluetooth settings, and reading the already-paired list
 * needs no location on any API level.
 *
 * Leaving it in would cost a runtime location prompt on every POS terminal,
 * put "location" on the Play listing's permission list for a trading app, and
 * muddy the Data safety declaration — all for a permission we never exercise.
 *
 * `tools:node="remove"` is what actually blocks the merge; simply omitting the
 * permission from our manifest would not, since the library still declares it.
 *
 * If in-app device *discovery* is ever added, this plugin must go — or move to
 * CompanionDeviceManager, which scans via a system dialog and needs no location
 * permission at all. See PLAY_STORE_RELEASE.md.
 */
const REMOVED = 'android.permission.ACCESS_FINE_LOCATION';

module.exports = function withBtNoLocation(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // `tools:node` is meaningless without the tools namespace declared.
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    const existing = manifest['uses-permission'] ?? [];
    manifest['uses-permission'] = [
      ...existing.filter((p) => p.$['android:name'] !== REMOVED),
      { $: { 'android:name': REMOVED, 'tools:node': 'remove' } },
    ];

    return cfg;
  });
};
