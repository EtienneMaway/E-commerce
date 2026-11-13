import { useState } from 'react';
import { View, Text } from 'react-native';
import { Link, router } from 'expo-router';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { authApi } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';
import { AuthShell } from '../../components/AuthShell';
import { showAlert } from '../../lib/alert';

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
      showAlert(t.common.missingFields, t.auth.missingFieldsMsgRegister);
      return;
    }
    if (!email.trim() && !phone.trim()) {
      showAlert(t.auth.contactRequired, t.auth.contactRequiredMsg);
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
      showAlert(t.auth.registrationFailed, getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={t.auth.createAccount}
      subtitle={t.auth.createAccountSubtitle}
      footer={
        <View className="flex-row justify-center">
          <Text className="text-muted">{t.auth.alreadyHaveAccount} </Text>
          <Link href="/(auth)/login">
            <Text className="text-primary font-semibold">{t.auth.signInLink}</Text>
          </Link>
        </View>
      }
    >
      <Input label={t.auth.username} value={username} onChangeText={setUsername}
        placeholder={t.auth.usernamePlaceholder} autoCapitalize="none" autoCorrect={false} />
      <Input label={t.auth.emailOptional} value={email} onChangeText={setEmail}
        placeholder={t.auth.emailPlaceholder} keyboardType="email-address" autoCapitalize="none" />
      <Input label={t.auth.phoneOptional} value={phone} onChangeText={setPhone}
        placeholder={t.auth.phonePlaceholder} keyboardType="phone-pad" />
      <Input label={t.auth.password} value={password} onChangeText={setPassword}
        placeholder={t.auth.passwordMinChars} secureTextEntry passwordToggle />
      <Button label={t.auth.createAccountBtn} icon="user-plus" onPress={handleRegister} loading={loading} className="mt-2" />
    </AuthShell>
  );
}
