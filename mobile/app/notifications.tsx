import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MaterialIcons, MaterialCommunityIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Colors, Spacing } from '../src/design/tokens';

type ToggleProps = { value: boolean; onValueChange: (v: boolean) => void };
function StitchSwitch({ value, onValueChange }: ToggleProps) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onValueChange(!value);
      }}
      style={[styles.switchTrack, value && styles.switchTrackOn]}
    >
      <View style={[styles.switchThumb, value && styles.switchThumbOn]} />
    </Pressable>
  );
}

type SectionCardProps = {
  iconBg: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
};
function SectionCard({ iconBg, icon, title, children }: SectionCardProps) {
  return (
    <View style={styles.sectionWrapper}>
      <View style={styles.sectionShadow} />
      <View style={styles.sectionInner}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIconBubble, { backgroundColor: iconBg }]}>{icon}</View>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <View style={{ gap: 6 }}>{children}</View>
      </View>
    </View>
  );
}

type ToggleRowProps = { label: string; value: boolean; onValueChange: (v: boolean) => void; isLast?: boolean };
function ToggleRow({ label, value, onValueChange, isLast }: ToggleRowProps) {
  return (
    <View style={[styles.toggleRow, !isLast && styles.toggleRowDivider]}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <StitchSwitch value={value} onValueChange={onValueChange} />
    </View>
  );
}

type DropdownChipProps = { label: string; value: string; onPress?: () => void };
function DropdownChip({ label, value, onPress }: DropdownChipProps) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.smallLabel}>{label}</Text>
      <Pressable onPress={onPress} style={styles.dropdown}>
        <Text style={styles.dropdownValue}>{value}</Text>
        <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.dashboard.stroke} />
      </Pressable>
    </View>
  );
}

const FREQUENCY_VALUES = ['1h', '2h', '3h', '4h'] as const;
type FrequencyKey = typeof FREQUENCY_VALUES[number];

const TIME_VALUES = ['07:00 AM', '08:00 AM', '12:00 PM', '06:00 PM', '08:00 PM', '10:00 PM'] as const;

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [breakfast, setBreakfast] = useState(false);
  const [lunch, setLunch] = useState(false);
  const [dinner, setDinner] = useState(true);
  const [snack, setSnack] = useState(false);

  const [frequency, setFrequency] = useState<FrequencyKey>('2h');
  const [notifyTime, setNotifyTime] = useState<string>('08:00 PM');

  const [likes, setLikes] = useState(false);
  const [votes, setVotes] = useState(false);

  const cycleFrequency = () => {
    const idx = FREQUENCY_VALUES.indexOf(frequency);
    const next = FREQUENCY_VALUES[(idx + 1) % FREQUENCY_VALUES.length];
    setFrequency(next);
    Haptics.selectionAsync();
  };

  const cycleNotifyTime = () => {
    const idx = TIME_VALUES.indexOf(notifyTime as typeof TIME_VALUES[number]);
    const safeIdx = idx >= 0 ? idx : 0;
    const next = TIME_VALUES[(safeIdx + 1) % TIME_VALUES.length];
    setNotifyTime(next);
    Haptics.selectionAsync();
  };

  const frequencyLabel: Record<FrequencyKey, string> = {
    '1h': t('notificationsScreen.freq1h'),
    '2h': t('notificationsScreen.freq2h'),
    '3h': t('notificationsScreen.freq3h'),
    '4h': t('notificationsScreen.freq4h'),
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.blob, styles.blobMint]} pointerEvents="none" />
      <View style={[styles.blob, styles.blobPeach]} pointerEvents="none" />

      <SafeAreaView edges={['top']} style={{ backgroundColor: 'transparent' }}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
            <View style={styles.backBtnShadow} />
            <View style={styles.backBtnInner}>
              <MaterialIcons name="arrow-back" size={22} color={Colors.dashboard.stroke} />
            </View>
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{t('notificationsScreen.screenTitle')}</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionCard
          iconBg="#F4C8C0"
          icon={<MaterialCommunityIcons name="silverware-fork-knife" size={20} color={Colors.dashboard.stroke} />}
          title={t('notificationsScreen.mealRemindersTitle')}
        >
          <ToggleRow label={t('notificationsScreen.mealBreakfast')} value={breakfast} onValueChange={setBreakfast} />
          <ToggleRow label={t('notificationsScreen.mealLunch')} value={lunch} onValueChange={setLunch} />
          <ToggleRow label={t('notificationsScreen.mealDinner')} value={dinner} onValueChange={setDinner} />
          <ToggleRow label={t('notificationsScreen.mealSnack')} value={snack} onValueChange={setSnack} isLast />
        </SectionCard>

        <SectionCard
          iconBg="#CFE6F4"
          icon={<Ionicons name="water-outline" size={20} color={Colors.dashboard.stroke} />}
          title={t('notificationsScreen.waterTitle')}
        >
          <Text style={styles.bodyText}>{t('notificationsScreen.waterDesc')}</Text>
          <View style={{ height: 6 }} />
          <DropdownChip
            label={t('notificationsScreen.frequency')}
            value={frequencyLabel[frequency]}
            onPress={cycleFrequency}
          />
        </SectionCard>

        <SectionCard
          iconBg="#D7EBD2"
          icon={<MaterialCommunityIcons name="note-outline" size={20} color={Colors.dashboard.stroke} />}
          title={t('notificationsScreen.dailyTitle')}
        >
          <Text style={styles.bodyText}>{t('notificationsScreen.dailyDesc')}</Text>
          <View style={{ height: 6 }} />
          <DropdownChip
            label={t('notificationsScreen.notifyTime')}
            value={notifyTime}
            onPress={cycleNotifyTime}
          />
        </SectionCard>

        <SectionCard
          iconBg="#E5D5EE"
          icon={<FontAwesome5 name="users" size={16} color={Colors.dashboard.stroke} />}
          title={t('notificationsScreen.communityTitle')}
        >
          <ToggleRow label={t('notificationsScreen.communityLikes')} value={likes} onValueChange={setLikes} />
          <ToggleRow label={t('notificationsScreen.communityVotes')} value={votes} onValueChange={setVotes} isLast />
        </SectionCard>

        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

const STROKE = Colors.dashboard.stroke;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.dashboard.page },

  blob: {
    position: 'absolute',
    borderWidth: 1.5, borderColor: STROKE,
  },
  blobMint: {
    width: 220, height: 220,
    top: -60, right: -80,
    backgroundColor: 'rgba(232,245,233,0.55)',
    borderTopLeftRadius: 100,
    borderTopRightRadius: 80,
    borderBottomRightRadius: 110,
    borderBottomLeftRadius: 90,
  },
  blobPeach: {
    width: 180, height: 180,
    bottom: 80, left: -70,
    backgroundColor: 'rgba(255,218,214,0.5)',
    borderTopLeftRadius: 90,
    borderTopRightRadius: 60,
    borderBottomRightRadius: 100,
    borderBottomLeftRadius: 80,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    position: 'relative',
  },
  backBtnShadow: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: -2,
    bottom: -2,
    backgroundColor: Colors.dashboard.shadowHard,
    borderRadius: 22,
  },
  backBtnInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    borderRadius: 22,
    borderWidth: 0.8,
    borderColor: STROKE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: STROKE },

  scroll: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 16,
  },

  sectionWrapper: { position: 'relative', paddingRight: 5, paddingBottom: 5 },
  sectionShadow: {
    position: 'absolute', top: 5, left: 5, right: 0, bottom: 0,
    backgroundColor: STROKE, borderRadius: 24,
  },
  sectionInner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1.4,
    borderColor: STROKE,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 8,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  sectionIconBubble: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1.4, borderColor: STROKE,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: STROKE },

  bodyText: { fontSize: 13, color: '#5A5A5A', lineHeight: 18 },
  smallLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#5A5A5A',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  toggleRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(28,27,27,0.08)',
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: STROKE },

  switchTrack: {
    width: 44, height: 26,
    borderRadius: 999,
    backgroundColor: '#E0DDDC',
    borderWidth: 1.2, borderColor: STROKE,
    padding: 2,
    justifyContent: 'center',
  },
  switchTrackOn: {
    backgroundColor: '#7BB37A',
  },
  switchThumb: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: STROKE,
  },
  switchThumbOn: {
    transform: [{ translateX: 18 }],
  },

  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1.2,
    borderColor: STROKE,
    backgroundColor: '#FFFFFF',
  },
  dropdownValue: { fontSize: 14, fontWeight: '700', color: STROKE },
});
