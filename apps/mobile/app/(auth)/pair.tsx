import { useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { Link, router } from 'expo-router';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { authApi } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';
import { KmbLogo } from '../../components/ui/KmbLogo';

/**
 * Mini-employee pairing = their login. They authenticate with the username +
 * one-time pairing code the employer gave them. On success they get a JWT; if
 * the employment is still PENDING the home tab shows the accept-invite card.
 */
export default function PairScreen() {
  const t = useT();
  const [username, setUsername] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);

  const handlePair = async () => {
    if (!username.trim() || !pairingCode.trim()) {
      Alert.alert(t.common.missingFields, t.miniEmployee.pairMissingMsg);
      return;
    }
    setLoading(true);
    try {
      const { accessToken, user } = await authApi.pairMiniEmployee({
        username: username.trim(),
        pairingCode: pairingCode.trim(),
      });
      await login(accessToken, user);
      router.replace('/(tabs)');
    } catch (err) {
      Alert.alert(t.miniEmployee.pairFailed, getErrorMessage(err));
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
      <View className="items-center mb-8">
        <KmbLogo size={56} className="mb-4" />
        <Text className="text-2xl font-bold text-text tracking-tight">{t.miniEmployee.pairTitle}</Text>
        <Text className="text-muted mt-1 text-sm font-medium text-center">{t.miniEmployee.pairSubtitle}</Text>
      </View>

      <View className="bg-card border border-border rounded-2xl p-6">
        <Input
          label={t.miniEmployee.pairUsername}
          value={username}
          onChangeText={setUsername}
          placeholder={t.miniEmployee.pairUsernamePlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Input
          label={t.miniEmployee.pairCode}
          value={pairingCode}
          onChangeText={(v) => setPairingCode(v.toUpperCase())}
          placeholder={t.miniEmployee.pairCodePlaceholder}
          autoCapitalize="characters"
          autoCorrect={false}
        />

        <Button label={t.miniEmployee.pairBtn} onPress={handlePair} loading={loading} className="mt-2" />
      </View>

      <View className="flex-row justify-center mt-6">
        <Link href="/(auth)/login">
          <Text className="text-primary font-semibold">{t.miniEmployee.pairBackToLogin}</Text>
        </Link>
      </View>
    </ScrollView>
  );
}
