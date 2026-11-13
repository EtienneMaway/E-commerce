import { useState } from 'react';
import { View, Text } from 'react-native';
import { Link, router } from 'expo-router';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { authApi } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import { getErrorMessage, getPendingDeletion, formatDate } from '../../lib/utils';
import { useT } from '../../lib/i18n';
import { AuthShell } from '../../components/AuthShell';
import { showAlert } from '../../lib/alert';

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
    showAlert(
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
              showAlert(t.account.restoreFailed, getErrorMessage(err));
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
      showAlert(t.common.missingFields, t.auth.missingFieldsMsg);
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
        showAlert(t.auth.loginFailed, getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={t.auth.welcomeBack}
      subtitle={t.auth.signInSubtitle}
      footer={
        <>
          <View className="flex-row justify-center">
            <Text className="text-muted">{t.auth.noAccount} </Text>
            <Link href="/(auth)/register">
              <Text className="text-primary font-semibold">{t.auth.signUpLink}</Text>
            </Link>
          </View>
          <Link href="/(auth)/pair">
            <Text className="text-accent font-semibold">{t.miniEmployee.pairLink} →</Text>
          </Link>
        </>
      }
    >
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
      <Button label={t.auth.signIn} icon="log-in" onPress={handleLogin} loading={loading} className="mt-2" />
    </AuthShell>
  );
}
