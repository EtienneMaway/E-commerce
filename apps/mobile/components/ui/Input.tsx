import { useState } from 'react';
import { View, Text, TextInput, TextInputProps, TouchableOpacity } from 'react-native';

interface Props extends TextInputProps {
  label: string;
  error?: string;
  /** When true, renders an eye icon that toggles password visibility */
  passwordToggle?: boolean;
}

export function Input({ label, error, passwordToggle, ...props }: Props) {
  const [visible, setVisible] = useState(false);
  const isSecure = passwordToggle ? !visible : !!props.secureTextEntry;

  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-text dark:text-slate-100 mb-1.5">{label}</Text>
      <View style={{ position: 'relative' }}>
        <TextInput
          {...props}
          secureTextEntry={isSecure}
          className={`border rounded-xl px-4 py-3 text-text dark:text-slate-100 bg-card dark:bg-slate-800 text-base ${
            passwordToggle ? 'pr-12' : ''
          } ${error ? 'border-danger' : 'border-border dark:border-slate-700'}`}
          placeholderTextColor="#94A3B8"
        />
        {passwordToggle && (
          <TouchableOpacity
            onPress={() => setVisible((v) => !v)}
            hitSlop={8}
            style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 17, lineHeight: 22 }}>{visible ? '🙈' : '👁'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text className="text-danger text-xs mt-1">{error}</Text> : null}
    </View>
  );
}
