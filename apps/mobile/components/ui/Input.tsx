import { View, Text, TextInput, TextInputProps } from 'react-native';

interface Props extends TextInputProps {
  label: string;
  error?: string;
}

export function Input({ label, error, ...props }: Props) {
  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-text dark:text-slate-100 mb-1.5">{label}</Text>
      <TextInput
        {...props}
        className={`border rounded-xl px-4 py-3 text-text dark:text-slate-100 bg-card dark:bg-slate-800 text-base ${
          error ? 'border-danger' : 'border-border dark:border-slate-700'
        }`}
        placeholderTextColor="#94A3B8"
      />
      {error ? <Text className="text-danger text-xs mt-1">{error}</Text> : null}
    </View>
  );
}
