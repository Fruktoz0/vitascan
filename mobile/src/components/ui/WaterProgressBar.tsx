import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Radius } from '../../design/tokens';
import { GlassCardSimple } from './GlassCard';

interface WaterProgressBarProps {
  totalMl: number;
  goalMl: number;
  onAdjust: (ml: number) => void;
}

export default function WaterProgressBar({ totalMl, goalMl, onAdjust }: WaterProgressBarProps) {
  const { t } = useTranslation();
  const pct = Math.min(totalMl / goalMl, 1);
  const widthAnim = useRef(new Animated.Value(0)).current;
  const stripeAnim = useRef(new Animated.Value(0)).current;
  const canSubtract = totalMl > 0;

  useEffect(() => {
    Animated.spring(widthAnim, {
      toValue: pct,
      friction: 8,
      tension: 40,
      useNativeDriver: false,
    }).start();

    Animated.loop(
      Animated.timing(stripeAnim, {
        toValue: 1,
        duration: 20000,
        useNativeDriver: true,
      })
    ).start();
  }, [pct]);

  const animWidth = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const translateX = stripeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -50],
  });

  return (
    <GlassCardSimple
      backgroundColor={Colors.dashboard.waterBg}
      customRadius={{
        borderTopLeftRadius: 24,
        borderTopRightRadius: 32,
        borderBottomRightRadius: 24,
        borderBottomLeftRadius: 32,
      }}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconCircle}>
            <View
              style={[
                StyleSheet.absoluteFillObject,
                { backgroundColor: Colors.dashboard.shadowHard, borderRadius: 20, top: 2, left: 2 },
              ]}
            />
            <View style={styles.iconCircleInner}>
              <MaterialIcons name="water-drop" size={24} color={Colors.dashboard.waterIcon} />
            </View>
          </View>

          <View>
            <Text style={styles.title}>{t('waterScreen.title')}</Text>
            <Text style={styles.goal}>{`Napi cél: ${(goalMl / 1000).toFixed(1)}L`}</Text>
          </View>
        </View>
        <Text style={styles.current}>{(totalMl / 1000).toFixed(1)}L</Text>
      </View>

      <View style={styles.track}>
        <Animated.View style={[styles.fillWrapper, { width: animWidth }]}>
          <LinearGradient
            colors={['#b6cad2', '#d2e6ef']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
          <Animated.View style={[styles.fillInner, { transform: [{ translateX }] }]}>
            <Text style={styles.stripesPattern}>//////// //////// //////// //////// //////// ////////</Text>
          </Animated.View>
        </Animated.View>
      </View>

      <View style={styles.btnRow}>
        <Pressable
          style={({ pressed }) => [
            styles.addBtnWrapper,
            !canSubtract && styles.addBtnDisabled,
            pressed && canSubtract && styles.addBtnPressed,
          ]}
          onPress={() => canSubtract && onAdjust(-250)}
          disabled={!canSubtract}
          hitSlop={8}
        >
          <View style={styles.addBtnShadow} />
          <View style={styles.addBtn}>
            <Text style={styles.addBtnPlus}>−</Text>
            <Text style={styles.addBtnText}>{` 250 ml`}</Text>
          </View>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.addBtnWrapper, pressed && styles.addBtnPressed]}
          onPress={() => onAdjust(250)}
          hitSlop={8}
        >
          <View style={styles.addBtnShadow} />
          <View style={styles.addBtn}>
            <Text style={styles.addBtnPlus}>+</Text>
            <Text style={styles.addBtnText}>{` 250 ml`}</Text>
          </View>
        </Pressable>
      </View>
    </GlassCardSimple>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: {
    width: 40,
    height: 40,
  },
  iconCircleInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dashboard.card,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#5e7178' },
  goal: { fontSize: 14, fontWeight: '500', color: 'rgba(94, 113, 120, 0.8)' },
  current: { fontSize: 24, fontWeight: '900', color: '#0b1e24' },

  track: {
    height: 16,
    backgroundColor: Colors.dashboard.card,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    overflow: 'hidden',
    marginBottom: 20,
  },
  fillWrapper: {
    height: '100%',
    borderRightWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    borderTopRightRadius: Radius.full,
    borderBottomRightRadius: Radius.full,
    overflow: 'hidden',
    alignItems: 'flex-end',
    paddingRight: 8,
  },
  fillInner: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.3,
    justifyContent: 'center',
  },
  stripesPattern: {
    fontSize: 26,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 3,
    position: 'absolute',
    top: -4,
    left: -40,
    width: 1000,
  },

  btnRow: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 4 },
  addBtnWrapper: {
    flex: 1,
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnShadow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dashboard.shadowHard,
    borderRadius: 20,
    top: 3,
    left: 2,
  },
  addBtn: {
    width: 150,
    alignSelf: 'center',
    marginBottom: 2,
    marginRight: 2,
    justifyContent: 'center',
    height: 40,
    backgroundColor: Colors.dashboard.card,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addBtnPressed: { transform: [{ translateY: 2 }, { translateX: 2 }] },
  addBtnText: { fontSize: 13, color: Colors.dashboard.stroke, fontWeight: '800' },
  addBtnPlus: { fontSize: 15, color: '#407a9b', fontWeight: '800' },
});
