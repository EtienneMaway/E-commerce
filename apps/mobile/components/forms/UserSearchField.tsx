import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useT } from '../../lib/i18n';

interface User { id: string; username: string; email: string | null; phone: string | null; }

interface Props {
  label: string;
  selected: User | null;
  onSelect: (user: User) => void;
}

export function UserSearchField({ label, selected, onSelect }: Props) {
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
        <Text className="text-sm font-medium text-text dark:text-slate-100 mb-1.5">{label}</Text>
        <View className="flex-row items-center justify-between border border-border dark:border-slate-700 rounded-xl px-4 py-3 bg-card dark:bg-slate-800">
          <View>
            <Text className="text-text dark:text-slate-100 font-medium">@{selected.username}</Text>
            <Text className="text-muted dark:text-slate-500 text-xs">{selected.email ?? selected.phone}</Text>
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
      <Text className="text-sm font-medium text-text dark:text-slate-100 mb-1.5">{label}</Text>
      <View className="border border-border dark:border-slate-700 rounded-xl bg-card dark:bg-slate-800 overflow-hidden">
        <View className="flex-row items-center px-4 py-3 border-b border-border dark:border-slate-700">
          <TextInput
            className="flex-1 text-text dark:text-slate-100 text-base"
            placeholder={t.userSearch.placeholder}
            placeholderTextColor="#94A3B8"
            value={q}
            onChangeText={setQ}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {isFetching && <ActivityIndicator size="small" color="#2563EB" />}
        </View>
        {(data as User[] | undefined)?.map((user) => (
          <TouchableOpacity
            key={user.id}
            onPress={() => onSelect(user)}
            className="px-4 py-3 border-b border-border dark:border-slate-700 last:border-b-0"
          >
            <Text className="text-text dark:text-slate-100 font-medium">@{user.username}</Text>
            <Text className="text-muted dark:text-slate-500 text-xs">{user.email ?? user.phone}</Text>
          </TouchableOpacity>
        ))}
        {q.trim().length >= 2 && !isFetching && (data as User[] | undefined)?.length === 0 && (
          <Text className="text-muted dark:text-slate-500 text-sm px-4 py-3">{t.userSearch.noUsers}</Text>
        )}
      </View>
    </View>
  );
}
