import { View, Text } from 'react-native';

type Variant = 'supplier' | 'personal' | 'consigned' | 'loss' | 'profit' | 'warning' | 'pending' | 'approved' | 'rejected';

/**
 * Chip styles.
 *
 * The semantic variants use the `-light` token pair (`bg-danger-light` +
 * `text-danger`), which is the dashboard's `.btn-danger` recipe and flips
 * itself in dark mode — `--danger-light` goes #FEF2F2 → #2D1515 while
 * `--danger` goes #EF4444 → #F87171, so the chip stays a tinted block with
 * legible text in both themes.
 *
 * `consigned` is the one categorical colour with no token behind it, so it
 * carries an explicit `dark:` pair. That is the rule for the raw Tailwind
 * palette generally: unlike a token, `bg-purple-100` cannot flip on its own.
 */
const styles: Record<Variant, { bg: string; text: string; label: string }> = {
  supplier:  { bg: 'bg-primary-light', text: 'text-primary', label: 'Supplier'  },
  personal:  { bg: 'bg-background',    text: 'text-muted',   label: 'Personal'  },
  consigned: { bg: 'bg-purple-100 dark:bg-purple-950', text: 'text-purple-700 dark:text-purple-300', label: 'Consigned' },
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
    <View className={`${s.bg} rounded-full px-2.5 py-0.5 self-start`}>
      <Text className={`${s.text} text-xs font-medium`}>{label ?? s.label}</Text>
    </View>
  );
}
