import { useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { Link, router } from 'expo-router';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { authApi } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import { getErrorMessage, getPendingDeletion, formatDate } from '../../lib/utils';
import { useT } from '../../lib/i18n';
import { KmbLogo } from '../../components/ui/KmbLogo';

export default function LoginScreen() {
  const t = useT();
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);

  const completeLogin = async (creds: { emailOrPhone: string; password: string }) => {
    const { accessToken, user } = await authApi.login(creds);
    await login(accessToken, user);
    router.replace('/(tabs)');
  };

  const promptRestore = (
    creds: { emailOrPhone: string; password: string },
    expiresAt: string,
  ) => {
    Alert.alert(
      t.account.pendingDeletionTitle,
      t.account.pendingDeletionBody(formatDate(expiresAt)),
      [
        { text: t.account.keepDeletedBtn, style: 'cancel' },
        {
          text: t.account.restoreBtn,
          onPress: async () => {
            setLoading(true);
            try {
              const { accessToken, user } = await authApi.restore(creds);
              await login(accessToken, user);
              router.replace('/(tabs)');
            } catch (err) {
              Alert.alert(t.account.restoreFailed, getErrorMessage(err));
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleLogin = async () => {
    if (!emailOrPhone.trim() || !password) {
      Alert.alert(t.common.missingFields, t.auth.missingFieldsMsg);
      return;
    }
    const creds = { emailOrPhone: emailOrPhone.trim(), password };
    setLoading(true);
    try {
      await completeLogin(creds);
    } catch (err) {
      const pending = getPendingDeletion(err);
      if (pending) {
        promptRestore(creds, pending.expiresAt);
      } else {
        Alert.alert(t.auth.loginFailed, getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="flex-grow justify-center px-6 py-12"
      keyboardShouldPersistTaps="handled"
    >
      {/* Brand block — same order as the web login: mark, title, subtitle. */}
      <View className="items-center mb-8">
        <KmbLogo size={56} className="mb-4" />
        <Text className="text-2xl font-bold text-text tracking-tight">{t.auth.welcomeBack}</Text>
        <Text className="text-muted mt-1 text-sm font-medium">{t.auth.signInSubtitle}</Text>
      </View>

      {/* Card — the dashboard puts the form on a raised card over the page
          background, rather than letting the fields float on the page. */}
      <View className="bg-card border border-border rounded-2xl p-6">
        <Input
          label={t.auth.emailOrPhone}
          value={emailOrPhone}
          onChangeText={setEmailOrPhone}
          placeholder={t.auth.emailOrPhonePlaceholder}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Input
          label={t.auth.password}
          value={password}
          onChangeText={setPassword}
          placeholder={t.auth.passwordPlaceholder}
          secureTextEntry
          passwordToggle
        />

        <Button label={t.auth.signIn} onPress={handleLogin} loading={loading} className="mt-2" />
      </View>

      <View className="flex-row justify-center mt-6">
        <Text className="text-muted">{t.auth.noAccount}</Text>
        <Link href="/(auth)/register">
          <Text className="text-primary font-semibold">{t.auth.signUpLink}</Text>
        </Link>
      </View>

      <View className="flex-row justify-center mt-3">
        <Link href="/(auth)/pair">
          <Text className="text-primary font-semibold">{t.miniEmployee.pairLink}</Text>
        </Link>
      </View>
    </ScrollView>
  );
}
