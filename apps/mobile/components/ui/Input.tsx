import { useState } from 'react';
import { View, Text, TextInput, TextInputProps, TouchableOpacity } from 'react-native';
import { useBrand } from '../../lib/theme';
import { Icon } from './Icon';

interface Props extends TextInputProps {
  label: string;
  error?: string;
  /** When true, renders an eye icon that toggles password visibility */
  passwordToggle?: boolean;
}

export function Input({ label, error, passwordToggle, onFocus, onBlur, ...props }: Props) {
  const brand = useBrand();
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const isSecure = passwordToggle ? !visible : !!props.secureTextEntry;

  return (
    <View className="mb-4">
      <Text className="font-mono text-[10px] uppercase tracking-widest text-muted mb-2">{label}</Text>
      <View style={{ position: 'relative' }}>
        <TextInput
          {...props}
          secureTextEntry={isSecure}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          className={`border rounded-2xl px-4 py-3.5 text-text bg-card text-base ${passwordToggle ? 'pr-12' : ''} ${
            error ? 'border-danger' : focused ? 'border-primary' : 'border-border'
          }`}
          placeholderTextColor={brand.mutedSubtle}
        />
        {passwordToggle && (
          <TouchableOpacity
            onPress={() => setVisible((v) => !v)}
            hitSlop={8}
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
            style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
          >
            <Icon name={visible ? 'eye-off' : 'eye'} size={18} tone="muted" />
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text className="text-danger text-xs mt-1.5">{error}</Text> : null}
    </View>
  );
}
