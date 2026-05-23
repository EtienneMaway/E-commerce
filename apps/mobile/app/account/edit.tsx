import { useState } from 'react';
import { ScrollView, View, Text, Alert } from 'react-native';
import { router } from 'expo-router';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { accountApi, authApi } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';

export default function EditProfileScreen() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const login = useAuthStore((s) => s.login);

  const [name, setName] = useState<string>(user?.name ?? '');
  const [email, setEmail] = useState<string>(user?.email ?? '');
  const [phone, setPhone] = useState<string>(user?.phone ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!email.trim() && !phone.trim()) {
      Alert.alert(t.common.missingFields, t.account.contactRequiredMsg);
      return;
    }
    setSaving(true);
    try {
      await accountApi.updateProfile({
        name: name.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
      });
      // Refresh the auth-store user from /auth/me so derived UI updates immediately.
      const fresh = await authApi.me();
      if (token) await login(token, fresh);
      Alert.alert(t.account.saved);
      router.back();
    } catch (err) {
      Alert.alert(t.account.updateFailed, getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-surface dark:bg-slate-900"
      contentContainerClassName="px-4 pt-4 pb-8"
      keyboardShouldPersistTaps="handled"
    >
      <View className="mb-4">
        <Text className="text-sm font-medium text-text dark:text-slate-100 mb-1.5">
          {t.account.username}
        </Text>
        <View className="border rounded-xl px-4 py-3 bg-card dark:bg-slate-800 border-border dark:border-slate-700">
          <Text className="text-text dark:text-slate-100 text-base">@{user?.username}</Text>
        </View>
        <Text className="text-muted dark:text-slate-500 text-xs mt-1">
          {t.account.usernameReadOnly}
        </Text>
      </View>

      <Input
        label={t.account.name}
        value={name}
        onChangeText={setName}
        placeholder={t.account.namePlaceholder}
      />
      <Input
        label={t.account.email}
        value={email}
        onChangeText={setEmail}
        placeholder={t.account.emailPlaceholder}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Input
        label={t.account.phone}
        value={phone}
        onChangeText={setPhone}
        placeholder={t.account.phonePlaceholder}
        keyboardType="phone-pad"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Button
        label={saving ? t.account.saving : t.account.save}
        onPress={handleSave}
        loading={saving}
        className="mt-2"
      />
    </ScrollView>
  );
}
