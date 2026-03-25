import { useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { Link, router } from 'expo-router';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { authApi } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';

export default function RegisterScreen() {
  const t = useT();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);

  const handleRegister = async () => {
    if (!username.trim() || !password) {
      Alert.alert(t.common.missingFields, t.auth.missingFieldsMsgRegister);
      return;
    }
    if (!email.trim() && !phone.trim()) {
      Alert.alert(t.auth.contactRequired, t.auth.contactRequiredMsg);
      return;
    }
    setLoading(true);
    try {
      const body = {
        username: username.trim(),
        password,
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      };
      const { accessToken, user } = await authApi.register(body);
      await login(accessToken, user);
      router.replace('/(tabs)');
    } catch (err) {
      Alert.alert(t.auth.registrationFailed, getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-surface dark:bg-slate-900"
      contentContainerClassName="px-6 py-12"
      keyboardShouldPersistTaps="handled"
    >
      <View className="mb-10">
        <Text className="text-4xl font-bold text-text dark:text-slate-100">{t.auth.createAccount}</Text>
        <Text className="text-muted dark:text-slate-500 mt-2 text-base">{t.auth.createAccountSubtitle}</Text>
      </View>

      <Input label={t.auth.username} value={username} onChangeText={setUsername}
        placeholder={t.auth.usernamePlaceholder} autoCapitalize="none" autoCorrect={false} />
      <Input label={t.auth.emailOptional} value={email} onChangeText={setEmail}
        placeholder={t.auth.emailPlaceholder} keyboardType="email-address" autoCapitalize="none" />
      <Input label={t.auth.phoneOptional} value={phone} onChangeText={setPhone}
        placeholder={t.auth.phonePlaceholder} keyboardType="phone-pad" />
      <Input label={t.auth.password} value={password} onChangeText={setPassword}
        placeholder={t.auth.passwordMinChars} secureTextEntry passwordToggle />

      <Button label={t.auth.createAccountBtn} onPress={handleRegister} loading={loading} className="mt-2" />

      <View className="flex-row justify-center mt-6">
        <Text className="text-muted dark:text-slate-500">{t.auth.alreadyHaveAccount}</Text>
        <Link href="/(auth)/login">
          <Text className="text-primary font-semibold">{t.auth.signInLink}</Text>
        </Link>
      </View>
    </ScrollView>
  );
}
