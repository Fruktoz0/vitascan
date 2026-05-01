import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Colors, Radius, Shadows, Typography } from '../../design/tokens';
import { GlassCardSimple } from './GlassCard';

interface WaterProgressBarProps {
  totalMl: number;
  goalMl: number;
  onAdd: (ml: number) => void;
}

const QUICK_ADD = [200, 300, 500];

export default function WaterProgressBar({ totalMl, goalMl, onAdd }: WaterProgressBarProps) {
  const { t } = useTranslation();
  const pct = Math.min(totalMl / goalMl, 1);
  const done = totalMl >= goalMl;
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(widthAnim, {
      toValue: pct,
      friction: 8,
      tension: 40,
      useNativeDriver: false,
    }).start();
  }, [pct]);

  const animWidth = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <GlassCardSimple
      backgroundColor={done ? 'rgba(46,204,113,0.12)' : Colors.glass.white}
      borderColor={done ? 'rgba(46,204,113,0.4)' : Colors.glass.border}
    >
      {/* Fejléc */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.dropEmoji}>💧</Text>
          <Text style={styles.title}>{t('waterScreen.title')}</Text>
          {done && <Text style={styles.doneBadge}>✅ {t('waterScreen.goalReached')}</Text>}
        </View>
        <Text style={styles.amount}>
          <Text style={[styles.current, done && styles.currentDone]}>
            {totalMl}
          </Text>
          <Text style={styles.goal}> / {goalMl} ml</Text>
        </Text>
      </View>

      {/* Progress sáv */}
      <View style={styles.track}>
        <Animated.View style={[styles.fillWrapper, { width: animWidth }]}>
          <LinearGradient
            colors={done
              ? ['#2ECC71', '#A8EDBC']
              : ['#7EC8E3', '#4A90D9']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.fill}
          />
        </Animated.View>

        {/* Hullám effect overlay */}
        <View style={styles.waveOverlay} pointerEvents="none">
          {[...Array(3)].map((_, i) => (
            <View
              key={i}
              style={[
                styles.waveDot,
                { left: `${25 + i * 25}%` as any, opacity: pct > (i + 1) * 0.25 ? 0.4 : 0 },
              ]}
            />
          ))}
        </View>
      </View>

      {/* Gyors hozzáadás gombok */}
      <View style={styles.btnRow}>
        {QUICK_ADD.map((ml) => (
          <Pressable
            key={ml}
            style={({ pressed }) => [
              styles.addBtn,
              done && styles.addBtnDone,
              pressed && styles.addBtnPressed,
            ]}
            onPress={() => onAdd(ml)}
          >
            <Text style={[styles.addBtnText, done && styles.addBtnTextDone]}>
              +{ml}ml
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Motiváló szöveg */}
      <Text style={styles.motivation}>
        {pct === 0
          ? `🌱 ${t('waterScreen.motivationStart')}`
          : pct < 0.5
          ? `💪 ${t('waterScreen.motivationHalf', { amount: goalMl - totalMl })}`
          : pct < 1
          ? `🎯 ${t('waterScreen.motivationAlmost', { amount: goalMl - totalMl })}`
          : `🏆 ${t('waterScreen.motivationDone')}`}
      </Text>
    </GlassCardSimple>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dropEmoji: { fontSize: 20 },
  title: { ...Typography.bodyMedium, color: Colors.text.primary },
  doneBadge: {
    fontSize: 11,
    color: Colors.status.verified,
    fontWeight: '700',
    backgroundColor: Colors.status.verifiedBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  amount: {},
  current: { fontSize: 18, fontWeight: '800', color: '#4A90D9' },
  currentDone: { color: Colors.status.verified },
  goal: { ...Typography.caption, color: Colors.text.muted },
  track: {
    height: 14,
    backgroundColor: 'rgba(126,200,227,0.2)',
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginBottom: 14,
    position: 'relative',
  },
  fillWrapper: { height: '100%' },
  fill: { flex: 1, borderRadius: Radius.full },
  waveOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
  },
  waveDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  btnRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  addBtn: {
    flex: 1,
    backgroundColor: 'rgba(126,200,227,0.15)',
    borderRadius: Radius.full,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(74,144,217,0.3)',
  },
  addBtnDone: {
    backgroundColor: 'rgba(46,204,113,0.12)',
    borderColor: 'rgba(46,204,113,0.3)',
  },
  addBtnPressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  addBtnText: { ...Typography.label, color: '#2B8FCB' },
  addBtnTextDone: { color: Colors.status.verified },
  motivation: {
    ...Typography.caption,
    color: Colors.text.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
