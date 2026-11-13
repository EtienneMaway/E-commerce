import { Pressable, Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { CARD_SHADOW } from './Card';

interface Props {
  readonly icon: IconName;
  readonly title: string;
  readonly subtitle?: string;
  readonly onPress: () => void;
  /** A count waiting for the user (copper pill). Hidden at 0. */
  readonly badge?: number;
  /** Icon chip colour. */
  readonly tone?: 'primary' | 'accent' | 'warning' | 'danger';
  readonly className?: string;
  /** Greyed out and not tappable (e.g. a handover already waiting). */
  readonly disabled?: boolean;
}

const chip = {
  primary: { bg: 'bg-primary-light', icon: 'primary' as const },
  accent: { bg: 'bg-accent-light', icon: 'violet' as const },
  warning: { bg: 'bg-warning-light', icon: 'warning' as const },
  danger: { bg: 'bg-danger-light', icon: 'danger' as const },
};

/** A tappable row into a section: icon chip, title + hint, count, chevron. */
export function NavRow({ icon, title, subtitle, onPress, badge = 0, tone = 'primary', className = '', disabled = false }: Props) {
  const c = chip[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`flex-row items-center bg-card border border-border rounded-3xl px-4 py-3.5 mb-3 ${className}`}
      style={({ pressed }) => ({
        boxShadow: CARD_SHADOW,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      <View className={`w-11 h-11 rounded-2xl items-center justify-center mr-3.5 ${c.bg}`}>
        <Icon name={icon} size={20} tone={c.icon} />
      </View>
      <View className="flex-1">
        <Text className={`font-semibold text-[15px] ${tone === 'danger' ? 'text-danger' : 'text-text'}`}>{title}</Text>
        {subtitle ? (
          <Text className="text-muted text-xs mt-0.5" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {badge > 0 ? (
        <View className="bg-accent rounded-full min-w-[24px] h-6 px-2 items-center justify-center mr-2">
          <Text className="text-white font-mono-bold text-xs">{badge}</Text>
        </View>
      ) : null}
      {disabled ? null : <Icon name="chevron-right" size={18} tone="muted" />}
    </Pressable>
  );
}
