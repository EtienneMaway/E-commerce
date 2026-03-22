import { useState } from 'react';
import { View, Text, Modal, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { externalContactsApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';

type Role = 'DEBTOR' | 'SUPPLIER' | 'BOTH';
interface Props { visible: boolean; onClose: () => void; }

export function CreateExternalContactModal({ visible, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', phone: '', notes: '' });
  const [role, setRole] = useState<Role>('DEBTOR');
  const set = (key: keyof typeof form) => (val: string) => setForm((f) => ({ ...f, [key]: val }));

  const { mutate, isPending } = useMutation({
    mutationFn: () => externalContactsApi.create({
      name: form.name,
      phone: form.phone || undefined,
      notes: form.notes || undefined,
      role,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.externalContacts });
      setForm({ name: '', phone: '', notes: '' });
      setRole('DEBTOR');
      onClose();
    },
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });

  const handleSubmit = () => {
    if (!form.name.trim()) {
      Alert.alert(t.createExternalContactModal.missingName, t.createExternalContactModal.missingNameMsg);
      return;
    }
    mutate();
  };

  const roles: Role[] = ['DEBTOR', 'SUPPLIER', 'BOTH'];
  const roleLabels: Record<Role, string> = {
    DEBTOR: t.createExternalContactModal.roleDebtor,
    SUPPLIER: t.createExternalContactModal.roleSupplier,
    BOTH: t.createExternalContactModal.roleBoth,
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView className="flex-1 bg-surface dark:bg-slate-900" contentContainerClassName="px-6 py-8" keyboardShouldPersistTaps="handled">
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-xl font-bold text-text dark:text-slate-100">{t.createExternalContactModal.title}</Text>
          <TouchableOpacity onPress={onClose}><Text className="text-primary font-medium">{t.common.cancel}</Text></TouchableOpacity>
        </View>

        <Input label={t.createExternalContactModal.name} value={form.name} onChangeText={set('name')} placeholder={t.createExternalContactModal.namePlaceholder} autoCapitalize="words" />
        <Input label={t.createExternalContactModal.phone} value={form.phone} onChangeText={set('phone')} placeholder={t.createExternalContactModal.phonePlaceholder} keyboardType="phone-pad" />
        <Input label={t.createExternalContactModal.notes} value={form.notes} onChangeText={set('notes')} placeholder={t.createExternalContactModal.notesPlaceholder} autoCapitalize="sentences" />

        {/* Role picker */}
        <Text className="text-sm font-medium text-text dark:text-slate-300 mb-2">{t.createExternalContactModal.role}</Text>
        <View className="flex-row gap-2 mb-6">
          {roles.map((r) => (
            <TouchableOpacity
              key={r}
              onPress={() => setRole(r)}
              className={`flex-1 py-2.5 rounded-xl border items-center ${role === r ? 'bg-primary border-primary' : 'bg-card dark:bg-slate-800 border-border dark:border-slate-700'}`}
            >
              <Text className={`text-xs font-semibold ${role === r ? 'text-white' : 'text-muted dark:text-slate-400'}`}>
                {roleLabels[r]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Button label={t.createExternalContactModal.submit} onPress={handleSubmit} loading={isPending} />
      </ScrollView>
    </Modal>
  );
}
