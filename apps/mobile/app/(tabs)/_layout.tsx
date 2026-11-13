import { Tabs } from 'expo-router';
import { View, Text, Pressable } from 'react-native';
import Animated, { LinearTransition, FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../../lib/i18n';
import { usePermissions } from '../../lib/permissions';
import { useBrand } from '../../lib/theme';
import { Icon, type IconName } from '../../components/ui/Icon';

/** The props expo-router's Tabs hands a custom tab bar. */
type BottomTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONS: Record<string, IconName> = {
  index: 'home',
  inventory: 'package',
  network: 'users',
  sales: 'trending-up',
};

/**
 * Floating tab bar: a paper capsule above the gesture area. The active tab
 * grows into a malachite pill with its label (animated layout, Reanimated);
 * the others are icons only, so four tabs fit the narrowest phones without the
 * label clipping the old emoji bar suffered from.
 *
 * Tabs hidden by role (`href: null`) are skipped, exactly as the default bar
 * did.
 */
function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const brand = useBrand();
  return (
    <View className="bg-background px-4" style={{ paddingBottom: Math.max(insets.bottom, 10), paddingTop: 6 }}>
      <View
        className="flex-row items-center justify-between bg-card border border-border rounded-full p-1.5"
        style={{ boxShadow: '0px 14px 30px -14px rgba(40, 30, 10, 0.35)' }}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          // expo-router sets href: null on hidden tabs.
          if ((options as { href?: unknown }).href === null) return null;
          const focused = state.index === index;
          const label = typeof options.title === 'string' ? options.title : route.name;
          const onPress = (): void => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
              className="flex-1 items-center"
              hitSlop={4}
            >
              <Animated.View
                layout={LinearTransition.springify().damping(18).stiffness(180)}
                className={`flex-row items-center justify-center rounded-full h-12 ${
                  focused ? 'bg-primary px-4' : 'px-3'
                }`}
              >
                <Icon name={ICONS[route.name] ?? 'circle'} size={20} color={focused ? brand.onPrimary : brand.muted} />
                {focused && (
                  <Animated.View entering={FadeIn.duration(180)}>
                    <Text className="text-white font-semibold text-[13px] ml-2" numberOfLines={1}>
                      {label}
                    </Text>
                  </Animated.View>
                )}
              </Animated.View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const t = useT();
  const { can, canAny } = usePermissions();

  // `href: null` removes the tab from the bar AND makes the route
  // unreachable by deep link, so there is no screen to guard separately.
  // Home always stays: it carries salary and the handover entry points.
  const hidden = { href: null } as const;

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: t.tabs.home }} />
      <Tabs.Screen
        name="inventory"
        options={{ title: t.tabs.inventory, ...(can('inventory.view') ? {} : hidden) }}
      />
      <Tabs.Screen
        // Network is suppliers-only on mobile — debtor and contact flows live
        // on the dashboard.
        name="network"
        options={{ title: t.tabs.network, ...(can('suppliers.view') ? {} : hidden) }}
      />
      <Tabs.Screen
        name="sales"
        options={{ title: t.tabs.sales, ...(canAny('sales.history', 'sales.record') ? {} : hidden) }}
      />
    </Tabs>
  );
}
