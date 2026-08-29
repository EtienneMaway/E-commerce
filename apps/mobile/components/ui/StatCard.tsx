import { View, Text } from 'react-native';

interface Props {
  label: string;
  value: string;
  sub?: string;
  color?: 'default' | 'danger' | 'success' | 'warning';
  /** Extra NativeWind classes appended to the card container (e.g. spacing). */
  className?: string;
}

const colorMap = {
  default: 'text-text',
  danger: 'text-danger',
  success: 'text-success',
  warning: 'text-warning',
};

export function StatCard({ label, value, sub, color = 'default', className = '' }: Props) {
  return (
    <View className={`bg-card rounded-2xl p-4 flex-1 shadow-sm border border-border ${className}`}>
      <Text className="text-muted text-sm font-medium uppercase tracking-wide mb-1">{label}</Text>
      <Text className={`text-2xl font-bold ${colorMap[color]}`}>{value}</Text>
      {sub ? <Text className="text-muted text-sm mt-0.5">{sub}</Text> : null}
    </View>
  );
}
