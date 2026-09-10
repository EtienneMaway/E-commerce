import { useState } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { useT } from '../../lib/i18n';
import { useAppUpdate } from '../../hooks/use-app-update';
import { Button } from './Button';
import { KmbLogo } from './KmbLogo';

/**
 * The two faces of "your app is out of date".
 *
 * `UpdateBanner` sits on the home tab and is easy to ignore — an optional store
 * release, or a downloaded JS bundle waiting for a restart.
 *
 * `UpdateRequiredGate` is mounted at the app root and is not ignorable, because
 * by then the API has declared this build unsupported and the screens behind it
 * would only fail in confusing ways.
 */

export function UpdateBanner() {
  const t = useT();
  const { kind, required, latestVersion, sameVersionName, notes, goToStore, restart, dismiss, busy } =
    useAppUpdate();

  // `required` is the gate's business, not the banner's.
  if (required || kind === 'none') return null;

  const isOta = kind === 'ota';

  return (
    <View className="bg-primary/10 border border-primary/30 rounded-2xl px-4 py-3 mb-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-primary font-bold text-sm">
            {isOta ? `⬇️ ${t.update.readyTitle}` : `⬆️ ${t.update.availableTitle}`}
          </Text>
          <Text className="text-text-secondary text-xs mt-0.5">
            {isOta
              ? t.update.readyBody
              : latestVersion && !sameVersionName
                ? t.update.availableBody(latestVersion)
                : t.update.availableBodyGeneric}
          </Text>
          {!isOta && notes && (
            <Text className="text-text-secondary text-xs mt-1.5" numberOfLines={4}>
              {notes}
            </Text>
          )}
        </View>

        <View className="items-end gap-2">
          <TouchableOpacity
            onPress={isOta ? restart : goToStore}
            disabled={busy}
            className={`px-4 py-2 rounded-xl bg-primary ${busy ? 'opacity-60' : ''}`}
            activeOpacity={0.8}
          >
            <Text className="text-white font-semibold text-sm">
              {isOta ? (busy ? t.update.restarting : t.update.restartBtn) : t.update.updateBtn}
            </Text>
          </TouchableOpacity>
          {!isOta && (
            <TouchableOpacity onPress={dismiss} hitSlop={8} activeOpacity={0.7}>
              <Text className="text-muted text-xs">{t.update.later}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

export function UpdateRequiredGate() {
  const t = useT();
  const { required, latestVersion, sameVersionName, notes, goToStore } = useAppUpdate();

  if (!required) return null;

  return (
    <Modal visible animationType="fade" statusBarTranslucent>
      <View className="flex-1 bg-background px-6 justify-center items-center">
        <KmbLogo size={72} />
        <Text className="text-text text-xl font-bold mt-6 text-center">
          {t.update.requiredTitle}
        </Text>
        <Text className="text-text-secondary text-sm mt-3 text-center leading-5">
          {latestVersion && !sameVersionName
            ? t.update.requiredBody(latestVersion)
            : t.update.requiredBodyGeneric}
        </Text>
        {notes && (
          <View className="bg-card border border-border rounded-2xl px-4 py-3 mt-5 w-full">
            <Text className="text-text font-semibold text-xs mb-1">{t.update.whatsNew}</Text>
            <Text className="text-text-secondary text-xs leading-5">{notes}</Text>
          </View>
        )}
        <Button label={t.update.updateBtn} onPress={goToStore} className="mt-8 w-full" />
      </View>
    </Modal>
  );
}

/**
 * The permanent home for "what am I running, and is it current?" — a row on the
 * account screen. The banner only appears when there is news; this is always
 * there, which is where a merchant looks when support asks them for a version.
 */
export function UpdateCheckRow() {
  const t = useT();
  const {
    kind,
    installedVersion,
    installedBuild,
    latestVersion,
    sameVersionName,
    goToStore,
    restart,
    check,
    checking,
    busy,
  } = useAppUpdate();
  const [checkedClean, setCheckedClean] = useState(false);

  const handlePress = async (): Promise<void> => {
    if (kind === 'ota') return restart();
    if (kind === 'store') return goToStore();
    setCheckedClean(false);
    await check();
    setCheckedClean(true);
  };

  const label =
    kind === 'ota'
      ? busy
        ? t.update.restarting
        : t.update.restartBtn
      : kind === 'store'
        ? t.update.updateBtn
        : checking
          ? t.update.checking
          : t.update.checkBtn;

  return (
    <View className="flex-row items-center justify-between bg-card border border-border rounded-2xl px-4 py-4 mb-3">
      <View className="flex-1 pr-3">
        <Text className="text-text font-semibold text-base">
          {/* The build number is what support needs when two installs both say
              "1.0.0" — show it whenever the app can read it. */}
          {installedBuild !== null
            ? t.update.installedVersionBuild(installedVersion, installedBuild)
            : t.update.installedVersion(installedVersion)}
        </Text>
        <Text className="text-muted text-sm mt-0.5">
          {kind === 'store'
            ? latestVersion && !sameVersionName
              ? t.update.availableBody(latestVersion)
              : t.update.availableBodyGeneric
            : kind === 'ota'
              ? t.update.readyBody
              : checkedClean && !checking
                ? t.update.upToDate
                : t.update.checkBtn}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => void handlePress()}
        disabled={checking || busy}
        className={`px-4 py-2 rounded-xl ${kind === 'none' ? 'border border-primary' : 'bg-primary'} ${
          checking || busy ? 'opacity-60' : ''
        }`}
        activeOpacity={0.8}
      >
        <Text className={`font-semibold text-sm ${kind === 'none' ? 'text-primary' : 'text-white'}`}>
          {label}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
