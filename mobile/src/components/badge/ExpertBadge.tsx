import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Colors, Radius, Spacing, Typography } from '../../design/tokens';

// ─── Reputáció szintek ────────────────────────────────────────────────────────

export interface ReputationLevel {
  label: string;
  emoji: string;
  minRep: number;
  gradient: string[];
  textColor: string;
}

export const REPUTATION_LEVELS: ReputationLevel[] = [
  { label: 'Újjonc',    emoji: '🌱', minRep: 0,   gradient: ['#95A5A6', '#BDC3C7'], textColor: '#555' },
  { label: 'Tag',       emoji: '👤', minRep: 3,   gradient: ['#3498DB', '#7EC8E3'], textColor: '#1A5276' },
  { label: 'Aktív',     emoji: '⭐', minRep: 7,   gradient: ['#F5A623', '#FFD080'], textColor: '#7D6608' },
  { label: 'Szakértő',  emoji: '🏆', minRep: 10,  gradient: ['#FF6B35', '#FF9A6C'], textColor: '#7B241C' },
  { label: 'Mester',    emoji: '💎', minRep: 25,  gradient: ['#9B59B6', '#C9B8FF'], textColor: '#4A235A' },
  { label: 'Legenda',   emoji: '🌟', minRep: 50,  gradient: ['#1ABC9C', '#A8EDBC'], textColor: '#0E6655' },
];

export function getReputationLevel(reputation: number): ReputationLevel {
  const sorted = [...REPUTATION_LEVELS].reverse();
  return sorted.find((l) => reputation >= l.minRep) ?? REPUTATION_LEVELS[0];
}

export function getNextLevel(reputation: number): ReputationLevel | null {
  const idx = REPUTATION_LEVELS.findIndex((l) => l.minRep > reputation);
  return idx !== -1 ? REPUTATION_LEVELS[idx] : null;
}

// ─── ExpertBadge — kis jelvény ételkártyákon ─────────────────────────────────

interface BadgeProps {
  reputation: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function ExpertBadge({ reputation, size = 'md', showLabel = true }: BadgeProps) {
  const { t } = useTranslation();
  const level = getReputationLevel(reputation);
  if (reputation < REPUTATION_LEVELS[2].minRep) return null; // Aktív szint alatt nincs badge

  const fontSize  = size === 'sm' ? 12 : size === 'lg' ? 18 : 14;
  const padV      = size === 'sm' ? 2  : size === 'lg' ? 6  : 3;
  const padH      = size === 'sm' ? 6  : size === 'lg' ? 12 : 8;
  const textSize  = size === 'sm' ? 10 : size === 'lg' ? 13 : 11;

  return (
    <LinearGradient
      colors={level.gradient as any}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      style={[badgeStyles.container, { paddingVertical: padV, paddingHorizontal: padH, borderRadius: Radius.full }]}
    >
      <Text style={{ fontSize }}>{level.emoji}</Text>
      {showLabel && (
        <Text style={[badgeStyles.label, { fontSize: textSize, color: '#fff' }]}>
          {t(`reputation.level.${level.label}`)}
        </Text>
      )}
    </LinearGradient>
  );
}

const badgeStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start' },
  label: { fontWeight: '800' },
});

// ─── ReputationCard — teljes kártya a profiloldalhoz ─────────────────────────

interface ReputationCardProps {
  reputation: number;
  username: string;
}

export function ReputationCard({ reputation, username }: ReputationCardProps) {
  const { t } = useTranslation();
  const level = getReputationLevel(reputation);
  const nextLevel = getNextLevel(reputation);
  const progressToNext = nextLevel
    ? Math.min((reputation - level.minRep) / (nextLevel.minRep - level.minRep), 1)
    : 1;

  // Count-up animáció
  const countAnim = useRef(new Animated.Value(0)).current;
  const barAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(countAnim, { toValue: reputation, duration: 1200, useNativeDriver: false }),
      Animated.spring(barAnim, { toValue: progressToNext, friction: 8, tension: 30, useNativeDriver: false }),
    ]).start();
  }, [reputation]);

  const animWidth = barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <LinearGradient
      colors={level.gradient as any}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={cardStyles.card}
    >
      {/* Szint jelölő */}
      <View style={cardStyles.header}>
        <Text style={cardStyles.emoji}>{level.emoji}</Text>
        <View>
          <Text style={cardStyles.levelLabel}>{t(`reputation.level.${level.label}`)}</Text>
          <Text style={cardStyles.username}>{username}</Text>
        </View>
        <Animated.Text style={cardStyles.repNum}>
          {countAnim.interpolate({ inputRange: [0, reputation], outputRange: ['0', String(reputation)] })}
        </Animated.Text>
      </View>

      {/* Progress a következő szintig */}
      <View style={cardStyles.progressSection}>
        <View style={cardStyles.progressTrack}>
          <Animated.View style={[cardStyles.progressFill, { width: animWidth }]} />
        </View>
        <View style={cardStyles.progressLabels}>
          <Text style={cardStyles.progressCurrent}>{t(`reputation.level.${level.label}`)} ({level.minRep}+ {t('reputation.points')})</Text>
          {nextLevel ? (
            <Text style={cardStyles.progressNext}>
              {nextLevel.emoji} {t(`reputation.level.${nextLevel.label}`)} ({nextLevel.minRep} {t('reputation.points')})
            </Text>
          ) : (
            <Text style={cardStyles.progressNext}>🌟 {t('reputation.maxLevelReached')}</Text>
          )}
        </View>
      </View>

      {/* Szint leírása */}
      <Text style={cardStyles.howTo}>
        {reputation < 3
          ? `💡 ${t('reputation.howToStart')}`
          : nextLevel
          ? t('reputation.pointsToNext', { count: nextLevel.minRep - reputation, emoji: nextLevel.emoji, level: t(`reputation.level.${nextLevel.label}`) })
          : `🏆 ${t('reputation.maxThanks')}`}
      </Text>
    </LinearGradient>
  );
}

const cardStyles = StyleSheet.create({
  card: { borderRadius: Radius['2xl'], padding: Spacing.xl, gap: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  emoji: { fontSize: 48 },
  levelLabel: { fontSize: 18, fontWeight: '900', color: '#fff' },
  username: { ...Typography.caption, color: 'rgba(255,255,255,0.8)' },
  repNum: { fontSize: 40, fontWeight: '900', color: '#fff', marginLeft: 'auto' },
  progressSection: { gap: Spacing.xs },
  progressTrack: {
    height: 10, backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: Radius.full, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', backgroundColor: '#fff',
    borderRadius: Radius.full,
    shadowColor: '#fff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6,
  },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressCurrent: { ...Typography.caption, color: 'rgba(255,255,255,0.75)' },
  progressNext: { ...Typography.caption, color: 'rgba(255,255,255,0.75)' },
  howTo: { ...Typography.caption, color: 'rgba(255,255,255,0.85)', lineHeight: 18 },
});

// ─── ReputationLevelsGuide — minden szint megjelenítése ───────────────────────

export function ReputationLevelsGuide({ currentRep }: { currentRep: number }) {
  const { t } = useTranslation();
  return (
    <View style={guideStyles.container}>
      <Text style={guideStyles.title}>{t('reputation.levelsTitle')}</Text>
      {REPUTATION_LEVELS.map((level) => {
        const reached = currentRep >= level.minRep;
        const isCurrent = getReputationLevel(currentRep).label === level.label;
        return (
          <View key={level.label} style={[guideStyles.row, isCurrent && guideStyles.rowCurrent]}>
            <Text style={guideStyles.emoji}>{level.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[guideStyles.levelName, reached && guideStyles.levelNameReached]}>
                {t(`reputation.level.${level.label}`)}
              </Text>
              <Text style={guideStyles.minRep}>{level.minRep}+ {t('reputation.reputationPoints')}</Text>
            </View>
            {isCurrent && (
              <View style={guideStyles.currentBadge}>
                <Text style={guideStyles.currentText}>{t('reputation.current')}</Text>
              </View>
            )}
            {reached && !isCurrent && <Text style={guideStyles.checkMark}>✓</Text>}
            {!reached && <Text style={guideStyles.lockIcon}>🔒</Text>}
          </View>
        );
      })}
    </View>
  );
}

const guideStyles = StyleSheet.create({
  container: { gap: Spacing.xs },
  title: { ...Typography.label, color: Colors.text.secondary, marginBottom: Spacing.xs },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1.5, borderColor: 'transparent',
  },
  rowCurrent: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  emoji: { fontSize: 24, width: 32, textAlign: 'center' },
  levelName: { ...Typography.bodyMedium, color: Colors.text.muted },
  levelNameReached: { color: Colors.text.primary },
  minRep: { ...Typography.caption, color: Colors.text.muted, marginTop: 1 },
  currentBadge: {
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingVertical: 2, paddingHorizontal: 8,
  },
  currentText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  checkMark: { color: '#2ECC71', fontSize: 16, fontWeight: '900' },
  lockIcon: { fontSize: 14 },
});
