import { View, Text } from 'react-native';

type Variant = 'supplier' | 'personal' | 'consigned' | 'loss' | 'profit' | 'warning';

const styles: Record<Variant, { bg: string; text: string; label: string }> = {
  supplier:  { bg: 'bg-blue-100',   text: 'text-blue-700',  label: 'Supplier'   },
  personal:  { bg: 'bg-slate-100',  text: 'text-slate-600', label: 'Personal'   },
  consigned: { bg: 'bg-purple-100', text: 'text-purple-700',label: 'Consigned'  },
  loss:      { bg: 'bg-red-100',    text: 'text-red-700',   label: 'Loss'       },
  profit:    { bg: 'bg-green-100',  text: 'text-green-700', label: 'Profit'     },
  warning:   { bg: 'bg-amber-100',  text: 'text-amber-700', label: 'Warning'    },
};

interface Props { variant: Variant; label?: string; }

export function Badge({ variant, label }: Props) {
  const s = styles[variant];
  return (
    <View className={`${s.bg} rounded-full px-2.5 py-0.5 self-start`}>
      <Text className={`${s.text} text-xs font-medium`}>{label ?? s.label}</Text>
    </View>
  );
}
