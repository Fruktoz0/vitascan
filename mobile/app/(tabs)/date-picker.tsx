import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import * as Haptics from '../../src/services/haptics';

import { Colors, Spacing } from '../../src/design/tokens';
import { statsApi, weightApi } from '../../src/services/api';
import { useDateStore } from '../../src/stores/dateStore';

const DAY_LABELS = ['H', 'K', 'Sz', 'Cs', 'P', 'Szo', 'V'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  const jsDay = new Date(year, month, 1).getDay();
  return (jsDay + 6) % 7; // Monday = 0
}

function buildCalendarGrid(year: number, month: number): (number | null)[][] {
  const daysInMonth = getDaysInMonth(year, month);
  const firstWeekday = getFirstDayOfWeek(year, month);
  const cells: (number | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const HU_MONTHS = [
  'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
  'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
];

export default function DatePickerScreen() {
  const router = useRouter();
  const { selectedDate, changeDateBy } = useDateStore();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());
  const [streak, setStreak] = useState<number | null>(null);
  const [weightDelta, setWeightDelta] = useState<number | null>(null);

  useEffect(() => {
    statsApi.streak().then((r) => setStreak(r.streak)).catch(() => setStreak(0));
    const todayStr = new Date().toISOString().split('T')[0];
    weightApi.getByDate(todayStr)
      .then((res) => setWeightDelta(res.deltaKg ?? 0))
      .catch(() => setWeightDelta(null));
  }, []);

  const sel = new Date(selectedDate);
  sel.setHours(0, 0, 0, 0);

  const weeks = buildCalendarGrid(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const selectDay = (day: number) => {
    const target = new Date(viewYear, viewMonth, day);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round((target.getTime() - sel.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays !== 0) changeDateBy(diffDays);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const isToday = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  };

  const isSelected = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === sel.getTime();
  };

  const weightText = weightDelta === null
    ? '–'
    : weightDelta === 0
      ? '0.0 kg'
      : `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg`;

  return (
    <View style={styles.screen}>
      {/* Pastel blobs */}
      <View style={[styles.blob, styles.blobMint]} pointerEvents="none" />
      <View style={[styles.blob, styles.blobPeach]} pointerEvents="none" />

      <SafeAreaView edges={['top']} style={{ backgroundColor: 'transparent' }}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <View style={styles.backBtnShadow} />
            <View style={styles.backBtnInner}>
              <MaterialIcons name="arrow-back" size={22} color={Colors.dashboard.stroke} />
            </View>
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Dátum választása</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Calendar Card */}
        <View style={styles.calCardWrapper}>
          <View style={styles.calCardShadow} />
          {/* Calendar icon badge - top-right corner of the card */}
          <View style={styles.calIconBadge}>
            <MaterialCommunityIcons name="calendar-month-outline" size={18} color={Colors.dashboard.stroke} />
          </View>
          <View style={styles.calCardInner}>
            {/* Month nav */}
            <View style={styles.monthNav}>
              <Pressable style={styles.monthArrow} onPress={prevMonth} hitSlop={8}>
                <MaterialIcons name="chevron-left" size={24} color={Colors.dashboard.stroke} />
              </Pressable>
              <Text style={styles.monthLabel}>
                {viewYear}. {HU_MONTHS[viewMonth]}
              </Text>
              <Pressable style={styles.monthArrow} onPress={nextMonth} hitSlop={8}>
                <MaterialIcons name="chevron-right" size={24} color={Colors.dashboard.stroke} />
              </Pressable>
            </View>

            {/* Day headers */}
            <View style={styles.dayHeaderRow}>
              {DAY_LABELS.map((d) => (
                <Text key={d} style={styles.dayHeader}>{d}</Text>
              ))}
            </View>

            {/* Weeks */}
            {weeks.map((week, wi) => (
              <View key={wi} style={styles.weekRow}>
                {week.map((day, di) => {
                  if (day === null) return <View key={di} style={styles.dayCell} />;
                  const selected = isSelected(day);
                  const todayMark = isToday(day);
                  return (
                    <Pressable
                      key={di}
                      style={styles.dayCell}
                      onPress={() => selectDay(day)}
                    >
                      <View style={[
                        styles.dayInner,
                        selected && styles.daySelected,
                        todayMark && !selected && styles.dayToday,
                      ]}>
                        <Text style={[
                          styles.dayText,
                          selected && styles.dayTextSelected,
                          todayMark && !selected && styles.dayTextToday,
                        ]}>
                          {day}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        {/* Stat Cards */}
        <View style={styles.statRow}>
          {/* Streak */}
          <View style={styles.statCardWrapper}>
            <View style={styles.statCardShadow} />
            <View style={styles.statCardInner}>
              <View style={[styles.statIconWrap, { backgroundColor: Colors.dashboard.blobPeach }]}>
                <MaterialCommunityIcons name="fire" size={22} color="#E57373" />
              </View>
              {streak === null ? (
                <ActivityIndicator size="small" color={Colors.dashboard.stroke} style={{ marginVertical: 4 }} />
              ) : (
                <Text style={styles.statValue}>{streak} Nap</Text>
              )}
              <Text style={styles.statTag}>STREAK</Text>
            </View>
          </View>

          {/* Weight delta */}
          <View style={styles.statCardWrapper}>
            <View style={styles.statCardShadow} />
            <View style={styles.statCardInner}>
              <View style={[styles.statIconWrap, { backgroundColor: Colors.dashboard.softBlue }]}>
                <Ionicons name="scale-outline" size={22} color={Colors.dashboard.stroke} />
              </View>
              <Text style={styles.statValue}>{weightText}</Text>
              <Text style={styles.statTag}>VÁLTOZÁS</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.dashboard.page,
  },
  blob: {
    position: 'absolute',
  },
  blobMint: {
    width: 180,
    height: 180,
    backgroundColor: Colors.dashboard.blobMint,
    borderRadius: 90,
    top: -50,
    right: -50,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    borderTopLeftRadius: 80,
    borderBottomRightRadius: 40,
    borderTopRightRadius: 60,
    borderBottomLeftRadius: 100,
  },
  blobPeach: {
    width: 140,
    height: 140,
    backgroundColor: Colors.dashboard.blobPeach,
    borderRadius: 70,
    bottom: 80,
    left: -40,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    borderTopLeftRadius: 40,
    borderBottomRightRadius: 80,
    borderTopRightRadius: 90,
    borderBottomLeftRadius: 60,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
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
    borderColor: Colors.dashboard.stroke,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: -1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.dashboard.stroke,
  },
  scroll: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 40,
    paddingBottom: 60,
    gap: 20,
  },
  calCardWrapper: {
    position: 'relative',
  },
  calCardShadow: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: -5,
    bottom: -5,
    backgroundColor: Colors.dashboard.shadowHard,
    borderRadius: 28,
  },
  calCardInner: {
    backgroundColor: '#fff',
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    padding: 20,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    position: 'relative',
  },
  monthArrow: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.dashboard.strokeSoft,
    backgroundColor: Colors.dashboard.page,
  },
  monthLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.dashboard.stroke,
  },
  calIconBadge: {
    position: 'absolute',
    top: -16,
    right: -15,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dashboard.softBlue,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '12deg' }],
  },
  dayHeaderRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: Colors.dashboard.tabInactive,
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
  },
  dayInner: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: {
    backgroundColor: Colors.dashboard.softGreen,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
  },
  dayToday: {
    backgroundColor: Colors.dashboard.blobPeach,
    borderWidth: 1,
    borderColor: Colors.dashboard.stroke,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.dashboard.stroke,
  },
  dayTextSelected: {
    fontWeight: '800',
    color: Colors.dashboard.stroke,
  },
  dayTextToday: {
    fontWeight: '700',
    color: Colors.dashboard.stroke,
  },
  statRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statCardWrapper: {
    flex: 1,
    position: 'relative',
    height: 130,
  },
  statCardShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: Colors.dashboard.shadowHard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 24,
    borderBottomLeftRadius: 16,
  },
  statCardInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 24,
    borderBottomLeftRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
  },
  statIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.dashboard.stroke,
    textAlign: 'center',
  },
  statTag: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.dashboard.tabInactive,
    letterSpacing: 1,
  },
});
