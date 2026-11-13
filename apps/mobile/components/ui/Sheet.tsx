import { useEffect } from 'react';
import { Dimensions, Modal, Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './Icon';

/** Glow colours per tone — literal rgba because they feed gradients and shadows. */
const TONES = {
  primary: { solid: '#0E7A5B', glow: 'rgba(14, 122, 91, ', light: 'rgba(95, 217, 174, ' },
  warning: { solid: '#B06A0C', glow: 'rgba(214, 140, 30, ', light: 'rgba(240, 190, 100, ' },
  accent: { solid: '#C25E27', glow: 'rgba(194, 94, 39, ', light: 'rgba(240, 154, 96, ' },
} as const;
export type SheetTone = keyof typeof TONES;

/** A ring that grows and fades out, over and over — the "breathing" light. */
function PulseRing({ tone, delay }: { tone: SheetTone; delay: number }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }), -1, false));
    return () => cancelAnimation(p);
  }, [delay, p, reduce]);
  const style = useAnimatedStyle(() => ({
    opacity: reduce ? 0 : 0.55 * (1 - p.value),
    transform: [{ scale: 1 + p.value * 0.9 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      className="absolute w-20 h-20 rounded-full"
      style={[{ borderWidth: 2, borderColor: TONES[tone].solid }, style]}
    />
  );
}

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly icon: IconName;
  readonly tone?: SheetTone;
  readonly title: string;
  readonly subtitle?: string;
  readonly children?: React.ReactNode;
  /** Buttons, stacked under the content. */
  readonly actions?: React.ReactNode;
}

/**
 * A bottom sheet with a lit header: the icon sits in a glowing halo with two
 * rings breathing out of it, and a soft wash of the tone colour falls from the
 * top edge. Used for decisions that deserve a moment — going offline, choosing
 * whose books you are on — instead of a bare system alert.
 *
 * Motion respects the OS "reduce motion" setting.
 */
export function Sheet({ visible, onClose, icon, tone = 'primary', title, subtitle, children, actions }: Props) {
  const insets = useSafeAreaInsets();
  const c = TONES[tone];
  return (
    // Both translucent flags: on Android 15 (edge-to-edge) a modal otherwise
    // stops above the navigation bar, leaving the tab bar showing under the sheet.
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={onClose}
    >
      {visible && (
        // Sized to the physical screen (it includes the navigation bar): a
        // flex-1 root stops short of the bottom edge under edge-to-edge.
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: Dimensions.get('screen').height, justifyContent: 'flex-end' }}>
          <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)} className="absolute inset-0">
            <Pressable className="flex-1" style={{ backgroundColor: 'rgba(8, 14, 12, 0.55)' }} onPress={onClose} />
          </Animated.View>

          <Animated.View
            entering={SlideInDown.springify().damping(20).stiffness(160)}
            exiting={SlideOutDown.duration(200)}
            className="bg-card rounded-t-[32px] px-6 pt-3 overflow-hidden"
            style={{
              paddingBottom: Math.max(insets.bottom, 24) + 16,
              experimental_backgroundImage: `radial-gradient(90% 55% at 50% 0%, ${c.light}0.32) 0%, ${c.light}0) 70%)`,
              boxShadow: '0px -18px 40px -20px rgba(0, 0, 0, 0.45)',
            }}
          >
            <View className="self-center w-10 h-1.5 rounded-full bg-muted-subtle mb-7" />

            <View className="items-center mb-5">
              <View className="w-24 h-24 items-center justify-center">
                <PulseRing tone={tone} delay={0} />
                <PulseRing tone={tone} delay={1100} />
                <View
                  className="w-20 h-20 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: c.solid,
                    experimental_backgroundImage: `radial-gradient(70% 70% at 35% 30%, ${c.light}0.75) 0%, ${c.glow}0) 70%)`,
                    boxShadow: `0px 0px 28px 2px ${c.glow}0.55)`,
                  }}
                >
                  <Icon name={icon} size={32} color="#FFFFFF" />
                </View>
              </View>
            </View>

            <Text className="font-display text-[26px] leading-[30px] text-text text-center">{title}</Text>
            {subtitle ? <Text className="text-muted text-sm text-center mt-2 leading-5">{subtitle}</Text> : null}

            {children ? <View className="mt-5">{children}</View> : null}
            {actions ? <View className="mt-6 gap-2.5">{actions}</View> : null}
          </Animated.View>
        </View>
      )}
    </Modal>
  );
}

/** One line of a sheet's explanation: an icon chip and a sentence. */
export function SheetPoint({ icon, text, tone = 'primary' }: { icon: IconName; text: string; tone?: SheetTone }) {
  return (
    <View className="flex-row items-center gap-3 mb-3">
      <View
        className="w-9 h-9 rounded-2xl items-center justify-center"
        style={{ backgroundColor: `${TONES[tone].glow}0.12)` }}
      >
        <Icon name={icon} size={16} color={TONES[tone].solid} />
      </View>
      <Text className="text-text-secondary text-[14px] flex-1 leading-5">{text}</Text>
    </View>
  );
}
