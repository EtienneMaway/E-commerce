import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useBrand } from '../../lib/theme';
import { useT } from '../../lib/i18n';

interface User { id: string; username: string; email: string | null; phone: string | null; }

interface Props {
  label: string;
  selected: User | null;
  onSelect: (user: User) => void;
}

export function UserSearchField({ label, selected, onSelect }: Props) {
  const brand = useBrand();
  const t = useT();
  const [q, setQ] = useState('');

  const { data, isFetching } = useQuery({
    queryKey: QK.userSearch(q),
    queryFn: () => usersApi.search(q),
    enabled: q.trim().length >= 2,
    staleTime: 10_000,
  });

  if (selected) {
    return (
      <View className="mb-4">
        <Text className="text-sm font-medium text-text mb-1.5">{label}</Text>
        <View className="flex-row items-center justify-between border border-border rounded-xl px-4 py-3 bg-card">
          <View>
            <Text className="text-text font-medium">@{selected.username}</Text>
            <Text className="text-muted text-xs">{selected.email ?? selected.phone}</Text>
          </View>
          <TouchableOpacity onPress={() => { onSelect(null as unknown as User); setQ(''); }}>
            <Text className="text-danger text-sm font-medium">{t.userSearch.change}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-text mb-1.5">{label}</Text>
      <View className="border border-border rounded-xl bg-card overflow-hidden">
        <View className="flex-row items-center px-4 py-3 border-b border-border">
          <TextInput
            className="flex-1 text-text text-base"
            placeholder={t.userSearch.placeholder}
            placeholderTextColor={brand.mutedSubtle}
            value={q}
            onChangeText={setQ}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {isFetching && <ActivityIndicator size="small" color={brand.primary} />}
        </View>
        {(data as User[] | undefined)?.map((user) => (
          <TouchableOpacity
            key={user.id}
            onPress={() => onSelect(user)}
            className="px-4 py-3 border-b border-border last:border-b-0"
          >
            <Text className="text-text font-medium">@{user.username}</Text>
            <Text className="text-muted text-xs">{user.email ?? user.phone}</Text>
          </TouchableOpacity>
        ))}
        {q.trim().length >= 2 && !isFetching && (data as User[] | undefined)?.length === 0 && (
          <Text className="text-muted text-sm px-4 py-3">{t.userSearch.noUsers}</Text>
        )}
      </View>
    </View>
  );
}
