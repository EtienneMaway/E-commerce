import { TouchableOpacity, Text, ActivityIndicator, TouchableOpacityProps } from 'react-native';

interface Props extends TouchableOpacityProps {
  label: string;
  loading?: boolean;
  variant?: 'primary' | 'danger' | 'ghost' | 'outline';
}

const variantStyles = {
  primary: { btn: 'bg-primary', text: 'text-white' },
  danger: { btn: 'bg-danger', text: 'text-white' },
  ghost: { btn: 'bg-transparent', text: 'text-primary' },
  outline: { btn: 'bg-transparent border border-primary', text: 'text-primary' },
};

export function Button({ label, loading, variant = 'primary', disabled, className, ...props }: Props) {
  const styles = variantStyles[variant];
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      {...props}
      disabled={isDisabled}
      className={`rounded-xl py-3.5 px-5 items-center justify-center ${styles.btn} ${isDisabled ? 'opacity-50' : ''} ${className ?? ''}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : '#2563EB'} />
      ) : (
        <Text className={`font-semibold text-base ${styles.text}`}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}
