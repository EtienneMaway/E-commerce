import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import { usePersonaStore } from '../../store/persona.store';
import { useShopStore } from '../../store/shop.store';
import { useT } from '../../lib/i18n';
import type { ActingAs } from '../../lib/api';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

/**
 * Header chip that opens a Self / Employer modal. Renders nothing for users
 * without an active employment. On switch:
 *   1. Persists new persona (via persona store).
 *   2. Updates the axios interceptor's module-level _actingAs.
 *   3. Calls `qc.resetQueries()` so mounted screens refetch with the new
 *      X-Acting-As header — prevents stale Self data from bleeding into an
 *      Employer view (or vice versa).
 */
export function PersonaSwitcher() {
  const t = useT();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { kind, setKind } = usePersonaStore();
  const organization = useShopStore((s) => s.organization);
  const [open, setOpen] = useState(false);

  const employment = user?.activeEmployment;
  if (!employment) return null;

  // The business name reads far better than the employer's raw username —
  // falls back to it only in the unlikely gap before shop context has hydrated.
  const employerName = organization?.name ?? employment.employer.username;
  const isEmployerMode = kind === 'employer';

  const choose = async (next: ActingAs) => {
    setOpen(false);
    if (next === kind) return;
    await setKind(next);
    qc.resetQueries();
  };

  const option = (value: ActingAs, icon: 'user' | 'briefcase', title: string, sub: string, extra?: string) => {
    const active = kind === value;
    return (
      <Pressable
        onPress={() => void choose(value)}
        className={`flex-row items-center gap-3 px-4 py-4 rounded-3xl border mb-2.5 ${
          active
            ? value === 'employer'
              ? 'bg-accent-light border-accent/50'
              : 'bg-primary-light border-primary/40'
            : 'bg-card border-border'
        }`}
        style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.985 : 1 }] })}
      >
        <View
          className={`w-11 h-11 rounded-2xl items-center justify-center ${
            value === 'employer' ? 'bg-accent/15' : 'bg-primary/15'
          }`}
        >
          <Icon name={icon} size={20} tone={value === 'employer' ? 'violet' : 'primary'} />
        </View>
        <View className="flex-1">
          <Text className="text-text font-semibold text-[15px]">{title}</Text>
          <Text className="text-muted text-xs mt-0.5">{sub}</Text>
          {extra ? <Text className="text-warning text-[11px] mt-1">{extra}</Text> : null}
        </View>
        <View
          className={`w-6 h-6 rounded-full items-center justify-center border-2 ${
            active ? (value === 'employer' ? 'bg-accent border-accent' : 'bg-primary border-primary') : 'border-muted-subtle'
          }`}
        >
          {active ? <Icon name="check" size={13} color="#FFFFFF" /> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <>
      {/* The chip: copper while acting on the employer's books, so it is
          never mistaken for your own. */}
      <Pressable
        onPress={() => setOpen(true)}
        className={`flex-row items-center gap-1.5 px-2.5 py-1 rounded-full border ${
          isEmployerMode ? 'bg-accent-light border-accent/40' : 'bg-card border-border'
        }`}
        accessibilityLabel={t.persona.switchTo}
      >
        <Icon name={isEmployerMode ? 'briefcase' : 'user'} size={12} tone={isEmployerMode ? 'violet' : 'muted'} />
        <Text
          numberOfLines={1}
          className={`text-xs font-semibold max-w-[120px] ${isEmployerMode ? 'text-accent' : 'text-text-secondary'}`}
        >
          {isEmployerMode ? employerName : t.persona.self}
        </Text>
        <Icon name="chevron-down" size={12} tone={isEmployerMode ? 'violet' : 'muted'} />
      </Pressable>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        icon={isEmployerMode ? 'briefcase' : 'user'}
        tone={isEmployerMode ? 'accent' : 'primary'}
        title={t.persona.sheetTitle}
        subtitle={t.persona.sheetHint}
      >
        {option('self', 'user', t.persona.self, t.persona.selfSub)}
        {option(
          'employer',
          'briefcase',
          employerName,
          t.persona.employerSub(employerName),
          employment.status === 'TERMINATION_REQUESTED' ? t.persona.terminationPending : undefined,
        )}
      </Sheet>
    </>
  );
}
