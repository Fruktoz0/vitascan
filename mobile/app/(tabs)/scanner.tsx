import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';

import { foodApi, Food, ApiError } from '../../src/services/api';
import FoodDetailModal from '../../src/components/food/FoodDetailModal';
import AddFoodManualModal from '../../src/components/food/AddFoodManualModal';
import { Colors, Radius, Spacing, Typography } from '../../src/design/tokens';

type ScanState = 'idle' | 'scanning' | 'found' | 'not_found' | 'error';

/**
 * VitaScan Magic Scanner
 * Ultra-optimalizált verzió: a kamera leáll, ha modális ablak van nyitva vagy elnavigálunk.
 */
function ScannerScreen() {
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const router = useRouter();

  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [foundFood, setFoundFood] = useState<Food | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [manualVisible, setManualVisible] = useState(false);
  const [lastBarcode, setLastBarcode] = useState('');

  // A kamera csak akkor aktív, ha fókuszban vagyunk ÉS nincs nyitva semmilyen modális ablak
  const isCameraActive = isFocused && !detailVisible && !manualVisible;

  // ─── Animációk ─────────────────────────────────────────────────────────────
  const scanY = useSharedValue(0);

  useEffect(() => {
    if (isCameraActive) {
      scanY.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 2000 }),
          withTiming(0, { duration: 0 })
        ),
        -1
      );
    } else {
      scanY.value = 0;
    }
  }, [isCameraActive]);

  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanY.value * 180 }],
  }));

  // ─── Vonalkód logika ──────────────────────────────────────────────────────
  const handleBarcode = async ({ data: barcode }: BarcodeScanningResult) => {
    if (scanState !== 'idle' || barcode === lastBarcode) return;

    setLastBarcode(barcode);
    setScannedBarcode(barcode);
    setScanState('scanning');

    try {
      const food = await foodApi.getByBarcode(barcode);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      setFoundFood(food as Food);
      setScanState('found');
      setDetailVisible(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setScanState('not_found');
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setScanState('error');
      }
    }
  };

  const resetScan = () => {
    setScanState('idle');
    setLastBarcode('');
    setFoundFood(null);
  };

  if (!permission) return <View style={styles.blackBg} />;

  if (!permission.granted) {
    return (
      <LinearGradient colors={['#1A1A2E', '#2D2D4E']} style={styles.flex1}>
        <SafeAreaView style={styles.permInner}>
          <View style={styles.permCard}>
            <Text style={styles.permEmoji}>📷</Text>
            <Text style={styles.permTitle}>Kamera szükséges</Text>
            <Text style={styles.permDesc}>
              Engedélyezd a kamerát a vonalkódok beolvasásához.
            </Text>
            <Pressable style={styles.permBtn} onPress={requestPermission}>
              <Text style={styles.permBtnText}>Engedélyezés</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <View style={styles.blackBg}>
      {/* A kamera hardveresen leáll, ha bármelyik feltétel hamis */}
      {isCameraActive && (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={scanState === 'idle' ? handleBarcode : undefined}
        />
      )}

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.dimTop} />

        <View style={styles.middleRow}>
          <View style={styles.dimSide} />

          <View style={styles.scanFrame}>
            {[
              { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
              { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
              { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
              { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },
            ].map((s, i) => (
              <View
                key={i}
                style={[
                  styles.corner,
                  s as any,
                  { borderColor: scanState === 'found' ? '#2ECC71' : scanState === 'not_found' ? '#E74C3C' : Colors.primary }
                ]}
              />
            ))}

            {scanState === 'idle' && isCameraActive && (
              <Animated.View style={[styles.scanLine, scanLineStyle, { backgroundColor: Colors.primary }]} />
            )}

            {scanState === 'scanning' && (
              <View style={styles.stateOverlay}>
                <ActivityIndicator color="#fff" size="large" />
                <Text style={styles.stateText}>Elemzés...</Text>
              </View>
            )}
          </View>

          <View style={styles.dimSide} />
        </View>

        <View style={styles.bottomPanel}>
          <Text style={styles.scanHint}>
            {scanState === 'idle' ? 'Irányítsd a kamerát a vonalkódra' : 'Folyamatban...'}
          </Text>

          {scanState === 'not_found' && (
            <View style={styles.actionRow}>
              <Pressable style={styles.actionBtn} onPress={() => setManualVisible(true)}>
                <Text style={styles.actionBtnEmoji}>✏️</Text>
                <Text style={styles.actionBtnText}>Új étel</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={resetScan}>
                <Text style={styles.actionBtnEmoji}>🔄</Text>
                <Text style={styles.actionBtnText}>Mégse</Text>
              </Pressable>
            </View>
          )}

          {scanState === 'idle' && (
            <Pressable style={styles.manualLink} onPress={() => router.push('/(tabs)/food-library')}>
              <Text style={styles.manualLinkText}>🔍 Kézi keresés</Text>
            </Pressable>
          )}
        </View>
      </View>

      <FoodDetailModal
        food={foundFood}
        visible={detailVisible}
        onClose={() => { setDetailVisible(false); resetScan(); }}
        onLogAdded={() => { setDetailVisible(false); resetScan(); }}
        logSource="SCAN"
      />

      <AddFoodManualModal
        visible={manualVisible}
        prefillBarcode={scannedBarcode}
        onClose={() => { setManualVisible(false); resetScan(); }}
        onCreated={(food) => {
          setFoundFood(food);
          setDetailVisible(true);
        }}
      />
    </View>
  );
}

export default ScannerScreen;

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  blackBg: { flex: 1, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject },
  dimTop: { flex: 1.2, backgroundColor: 'rgba(0,0,0,0.6)' },
  middleRow: { flexDirection: 'row', height: 200 },
  dimSide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scanFrame: { width: 280, height: 200, position: 'relative', overflow: 'hidden' },
  corner: { position: 'absolute', width: 30, height: 30 },
  scanLine: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 3,
    borderRadius: 2,
  },
  stateOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  stateText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginTop: 10 },
  bottomPanel: {
    flex: 1.5,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing['2xl'],
    gap: Spacing.lg,
  },
  scanHint: { color: '#fff', fontSize: 15, fontWeight: '600', opacity: 0.9 },
  actionRow: { flexDirection: 'row', gap: Spacing.md, width: '100%' },
  actionBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.xl,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  actionBtnEmoji: { fontSize: 24 },
  actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  manualLink: {
    marginTop: Spacing.md,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.full,
  },
  manualLinkText: { color: '#fff', fontSize: 13, fontWeight: '600', opacity: 0.8 },
  permInner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  permCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius['3xl'],
    padding: Spacing['3xl'],
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  permEmoji: { fontSize: 64 },
  permTitle: { ...Typography.title, color: '#fff' },
  permDesc: { ...Typography.body, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  permBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 14,
    paddingHorizontal: 36,
  },
  permBtnText: { color: '#fff', fontWeight: 'bold' },
});