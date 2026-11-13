import { View, Text } from 'react-native';

interface Props {
  /** Small mono line above the title (section, date, branch…). */
  readonly kicker?: string;
  readonly title: string;
  readonly subtitle?: string;
  /** Controls on the right (icon buttons). */
  readonly right?: React.ReactNode;
}

/** Page title in the serif, with a copper mono kicker — the site's section heads. */
export function ScreenHeader({ kicker, title, subtitle, right }: Props) {
  return (
    <View className="flex-row items-end justify-between mb-5">
      <View className="flex-1 pr-3">
        {kicker ? (
          <Text className="font-mono text-[10px] uppercase tracking-widest text-accent mb-1.5" numberOfLines={1}>
            {kicker}
          </Text>
        ) : null}
        <Text className="font-display text-[32px] leading-[36px] text-text" numberOfLines={1} adjustsFontSizeToFit>
          {title}
        </Text>
        {subtitle ? <Text className="text-muted text-sm mt-1">{subtitle}</Text> : null}
      </View>
      {right ? <View className="flex-row items-center gap-2 pb-1">{right}</View> : null}
    </View>
  );
}
