import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useT } from '../../lib/i18n';

function TabIcon({ label, emoji, focused }: { label: string; emoji: string; focused: boolean }) {
  return (
    <View className="items-center justify-center pt-1">
      <Text className="text-xl">{emoji}</Text>
      <Text className={`text-[10px] mt-0.5 ${focused ? 'text-primary font-semibold' : 'text-muted dark:text-slate-500'}`}>
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const t = useT();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          borderTopColor: isDark ? '#334155' : '#E2E8F0',
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
          tabBarIcon: ({ focused }) => (
            <TabIcon label={t.tabs.inventory} emoji="📦" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="network"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label={t.tabs.network} emoji="🤝" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon label={t.tabs.sales} emoji="💰" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
