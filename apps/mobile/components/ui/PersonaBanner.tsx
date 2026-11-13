import { View, Text, Pressable } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import { usePersonaStore } from '../../store/persona.store';
import { useShopStore } from '../../store/shop.store';
import { useT } from '../../lib/i18n';
import { Icon } from './Icon';

/**
 * Standing reminder shown at the top of every screen while a user is in
 * Employer mode. A subtle but constant indicator that every action they take
 * goes to the employer's books, not their own. Tap the link to flip back.
 */
export function PersonaBanner() {
  const t = useT();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { kind, setKind } = usePersonaStore();
  const organization = useShopStore((s) => s.organization);

  const employment = user?.activeEmployment;
  if (kind !== 'employer' || !employment) return null;

  // The business name reads far better than the employer's raw username —
  // falls back to it only in the unlikely gap before shop context has hydrated.
  const employerName = organization?.name ?? employment.employer.username;

  const handleSwitchBack = async () => {
    await setKind('self');
    qc.resetQueries();
  };

  return (
    <View className="bg-accent-light border border-accent/40 rounded-3xl px-4 py-3.5 mb-4 flex-row items-start gap-3">
      <View className="w-9 h-9 rounded-2xl bg-accent/15 items-center justify-center">
        <Icon name="briefcase" size={17} tone="violet" />
      </View>
      <View className="flex-1">
        <Text className="text-accent font-semibold text-sm">{t.persona.bannerTitle(employerName)}</Text>
        <Text className="text-accent text-xs mt-0.5 opacity-80">{t.persona.bannerSub}</Text>
        <Pressable onPress={handleSwitchBack} hitSlop={6} className="flex-row items-center gap-1 mt-2 self-start">
          <Icon name="corner-up-left" size={13} tone="violet" />
          <Text className="text-accent text-xs font-semibold">{t.persona.bannerSwitch}</Text>
        </Pressable>
      </View>
    </View>
  );
}
