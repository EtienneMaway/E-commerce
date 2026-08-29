import { View, Text } from 'react-native';
import { useAuthStore } from '../store/auth.store';
import { usePersonaStore } from '../store/persona.store';
import { useT } from '../lib/i18n';

/**
 * Shown on the home tab when the employer has opened nothing for this employee.
 *
 * With no services every tab but Home is hidden and Home itself has almost
 * nothing left to render, so without this the app just looks broken. The point
 * is to say plainly that the account is fine and what to do about it.
 */
export function NoAccessNotice() {
  const t = useT();
  const employer = useAuthStore((s) => s.user?.activeEmployment?.employer?.username);
  const roleName = useAuthStore((s) => s.user?.activeEmployment?.role?.name) ?? null;
  const persona = usePersonaStore((s) => s.kind);

  return (
    <View className="bg-card border border-border rounded-2xl px-5 py-6 mb-4">
      <Text className="text-4xl text-center mb-3">🔒</Text>
      <Text className="text-text font-bold text-lg text-center mb-2">
        {t.roles.noAccessTitle}
      </Text>
      <Text className="text-muted text-sm text-center leading-5">
        {employer ? t.roles.noAccessBody(employer) : t.roles.noAccessBodyGeneric}
      </Text>
      {/* An assigned-but-empty role reads as a failed assignment unless named. */}
      {roleName ? (
        <Text className="text-muted text-xs text-center mt-2">
          {t.roles.noAccessRole(roleName)}
        </Text>
      ) : null}
      <View className="border-t border-border mt-4 pt-4">
        <Text className="text-muted text-xs leading-5">
          {t.roles.noAccessLeaveHint}
        </Text>
        {persona === 'employer' ? (
          <Text className="text-muted text-xs mt-2 leading-5">
            {t.roles.noAccessPersonaHint}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
