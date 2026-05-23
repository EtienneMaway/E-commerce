import { Stack } from 'expo-router';
import { useT } from '../../lib/i18n';

export default function AccountLayout() {
  const t = useT();
  return (
    <Stack screenOptions={{ headerShown: true, headerBackTitle: t.screens.back }}>
      <Stack.Screen name="index" options={{ title: t.account.menuTitle }} />
      <Stack.Screen name="edit" options={{ title: t.account.editProfile }} />
      <Stack.Screen name="change-password" options={{ title: t.account.changePassword }} />
      <Stack.Screen name="delete" options={{ title: t.account.deleteAccount }} />
    </Stack>
  );
}
