import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';

function TabIcon({ emoji, label, focused }: { emoji: string; label: string; focused: boolean }) {
  return (
    <View style={[tabStyles.iconWrap, focused && tabStyles.iconWrapActive]}>
      <Text style={tabStyles.emoji}>{emoji}</Text>
      {focused && <Text style={tabStyles.label}>{label}</Text>}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    minWidth: 56,
  },
  iconWrapActive: {
    backgroundColor: 'rgba(255, 107, 53, 0.12)',
  },
  emoji: { fontSize: 22 },
  label: { fontSize: 10, fontWeight: '700', color: '#FF6B35', marginTop: 2 },
});

export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: 0,
          elevation: 0,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : 'rgba(255,255,255,0.95)',
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView
              intensity={80}
              style={StyleSheet.absoluteFill}
              tint="light"
            />
          ) : null,
        tabBarActiveTintColor: '#FF6B35',
        tabBarInactiveTintColor: '#AAA',
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🏠" label={t('home')} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="📷" label={t('scanner')} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="food-library"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🍎" label={t('foodLibrary')} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="data-vault"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="📊" label={t('dataVault')} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
