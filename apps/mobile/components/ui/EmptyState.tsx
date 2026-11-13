import { View, Text } from 'react-native';
import { Icon, type IconName } from './Icon';

interface Props {
  /** Kept for existing callers: mapped to a line icon (see EMOJI_ICON). */
  emoji?: string;
  icon?: IconName;
  title: string;
  subtitle?: string;
}

/** The emoji screens used to pass, as the icon each now gets. */
const EMOJI_ICON: Record<string, IconName> = {
  '📦': 'package',
  '🤲': 'repeat',
  '🤝': 'users',
  '🚚': 'truck',
  '📥': 'download',
  '💳': 'credit-card',
  '💰': 'dollar-sign',
  '🏢': 'briefcase',
  '🏆': 'award',
  '❓': 'help-circle',
  '⛔': 'slash',
  '⚖️': 'sliders',
  '📭': 'inbox',
  '✅': 'check-circle',
  '📒': 'book-open',
};

export function EmptyState({ emoji, icon, title, subtitle }: Props) {
  const name = icon ?? (emoji ? EMOJI_ICON[emoji] : undefined) ?? 'inbox';
  return (
    <View className="flex-1 items-center justify-center py-16 px-8">
      <View className="w-20 h-20 rounded-full items-center justify-center mb-5 border border-dashed border-muted-subtle bg-surface">
        <Icon name={name} size={30} tone="muted" />
      </View>
      <Text className="font-display text-xl text-text text-center">{title}</Text>
      {subtitle ? <Text className="text-muted text-sm text-center mt-2 leading-5">{subtitle}</Text> : null}
    </View>
  );
}
