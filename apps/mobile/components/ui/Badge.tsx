import { View, Text } from 'react-native';

type Variant = 'supplier' | 'personal' | 'consigned' | 'loss' | 'profit' | 'warning' | 'pending' | 'approved' | 'rejected';

/**
 * Chips. Each pairs a `-light` token with its full token (`bg-danger-light` +
 * `text-danger`), so it stays a tinted block with legible text in both themes.
 * Copper (`accent`) carries the one categorical colour, consigned stock.
 */
const styles: Record<Variant, { bg: string; text: string; label: string }> = {
  supplier:  { bg: 'bg-primary-light', text: 'text-primary', label: 'Supplier'  },
  personal:  { bg: 'bg-surface',       text: 'text-text-secondary', label: 'Personal' },
  consigned: { bg: 'bg-accent-light',  text: 'text-accent',  label: 'Consigned' },
  loss:      { bg: 'bg-danger-light',  text: 'text-danger',  label: 'Loss'      },
  profit:    { bg: 'bg-success-light', text: 'text-success', label: 'Profit'    },
  warning:   { bg: 'bg-warning-light', text: 'text-warning', label: 'Warning'   },
  pending:   { bg: 'bg-warning-light', text: 'text-warning', label: 'Pending'   },
  approved:  { bg: 'bg-success-light', text: 'text-success', label: 'Approved'  },
  rejected:  { bg: 'bg-danger-light',  text: 'text-danger',  label: 'Rejected'  },
};

interface Props { variant: Variant; label?: string; }

export function Badge({ variant, label }: Props) {
  const s = styles[variant];
  return (
    <View className={`${s.bg} rounded-full px-2.5 py-1 self-start`}>
      <Text className={`${s.text} font-mono text-[10px] uppercase tracking-wider`}>{label ?? s.label}</Text>
    </View>
  );
}
