import { View, Text } from 'react-native';
import { CARD_SHADOW } from './Card';

interface Props {
  label: string;
  value: string;
  sub?: string;
  color?: 'default' | 'danger' | 'success' | 'warning';
  /** Extra NativeWind classes appended to the card container (e.g. spacing). */
  className?: string;
}

const valueColor = {
  default: 'text-text',
  danger: 'text-danger',
  success: 'text-success',
  warning: 'text-warning',
};
const dotColor = {
  default: 'bg-muted',
  danger: 'bg-danger',
  success: 'bg-success',
  warning: 'bg-warning',
};

/** A ledger figure: small mono label with a tone dot, the amount in the serif. */
export function StatCard({ label, value, sub, color = 'default', className = '' }: Props) {
  return (
    <View
      className={`bg-card rounded-3xl px-4 pt-3.5 pb-4 flex-1 border border-border ${className}`}
      style={{ boxShadow: CARD_SHADOW }}
    >
      <View className="flex-row items-center gap-1.5 mb-2">
        <View className={`w-1.5 h-1.5 rounded-full ${dotColor[color]}`} />
        <Text className="font-mono text-[10px] uppercase tracking-widest text-muted" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text className={`font-display text-2xl ${valueColor[color]}`} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? <Text className="text-muted text-xs mt-1">{sub}</Text> : null}
    </View>
  );
}
