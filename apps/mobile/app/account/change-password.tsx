import { useState } from 'react';
import { ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { accountApi } from '../../lib/api';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';

export default function ChangePasswordScreen() {
  const t = useT();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!currentPassword || !newPassword || !confirm) {
      Alert.alert(t.common.missingFields);
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert(t.common.error, t.account.passwordMinChars);
      return;
    }
    if (newPassword !== confirm) {
      Alert.alert(t.common.error, t.account.passwordsMismatch);
      return;
    }
    if (newPassword === currentPassword) {
      Alert.alert(t.common.error, t.account.samePasswordMsg);
      return;
    }
    setSaving(true);
    try {
      await accountApi.changePassword({ currentPassword, newPassword });
      Alert.alert(t.account.passwordUpdated);
      router.back();
    } catch (err) {
      Alert.alert(t.account.passwordChangeFailed, getErrorMessage(err));
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
      <Input
        label={t.account.currentPassword}
        value={currentPassword}
        onChangeText={setCurrentPassword}
        secureTextEntry
        passwordToggle
      />
      <Input
        label={t.account.newPassword}
        value={newPassword}
        onChangeText={setNewPassword}
        placeholder={t.account.passwordMinChars}
        secureTextEntry
        passwordToggle
      />
      <Input
        label={t.account.confirmNewPassword}
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        passwordToggle
      />
      <Button
        label={saving ? t.account.saving : t.account.save}
        onPress={handleSubmit}
        loading={saving}
        className="mt-2"
      />
    </ScrollView>
  );
}
