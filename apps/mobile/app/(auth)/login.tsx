import { useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { Link, router } from 'expo-router';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { authApi } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';

export default function LoginScreen() {
  const t = useT();
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);

  const handleLogin = async () => {
    if (!emailOrPhone.trim() || !password) {
      Alert.alert(t.common.missingFields, t.auth.missingFieldsMsg);
      return;
    }
    setLoading(true);
    try {
      const { accessToken, user } = await authApi.login({ emailOrPhone: emailOrPhone.trim(), password });
      await login(accessToken, user);
      router.replace('/(tabs)');
    } catch (err) {
      Alert.alert(t.auth.loginFailed, getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-surface dark:bg-slate-900"
      contentContainerClassName="flex-1 justify-center px-6 py-12"
      keyboardShouldPersistTaps="handled"
    >
      <View className="mb-10">
        <Text className="text-4xl font-bold text-text dark:text-slate-100">{t.auth.welcomeBack}</Text>
        <Text className="text-muted dark:text-slate-500 mt-2 text-base">{t.auth.signInSubtitle}</Text>
      </View>

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
      />

      <Button label={t.auth.signIn} onPress={handleLogin} loading={loading} className="mt-2" />

      <View className="flex-row justify-center mt-6">
        <Text className="text-muted dark:text-slate-500">{t.auth.noAccount}</Text>
        <Link href="/(auth)/register">
          <Text className="text-primary font-semibold">{t.auth.signUpLink}</Text>
        </Link>
      </View>
    </ScrollView>
  );
}
