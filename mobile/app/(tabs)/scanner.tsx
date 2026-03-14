import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import { foodApi, Food } from '../../src/services/api';
import { ApiError } from '../../src/services/api';
import FoodDetailModal from '../../src/components/food/FoodDetailModal';
import AddFoodManualModal from '../../src/components/food/AddFoodManualModal';
import { Colors, Gradients, Radius, Spacing, Typography } from '../../src/design/tokens';

type ScanState = 'idle' | 'scanning' | 'found' | 'not_found' | 'error';

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const router = useRouter();

  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [foundFood, setFoundFood] = useState<Food | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [manualVisible, setManualVisible] = useState(false);
  const [lastBarcode, setLastBarcode] = useState('');

  // Scan-vonal animáció (Reanimated)
  const scanY = useSharedValue(0);
  React.useEffect(() => {
    scanY.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000 }),
        withTiming(0, { duration: 0 })
      ),
      -1
    );
  }, []);
  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanY.value * 140 }],
  }));

  const handleBarcode = async ({ data: barcode }: { data: string }) => {
    if (scanState === 'scanning' || barcode === lastBarcode) return;

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

  // ── Engedély megtagadva ──────────────────────────────────────────────────────
  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  if (!permission.granted) {
    return (
      <LinearGradient colors={['#1A1A2E', '#2D2D4E']} style={styles.permContainer}>
        <SafeAreaView style={styles.permInner}>
          <View style={styles.permCard}>
            <Text style={styles.permEmoji}>📷</Text>
            <Text style={styles.permTitle}>Kamera szükséges</Text>
            <Text style={styles.permDesc}>A vonalkód-szkennerhez kamera hozzáférés kell.</Text>
            <Pressable style={styles.permBtn} onPress={requestPermission}>
              <Text style={styles.permBtnText}>Engedélyezés</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ── Kamera UI ────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanState === 'idle' ? handleBarcode : undefined}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr', 'code128'] }}
      />

      {/* Sötétítő overlay */}
      <View style={styles.overlay} pointerEvents="box-none">
        {/* Top sötétítő */}
        <View style={styles.dimTop} />

        {/* Középső sor */}
        <View style={styles.middleRow}>
          <View style={styles.dimSide} />

          {/* Szkenner keret */}
          <View style={styles.scanFrame}>
            {/* Sarok dekorátorok */}
            {([
              { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
              { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
              { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
              { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },
            ] as any[]).map((s, i) => (
              <View key={i} style={[styles.corner, s, { borderColor: scanState === 'found' ? '#2ECC71' : scanState === 'not_found' ? '#E74C3C' : Colors.primary }]} />
            ))}

            {/* Scan vonal (idle állapotban) */}
            {scanState === 'idle' && (
              <Animated.View style={[styles.scanLine, scanLineStyle, { backgroundColor: Colors.primary }]} />
            )}

            {/* Állapot overlay a keret belsejében */}
            {scanState === 'scanning' && (
              <View style={styles.stateOverlay}>
                <ActivityIndicator color="#fff" size="large" />
                <Text style={styles.stateText}>Keresés...</Text>
              </View>
            )}
            {scanState === 'found' && (
              <View style={styles.stateOverlay}>
                <Text style={styles.stateEmoji}>✅</Text>
                <Text style={[styles.stateText, { color: '#2ECC71' }]}>Megtalálva!</Text>
              </View>
            )}
          </View>

          <View style={styles.dimSide} />
        </View>

        {/* Bottom panel */}
        <View style={styles.bottomPanel}>
          <Text style={styles.scanHint}>
            {scanState === 'idle' ? 'Tartsd a vonalkód fölé' :
              scanState === 'scanning' ? `Vonalkód: ${scannedBarcode}` :
              scanState === 'found' ? 'Étel megtalálva!' :
              scanState === 'not_found' ? 'Nem található az adatbázisban' :
              'Hiba történt'}
          </Text>

          {/* Not found gomb-sor */}
          {scanState === 'not_found' && (
            <View style={styles.notFoundActions}>
              <Pressable
                style={styles.actionBtn}
                onPress={() => { setManualVisible(true); }}
              >
                <Text style={styles.actionBtnEmoji}>✏️</Text>
                <Text style={styles.actionBtnText}>Manuális hozzáadás</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={resetScan}>
                <Text style={styles.actionBtnEmoji}>🔄</Text>
                <Text style={styles.actionBtnText}>Újrapróbálás</Text>
              </Pressable>
            </View>
          )}

          {/* Error gomb-sor */}
          {scanState === 'error' && (
            <Pressable style={[styles.actionBtn, { alignSelf: 'center' }]} onPress={resetScan}>
              <Text style={styles.actionBtnText}>🔄 Újra</Text>
            </Pressable>
          )}

          {/* Kézi keresés link */}
          {scanState === 'idle' && (
            <Pressable
              style={styles.manualSearchBtn}
              onPress={() => router.push('/(tabs)/food-library')}
            >
              <Text style={styles.manualSearchText}>🔍 Inkább kézzel keresek</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Étel részlet modal */}
      <FoodDetailModal
        food={foundFood}
        visible={detailVisible}
        onClose={() => { setDetailVisible(false); resetScan(); }}
        onLogAdded={() => { setDetailVisible(false); resetScan(); }}
        logSource="SCAN"
      />

      {/* Manuális hozzáadás modal */}
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

const styles = StyleSheet.create({
  // Overlay
  overlay: { flex: 1 },
  dimTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  middleRow: { flexDirection: 'row', height: 200 },
  dimSide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  scanFrame: { width: 280, height: 200, position: 'relative', overflow: 'hidden' },
  corner: { position: 'absolute', width: 28, height: 28 },
  scanLine: {
    position: 'absolute', left: 16, right: 16,
    height: 2.5, borderRadius: 2, opacity: 0.9,
  },
  stateOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: 'rgba(0,0,0,0.3)',
  },
  stateEmoji: { fontSize: 40 },
  stateText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // Bottom panel
  bottomPanel: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', paddingTop: Spacing.xl, gap: Spacing.lg,
    paddingHorizontal: Spacing['2xl'],
  },
  scanHint: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  notFoundActions: { flexDirection: 'row', gap: Spacing.md },
  actionBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: Radius.xl, padding: Spacing.md,
    alignItems: 'center', gap: 6, flex: 1,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  actionBtnEmoji: { fontSize: 26 },
  actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  manualSearchBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.full, paddingVertical: 10, paddingHorizontal: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  manualSearchText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },

  // Permission
  permContainer: { flex: 1 },
  permInner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['2xl'] },
  permCard: {
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: Radius['3xl'],
    padding: Spacing['3xl'], alignItems: 'center', gap: Spacing.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  permEmoji: { fontSize: 60 },
  permTitle: { ...Typography.title, color: '#fff', textAlign: 'center' },
  permDesc: { ...Typography.body, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 22 },
  permBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingVertical: 14, paddingHorizontal: 32, marginTop: Spacing.sm,
  },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
