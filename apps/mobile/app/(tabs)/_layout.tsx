import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { useBrand } from '../../lib/theme';
import { useT } from '../../lib/i18n';
import { usePermissions } from '../../lib/permissions';

function TabIcon({ label, emoji, focused }: { label: string; emoji: string; focused: boolean }) {
  return (
    <View className="items-center justify-center pt-1">
      <Text className="text-xl">{emoji}</Text>
      {/* One line always: at narrow tab widths "Inventory" was wrapping to
          "Invent / ory", which looked broken in screenshots and on small phones. */}
      <Text
        numberOfLines={1}
        className={`text-[10px] mt-0.5 ${focused ? 'text-primary font-semibold' : 'text-muted'}`}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const brand = useBrand();
  const t = useT();
  const { can, canAny } = usePermissions();

  // `href: null` removes the tab from the bar AND makes the route
  // unreachable by deep link, so there is no screen to guard separately.
  // Home always stays: it carries salary and the handover entry points.
  const hidden = { href: null } as const;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: brand.card,
          borderTopColor: brand.border,
          height: 64,
          paddingBottom: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label={t.tabs.home} emoji="🏠" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          ...(can('inventory.view') ? {} : hidden),
          tabBarIcon: ({ focused }) => (
            <TabIcon label={t.tabs.inventory} emoji="📦" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="network"
        options={{
          // Network is suppliers-only on mobile — debtor and contact flows
          // live on the dashboard.
          ...(can('suppliers.view') ? {} : hidden),
          tabBarIcon: ({ focused }) => (
            <TabIcon label={t.tabs.network} emoji="🤝" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          ...(canAny('sales.history', 'sales.record') ? {} : hidden),
          tabBarIcon: ({ focused }) => (
            <TabIcon label={t.tabs.sales} emoji="💰" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
