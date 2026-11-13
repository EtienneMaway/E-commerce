import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KmbLogo } from './ui/KmbLogo';
import { CARD_SHADOW } from './ui/Card';
import { useT } from '../lib/i18n';

interface Props {
  readonly title: string;
  readonly subtitle?: string;
  readonly children: React.ReactNode;
  /** Links under the form (sign up / sign in / pair). */
  readonly footer?: React.ReactNode;
}

/**
 * Login / register frame: the site's malachite band with its tagline, and the
 * form on a paper sheet pulled up over it.
 */
export function AuthShell({ title, subtitle, children, footer }: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="flex-grow" keyboardShouldPersistTaps="handled">
      <View
        className="px-6 pb-16"
        style={{
          paddingTop: insets.top + 28,
          backgroundColor: '#0B3A2F',
          experimental_backgroundImage:
            'radial-gradient(110% 80% at 100% 0%, rgba(240,154,96,0.38) 0%, rgba(240,154,96,0) 60%), radial-gradient(80% 70% at 0% 100%, rgba(95,217,174,0.2) 0%, rgba(95,217,174,0) 65%)',
        }}
      >
        <Animated.View entering={FadeInDown.duration(500)} className="flex-row items-center gap-3">
          <KmbLogo size={40} />
          <Text className="font-bold text-2xl" style={{ color: '#EFE8D8' }}>
            KMB-Talk
          </Text>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(120).duration(600)} className="mt-8">
          <Text className="font-bold text-[34px] leading-[38px]" style={{ color: '#EFE8D8' }}>
            {t.auth.heroLine1}
          </Text>
          <Text className="font-bold italic text-[34px] leading-[40px]" style={{ color: '#F09A60' }}>
            {t.auth.heroLine2}
          </Text>
        </Animated.View>
      </View>

      <Animated.View
        entering={FadeInUp.delay(200).duration(520)}
        className="flex-1 bg-background rounded-t-[32px] px-6 pt-7 pb-10 -mt-8"
      >
        <Text className="font-bold text-[26px] text-text">{title}</Text>
        {subtitle ? <Text className="text-muted text-sm mt-1 mb-6">{subtitle}</Text> : <View className="mb-6" />}
        <View className="bg-card border border-border rounded-3xl p-5" style={{ boxShadow: CARD_SHADOW }}>
          {children}
        </View>
        {footer ? <View className="mt-6 gap-3 items-center">{footer}</View> : null}
      </Animated.View>
    </ScrollView>
  );
}
