import React, { useContext, useEffect } from 'react';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/design/tokens';
import { CONTENT_MAX_WIDTH } from '../../src/hooks/useResponsive';

const ICON_MAP = {
  home: { outline: 'home-outline', filled: 'home' },
  diary: { outline: 'book-outline', filled: 'book' },
  scan: { outline: 'qr-code-outline', filled: 'qr-code' },
  profile: { outline: 'person-outline', filled: 'person' },
} as const;

type IconKey = keyof typeof ICON_MAP;

/**
 * PWA menüsáv: kompakt top pad + content.
 * FONTOS: a sáv (webBar) mérete MINDIG fix (WEB_TAB_CONTENT + 2*WEB_TAB_PAD),
 * függetlenül attól, hogy böngészőben vagy standalone (home screen) PWA-ban fut.
 * A home indicator alatti extra helyet egy KÜLÖN, azonos hátterű "safe area filler"
 * csík adja hozzá, nem a bar saját paddingje — így a bar sosem "nő meg" vizuálisan.
 */
const WEB_TAB_PAD = 4;
const WEB_TAB_CONTENT = 48;

function TabVisual({
  iconKey,
  label,
  color,
  focused,
}: {
  iconKey: IconKey;
  label: string;
  color: string;
  focused: boolean;
}) {
  const iconName = focused ? ICON_MAP[iconKey].filled : ICON_MAP[iconKey].outline;

  if (focused) {
    return (
      <View style={tabStyles.itemWrap}>
        <View style={tabStyles.activeWrap}>
          <View style={tabStyles.activeShadow} />
          <View style={[tabStyles.itemInner, tabStyles.activeInner]}>
            <Ionicons name={iconName} size={18} color={color} />
            <Text numberOfLines={1} ellipsizeMode="tail" style={[tabStyles.label, { color }]}>
              {label}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={tabStyles.itemWrap}>
      <View style={tabStyles.itemInner}>
        <Ionicons name={iconName} size={18} color={color} />
        <Text numberOfLines={1} ellipsizeMode="tail" style={[tabStyles.label, { color }]}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const WEB_TAB_META: Record<string, { iconKey: IconKey; labelKey: string }> = {
  home: { iconKey: 'home', labelKey: 'home' },
  'food-library': { iconKey: 'diary', labelKey: 'foodLibrary' },
  scanner: { iconKey: 'scan', labelKey: 'scanner' },
  profile: { iconKey: 'profile', labelKey: 'profileTab' },
};

function WebTabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useTranslation();
  const onHeightChange = useContext(BottomTabBarHeightCallbackContext);

  // A bejelentett magasság is FIX marad — nem tartalmazza a safe area-t,
  // mert az egy külön, a tartalom fölött "lebegő" réteg lesz.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      onHeightChange?.(WEB_TAB_CONTENT + WEB_TAB_PAD * 2);
    });
    return () => cancelAnimationFrame(frame);
  }, [onHeightChange]);

  return (
    <View
      style={
        Platform.OS === 'web'
          ? ({
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
            } as object)
          : undefined
      }
      {...({ 'data-vitascan-tabbar': '1' } as object)}
    >
      <View style={tabStyles.webBar}>
        {state.routes.map((route, index) => {
          const meta = WEB_TAB_META[route.name];
          if (!meta) return null;

          const focused = state.index === index;
          const color = focused ? Colors.dashboard.stroke : Colors.dashboard.tabInactive;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={focused ? { selected: true } : {}}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={tabStyles.webTabButton}
            >
              <TabVisual
                iconKey={meta.iconKey}
                label={t(meta.labelKey)}
                color={color}
                focused={focused}
              />
            </Pressable>
          );
        })}
      </View>

      {/*
        Safe-area filler: csak ez nyúlik le a home indicator alá standalone PWA-ban.
        Böngészőben env(safe-area-inset-bottom) mindig 0, tehát ott gyakorlatilag
        nem foglal helyet. Ugyanolyan háttérszín, mint a bar, hogy folytatásnak tűnjön.
        Feltétele: <meta name="viewport" content="viewport-fit=cover" ...> legyen
        beállítva (web/index.html vagy app.json → expo.web.viewport).
      */}
      {Platform.OS === 'web' && (
        <View
          style={
            {
              height: 'env(safe-area-inset-bottom, 0px)',
              maxWidth: CONTENT_MAX_WIDTH,
              width: '100%',
              marginLeft: 'auto',
              marginRight: 'auto',
              backgroundColor: Colors.dashboard.tabBg,
              borderLeftWidth: 1.5,
              borderRightWidth: 1.5,
              borderColor: Colors.dashboard.stroke,
              boxSizing: 'border-box',
            } as object
          }
        />
      )}
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  const paddingBottom = isWeb ? WEB_TAB_PAD : Platform.OS === 'ios' ? Math.max(insets.bottom, 8) : 8;
  const paddingTop = isWeb ? WEB_TAB_PAD : 6;
  const contentH = isWeb ? WEB_TAB_CONTENT : 52;
  const tabBarHeight = paddingTop + contentH + paddingBottom;

  return (
    <Tabs
      tabBar={isWeb ? (props) => <WebTabBar {...props} /> : undefined}
      safeAreaInsets={isWeb ? { top: 0, right: 0, bottom: 0, left: 0 } : undefined}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          ...(isWeb
            ? {
                maxWidth: CONTENT_MAX_WIDTH,
                alignSelf: 'center' as const,
                width: '100%',
                marginLeft: 'auto',
                marginRight: 'auto',
                // Hide default bar chrome — custom WebTabBar renders instead
                display: 'none',
              }
            : {}),

          backgroundColor: Colors.dashboard.tabBg,
          borderTopWidth: 1.5,
          borderTopColor: Colors.dashboard.stroke,
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          shadowColor: Colors.dashboard.shadowHard,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 1,
          shadowRadius: 0,
          elevation: 0,
          height: tabBarHeight,
          paddingTop,
          paddingBottom,
          overflow: 'hidden',
        },
        tabBarActiveTintColor: Colors.dashboard.stroke,
        tabBarInactiveTintColor: Colors.dashboard.tabInactive,
        tabBarItemStyle: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 0,
          paddingBottom: 0,
          height: contentH,
          ...(isWeb ? { cursor: 'pointer' as const } : {}),
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('home'),
          tabBarIcon: ({ color, focused }) => (
            <TabVisual iconKey="home" label={t('home')} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="food-library"
        options={{
          title: t('foodLibrary'),
          tabBarIcon: ({ color, focused }) => (
            <TabVisual iconKey="diary" label={t('foodLibrary')} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: t('scanner'),
          tabBarIcon: ({ color, focused }) => (
            <TabVisual iconKey="scan" label={t('scanner')} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profileTab'),
          tabBarIcon: ({ color, focused }) => (
            <TabVisual iconKey="profile" label={t('profileTab')} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="date-picker"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
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
  webBar: {
    zIndex: 1000,
    maxWidth: CONTENT_MAX_WIDTH,
    width: '100%',
    marginLeft: 'auto',
    marginRight: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: Colors.dashboard.tabBg,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    boxSizing: 'border-box',
    paddingTop: WEB_TAB_PAD,
    paddingBottom: WEB_TAB_PAD,
    height: WEB_TAB_CONTENT + WEB_TAB_PAD * 2,
  } as any,
  webTabButton: {
    flex: 1,
    height: WEB_TAB_CONTENT,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  } as any,
  itemWrap: {
    width: 84,
    height: WEB_TAB_CONTENT,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  activeWrap: {
    width: 84,
    height: 46,
    paddingRight: 2,
    paddingBottom: 2,
  },
  activeShadow: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.dashboard.shadowHard,
    borderRadius: 16,
  },
  itemInner: {
    width: 80,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 0,
  },
  activeInner: {
    backgroundColor: Colors.dashboard.tabActive,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    width: 82,
    height: 44,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 0,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
    lineHeight: 12,
    includeFontPadding: false,
  },
});