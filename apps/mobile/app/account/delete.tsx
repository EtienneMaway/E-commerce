import { useState } from 'react';
import { ScrollView, View, Text, Alert } from 'react-native';
import { router } from 'expo-router';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { accountApi } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import { getErrorMessage, formatDate } from '../../lib/utils';
import { useT } from '../../lib/i18n';

export default function DeleteAccountScreen() {
  const t = useT();
  const logout = useAuthStore((s) => s.logout);

  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    confirmation.trim().toUpperCase() === t.account.deletePromptToken &&
    password.length > 0 &&
    !submitting;

  const handleDelete = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { expiresAt } = await accountApi.deleteAccount({ password });
      Alert.alert(
        t.account.deleteSuccessTitle,
        t.account.deleteSuccessBody(formatDate(expiresAt)),
        [
          {
            text: 'OK',
            onPress: async () => {
              await logout();
              router.replace('/(auth)/login');
            },
          },
        ],
      );
    } catch (err) {
      Alert.alert(t.account.deleteFailed, getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-surface dark:bg-slate-900"
      contentContainerClassName="px-4 pt-4 pb-8"
      keyboardShouldPersistTaps="handled"
    >
      <View className="bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 rounded-2xl px-4 py-4 mb-5">
        <Text className="text-danger font-semibold text-base mb-2">
          {t.account.deleteWarningTitle}
        </Text>
        <Text className="text-text dark:text-slate-100 text-sm leading-5">
          {t.account.deleteWarningBody}
        </Text>
      </View>

      <Input
        label={t.account.deletePromptType}
        value={confirmation}
        onChangeText={setConfirmation}
        placeholder={t.account.deletePromptTokenLabel}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <Input
        label={t.account.deletePasswordLabel}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        passwordToggle
      />

      <Button
        label={submitting ? t.account.deleting : t.account.deleteSubmit}
        onPress={handleDelete}
        loading={submitting}
        disabled={!canSubmit}
        variant="danger"
        className="mt-2"
      />
    </ScrollView>
  );
}
