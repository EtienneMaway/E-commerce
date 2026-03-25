import { View, Text } from 'react-native';

interface Props {
  label: string;
  value: string;
  sub?: string;
  color?: 'default' | 'danger' | 'success' | 'warning';
}

const colorMap = {
  default: 'text-text dark:text-slate-100',
  danger: 'text-danger',
  success: 'text-success',
  warning: 'text-warning',
};

export function StatCard({ label, value, sub, color = 'default' }: Props) {
  return (
    <View className="bg-card dark:bg-slate-800 rounded-2xl p-4 flex-1 shadow-sm border border-border dark:border-slate-700">
      <Text className="text-muted dark:text-slate-500 text-sm font-medium uppercase tracking-wide mb-1">{label}</Text>
      <Text className={`text-2xl font-bold ${colorMap[color]}`}>{value}</Text>
      {sub ? <Text className="text-muted dark:text-slate-500 text-sm mt-0.5">{sub}</Text> : null}
    </View>
  );
}
