import { Stack } from 'expo-router';
import { useT } from '../../lib/i18n';
import { useHeaderOptions } from '../../lib/theme';

export default function AccountLayout() {
  const t = useT();
  const headerOptions = useHeaderOptions();
  return (
    <Stack screenOptions={{ headerShown: true, headerBackTitle: t.screens.back, ...headerOptions }}>
      <Stack.Screen name="index" options={{ title: t.account.menuTitle }} />
      <Stack.Screen name="edit" options={{ title: t.account.editProfile }} />
      <Stack.Screen name="change-password" options={{ title: t.account.changePassword }} />
      <Stack.Screen name="printer" options={{ title: t.printer.title }} />
      <Stack.Screen name="delete" options={{ title: t.account.deleteAccount }} />
    </Stack>
  );
}
