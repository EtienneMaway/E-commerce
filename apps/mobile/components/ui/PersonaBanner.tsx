import { View, Text, Pressable } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import { usePersonaStore } from '../../store/persona.store';
import { useT } from '../../lib/i18n';

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

  const employment = user?.activeEmployment;
  if (kind !== 'employer' || !employment) return null;

  const handleSwitchBack = async () => {
    await setKind('self');
    qc.resetQueries();
  };

  return (
    <View className="bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-900 rounded-xl px-4 py-3 mb-4 flex-row items-start gap-3">
      <Text className="text-base mt-0.5">🪪</Text>
      <View className="flex-1">
        <Text className="text-indigo-700 dark:text-indigo-300 font-semibold text-sm">
          {t.persona.bannerTitle(employment.employer.username)}
        </Text>
        <Text className="text-indigo-600 dark:text-indigo-400 text-xs mt-0.5">
          {t.persona.bannerSub}
        </Text>
        <Pressable onPress={handleSwitchBack} hitSlop={6}>
          <Text className="text-indigo-700 dark:text-indigo-300 text-xs font-semibold underline mt-1">
            {t.persona.bannerSwitch}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
