import { Pressable, Text, ActivityIndicator, View, ViewStyle } from 'react-native';
import { useBrand } from '../../lib/theme';
import { Icon, type IconName } from './Icon';

interface Props {
  label: string;
  loading?: boolean;
  variant?: 'primary' | 'danger' | 'ghost' | 'outline' | 'ink';
  disabled?: boolean;
  className?: string;
  onPress?: () => void;
  style?: ViewStyle;
  /** Optional leading icon. */
  icon?: IconName;
}

const variantStyles = {
  primary: { btn: 'bg-primary', text: 'text-white', shadow: '0px 10px 20px -10px rgba(14, 122, 91, 0.7)' },
  danger: { btn: 'bg-danger', text: 'text-white', shadow: '0px 10px 20px -10px rgba(178, 58, 43, 0.6)' },
  ink: { btn: 'bg-text', text: 'text-background', shadow: '0px 10px 20px -12px rgba(0, 0, 0, 0.5)' },
  ghost: { btn: 'bg-transparent', text: 'text-primary', shadow: undefined },
  outline: { btn: 'bg-transparent border border-border', text: 'text-text', shadow: undefined },
};

/** Pill buttons. Filled variants carry a coloured drop shadow and press-shrink. */
export function Button({ label, loading, variant = 'primary', disabled, className, onPress, style, icon }: Props) {
  const brand = useBrand();
  const v = variantStyles[variant];
  const isDisabled = disabled || loading;
  const filled = variant === 'primary' || variant === 'danger' || variant === 'ink';
  const iconColor = filled ? (variant === 'ink' ? brand.background : brand.onPrimary) : variant === 'ghost' ? brand.primary : brand.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`rounded-full py-4 px-6 items-center justify-center ${v.btn} ${isDisabled ? 'opacity-50' : ''} ${className ?? ''}`}
      style={({ pressed }) => [
        v.shadow && !isDisabled ? { boxShadow: v.shadow } : null,
        style,
        { transform: [{ scale: pressed && !isDisabled ? 0.97 : 1 }], opacity: pressed && !isDisabled ? 0.9 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={filled ? iconColor : brand.primary} />
      ) : (
        <View className="flex-row items-center gap-2">
          {icon ? <Icon name={icon} size={18} color={iconColor} /> : null}
          <Text className={`font-semibold text-base ${v.text}`}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}
