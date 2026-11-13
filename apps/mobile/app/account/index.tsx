import { ScrollView, View, Text } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/auth.store';
import { useT } from '../../lib/i18n';
import { UpdateCheckRow } from '../../components/ui/UpdateNotice';
import { NavRow } from '../../components/ui/NavRow';
import { CARD_SHADOW } from '../../components/ui/Card';
import { showAlert } from '../../lib/alert';

export default function AccountMenuScreen() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    showAlert(t.account.logout, t.account.logoutSubtitle, [
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

  const name = user?.name || user?.username || '';
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-5 pt-3 pb-10">
      {/* Profile — a big initial, the name in the serif */}
      <View className="mb-6 bg-card border border-border rounded-3xl px-5 py-5 flex-row items-center" style={{ boxShadow: CARD_SHADOW }}>
        <View className="w-16 h-16 rounded-full bg-primary items-center justify-center mr-4">
          <Text className="font-bold text-2xl text-white">{name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View className="flex-1">
          <Text className="font-bold text-xl text-text" numberOfLines={1}>{name}</Text>
          <Text className="font-mono text-xs text-muted mt-0.5">@{user?.username}</Text>
          {user?.email ? <Text className="text-muted text-xs mt-1">{user.email}</Text> : null}
          {user?.phone ? <Text className="text-muted text-xs">{user.phone}</Text> : null}
        </View>
      </View>

      <NavRow icon="edit-3" title={t.account.editProfile} subtitle={t.account.editProfileSubtitle} onPress={() => router.push('/account/edit')} />
      <NavRow icon="key" title={t.account.changePassword} subtitle={t.account.changePasswordSubtitle} onPress={() => router.push('/account/change-password')} />
      <NavRow icon="printer" tone="accent" title={t.printer.title} subtitle={t.printer.subtitle} onPress={() => router.push('/account/printer')} />
      <NavRow icon="log-out" title={t.account.logout} subtitle={t.account.logoutSubtitle} onPress={handleLogout} />
      <UpdateCheckRow />

      <View className="mt-4">
        <NavRow
          icon="trash-2"
          tone="danger"
          title={t.account.deleteAccount}
          subtitle={t.account.deleteAccountSubtitle}
          onPress={() => router.push('/account/delete')}
        />
      </View>
    </ScrollView>
  );
}
