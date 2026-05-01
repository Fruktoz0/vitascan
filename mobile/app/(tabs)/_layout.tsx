import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../../src/design/tokens';

// HTML-beli ikonok: home, menu_book, qr_code_scanner, person
// MaterialIcons megfelelő nevei:
const ICON_MAP: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  home: 'home',
  diary: 'menu-book',
  scan: 'qr-code-scanner',
  profile: 'person',
};

export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          // HTML: bg-surface border-t-[0.8px] border-on-background rounded-t-[32px]
          backgroundColor: Colors.dashboard.tabBg,
          borderTopWidth: 1.5,
          borderTopColor: Colors.dashboard.stroke,
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          // HTML: shadow-[0px_-4px_0px_0px_rgba(28,27,27,1)] – felső szilárd árnyék
          shadowColor: Colors.dashboard.shadowHard,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 1,
          shadowRadius: 0,
          elevation: 0,
          height: Platform.OS === 'ios' ? 88 : 72,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
        },
        tabBarActiveTintColor: Colors.dashboard.stroke,
        tabBarInactiveTintColor: Colors.dashboard.tabInactive,
        tabBarItemStyle: {
          alignItems: 'center',
          justifyContent: 'center',
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('home'),
          tabBarIcon: ({ color, focused }) => (
            <View style={[tabStyles.itemWrap, focused && tabStyles.activeWrap]}>
              {focused && <View style={tabStyles.activeShadow} />}
              <View style={[tabStyles.itemInner, focused && tabStyles.activeInner]}>
                <MaterialIcons name={ICON_MAP.home} size={24} color={color} />
                <Text style={[tabStyles.label, { color }]}>{t('home')}</Text>
              </View>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="food-library"
        options={{
          title: t('foodLibrary'),
          tabBarIcon: ({ color, focused }) => (
            <View style={[tabStyles.itemWrap, focused && tabStyles.activeWrap]}>
              {focused && <View style={tabStyles.activeShadow} />}
              <View style={[tabStyles.itemInner, focused && tabStyles.activeInner]}>
                <MaterialIcons name={ICON_MAP.diary} size={24} color={color} />
                <Text style={[tabStyles.label, { color }]}>{t('foodLibrary')}</Text>
              </View>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: t('scanner'),
          tabBarIcon: ({ color, focused }) => (
            <View style={[tabStyles.itemWrap, focused && tabStyles.activeWrap]}>
              {focused && <View style={tabStyles.activeShadow} />}
              <View style={[tabStyles.itemInner, focused && tabStyles.activeInner]}>
                <MaterialIcons name={ICON_MAP.scan} size={24} color={color} />
                <Text style={[tabStyles.label, { color }]}>{t('scanner')}</Text>
              </View>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile'),
          tabBarIcon: ({ color, focused }) => (
            <View style={[tabStyles.itemWrap, focused && tabStyles.activeWrap]}>
              {focused && <View style={tabStyles.activeShadow} />}
              <View style={[tabStyles.itemInner, focused && tabStyles.activeInner]}>
                <MaterialIcons name={ICON_MAP.profile} size={24} color={color} />
                <Text style={[tabStyles.label, { color }]}>{t('profile')}</Text>
              </View>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="two"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="data-vault"
        options={{ href: null }}
      />
    </Tabs>
  );
}

const tabStyles = StyleSheet.create({
  itemWrap: {
    width: 84,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 1,
  },
  activeWrap: {
    transform: [{ scale: 1.08 }],
    marginTop: -8,
  },
  activeShadow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dashboard.shadowHard,
    borderRadius: 20,
    top: 2,
    left: 2,
  },
  itemInner: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 2,
  },
  activeInner: {
    backgroundColor: Colors.dashboard.tabActive,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});
