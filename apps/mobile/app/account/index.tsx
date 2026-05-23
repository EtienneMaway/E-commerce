import { ScrollView, View, Text, Pressable, Alert } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/auth.store';
import { useT } from '../../lib/i18n';

interface MenuItemProps {
  title: string;
  subtitle: string;
  onPress: () => void;
  destructive?: boolean;
}

function MenuItem({ title, subtitle, onPress, destructive }: MenuItemProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl px-4 py-4 mb-3"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <View className="flex-1 pr-3">
        <Text className={`font-semibold text-base ${destructive ? 'text-danger' : 'text-text dark:text-slate-100'}`}>
          {title}
        </Text>
        <Text className="text-muted dark:text-slate-400 text-sm mt-0.5">{subtitle}</Text>
      </View>
      <Text className="text-muted dark:text-slate-500 text-xl">›</Text>
    </Pressable>
  );
}

export default function AccountMenuScreen() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    Alert.alert(t.account.logout, t.account.logoutSubtitle, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.account.logout,
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  return (
    <ScrollView
      className="flex-1 bg-surface dark:bg-slate-900"
      contentContainerClassName="px-4 pt-4 pb-8"
    >
      <View className="mb-5 bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl px-4 py-4">
        <Text className="text-muted dark:text-slate-400 text-xs uppercase">{t.account.username}</Text>
        <Text className="text-text dark:text-slate-100 font-semibold text-base mt-1">@{user?.username}</Text>
        {user?.email ? (
          <Text className="text-muted dark:text-slate-400 text-sm mt-1">{user.email}</Text>
        ) : null}
        {user?.phone ? (
          <Text className="text-muted dark:text-slate-400 text-sm">{user.phone}</Text>
        ) : null}
      </View>

      <MenuItem
        title={t.account.editProfile}
        subtitle={t.account.editProfileSubtitle}
        onPress={() => router.push('/account/edit')}
      />
      <MenuItem
        title={t.account.changePassword}
        subtitle={t.account.changePasswordSubtitle}
        onPress={() => router.push('/account/change-password')}
      />
      <MenuItem
        title={t.printer.title}
        subtitle={t.printer.subtitle}
        onPress={() => router.push('/account/printer')}
      />
      <MenuItem
        title={t.account.logout}
        subtitle={t.account.logoutSubtitle}
        onPress={handleLogout}
      />
      <MenuItem
        title={t.account.deleteAccount}
        subtitle={t.account.deleteAccountSubtitle}
        onPress={() => router.push('/account/delete')}
        destructive
      />
    </ScrollView>
  );
}
