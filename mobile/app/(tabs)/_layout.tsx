import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/design/tokens';

const ICON_MAP = {
  home: { outline: 'home-outline', filled: 'home' },
  diary: { outline: 'book-outline', filled: 'book' },
  scan: { outline: 'qr-code-outline', filled: 'qr-code' },
  profile: { outline: 'person-outline', filled: 'person' },
} as const;

type IconKey = keyof typeof ICON_MAP;

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
            <Ionicons name={iconName} size={22} color={color} />
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
        <Ionicons name={iconName} size={22} color={color} />
        <Text numberOfLines={1} ellipsizeMode="tail" style={[tabStyles.label, { color }]}>
          {label}
        </Text>
      </View>
    </View>
  );
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
          height: Platform.OS === 'ios' ? 90 : 76,
          paddingTop: Platform.OS === 'ios' ? 15 : 15,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
        },
        tabBarActiveTintColor: Colors.dashboard.stroke,
        tabBarInactiveTintColor: Colors.dashboard.tabInactive,
        tabBarItemStyle: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 0,
          paddingBottom: 0,
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
    // Egy tab elem teljes doboza; ezzel állítod az ikon+felirat középre igazított területét.
    width: 84,
    // A tab elem magassága; ha a kijelölés le/fel csúszik, ezt és a tabBarStyle height/padding értékeit hangold.
    height: 56,
    // Vízszintes középre igazítás a tab saját területén belül.
    alignItems: 'center',
    // Függőleges középre igazítás a tab saját területén belül.
    justifyContent: 'center',
    // Biztosítja, hogy a wrapper maga is középen maradjon a tab slotban.
    alignSelf: 'center',
  },
  activeWrap: {
    // Kártyaszeru hard-shadow hely biztosítása (mint a főoldali kártyákon).
    width: 84,
    height: 58,
    paddingRight: 2,
    paddingBottom: 2,
    transform: [{ scale: 1.03 }],
  },
  activeShadow: {
    // Ugyanaz a fekete hard-shadow elv, mint a Meal cardoknál: 2px eltolás.
    position: 'absolute',
    top: 2,
    left: 2,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.dashboard.shadowHard,
    borderRadius: 20,
  },
  itemInner: {
    // Az ikon + felirat belső konténere; fix méret, így minden menüponton azonos kijelölés.
    width: 78,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    // A tab belső pill alakjának lekerekítése.
    borderRadius: 20,
    // Belső vízszintes térköz; nagyobb érték szélesebb kijelölést ad.
    paddingHorizontal: 12,
    // Belső függőleges térköz; nagyobb érték magasabb kijelölést ad.
    paddingVertical: 4,
    // Ikon és felirat közti távolság.
    gap: 2,
  },
  activeInner: {
    // Kijelölt tab háttérszíne.
    backgroundColor: Colors.dashboard.tabActive,
    // Kijelölt tab fekete keretének vastagsága.
    borderWidth: 1.5,
    // Kijelölt tab keretének színe.
    borderColor: Colors.dashboard.stroke,
    width: 82,
    height: 56,
    // Kijelöléskor nagyobb belső térköz.
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  label: {
    // Tab felirat mérete.
    fontSize: 12,
    // Tab felirat vastagsága.
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
    lineHeight: 14,
    includeFontPadding: false,
  },
});
