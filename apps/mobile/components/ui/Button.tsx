import { Pressable, Text, ActivityIndicator, ViewStyle } from 'react-native';

interface Props {
  label: string;
  loading?: boolean;
  variant?: 'primary' | 'danger' | 'ghost' | 'outline';
  disabled?: boolean;
  className?: string;
  onPress?: () => void;
  style?: ViewStyle;
}

const variantStyles = {
  primary: { btn: 'bg-primary', text: 'text-white' },
  danger: { btn: 'bg-danger', text: 'text-white' },
  ghost: { btn: 'bg-transparent', text: 'text-primary' },
  outline: { btn: 'bg-transparent border border-primary', text: 'text-primary' },
};

export function Button({ label, loading, variant = 'primary', disabled, className, onPress, style }: Props) {
  const styles = variantStyles[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`rounded-xl py-3.5 px-5 items-center justify-center ${styles.btn} ${isDisabled ? 'opacity-50' : ''} ${className ?? ''}`}
      style={({ pressed }) => [
        style,
        { transform: [{ scale: pressed && !isDisabled ? 0.97 : 1 }], opacity: pressed && !isDisabled ? 0.88 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : '#2563EB'} />
      ) : (
        <Text className={`font-semibold text-base ${styles.text}`}>{label}</Text>
      )}
    </Pressable>
  );
}
