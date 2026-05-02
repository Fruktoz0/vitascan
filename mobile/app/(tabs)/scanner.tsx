import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, Platform
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
import { useTranslation } from 'react-i18next';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';

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
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const router = useRouter();

  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [foundFood, setFoundFood] = useState<Food | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [manualVisible, setManualVisible] = useState(false);
  const [lastBarcode, setLastBarcode] = useState('');
  const [torch, setTorch] = useState(false);

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
            <Text style={styles.permTitle}>{t('scannerScreen.cameraRequired')}</Text>
            <Text style={styles.permDesc}>
              {t('scannerScreen.cameraDesc')}
            </Text>
            <Pressable style={styles.permBtn} onPress={requestPermission}>
              <Text style={styles.permBtnText}>{t('scannerScreen.allow')}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.doodleBg} pointerEvents="none" />
      
      {/* Blobs & Doodles */}
      <View style={[styles.blob, styles.blobMint]} pointerEvents="none" />
      <View style={[styles.blob, styles.blobBlue]} pointerEvents="none" />
      <MaterialCommunityIcons name="food-apple-outline" size={70} color={Colors.dashboard.stroke} style={styles.appleDoodle} pointerEvents="none" />

      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <View style={styles.backBtnShadow} />
            <View style={styles.backBtnInner}>
              <MaterialIcons name="arrow-back" size={24} color={Colors.dashboard.stroke} />
            </View>
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>{t('scannerScreen.title', 'Szkennelés')}</Text>
          </View>
        </View>
      </SafeAreaView>

      <View style={styles.content}>
        {/* Scanner Card */}
        <View style={styles.scannerCardWrapper}>
          <View style={styles.scannerCardShadow} />
          <View style={styles.scannerCardInner}>
            {isCameraActive ? (
              <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="back"
                enableTorch={torch}
                onBarcodeScanned={scanState === 'idle' ? handleBarcode : undefined}
              />
            ) : (
              <View style={styles.cameraPlaceholder} />
            )}

            {/* Overlays inside the card */}
            <View style={styles.scannerOverlay} pointerEvents="none">
              {[
                { top: 40, left: 30, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 40 },
                { top: 40, right: 30, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 40 },
                { bottom: 40, left: 30, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 40 },
                { bottom: 40, right: 30, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 40 },
              ].map((s, i) => (
                <View
                  key={i}
                  style={[
                    styles.corner,
                    s as any,
                    { borderColor: scanState === 'found' ? '#2ECC71' : scanState === 'not_found' ? '#E74C3C' : Colors.dashboard.nutritionIcon }
                  ]}
                />
              ))}

              <View style={styles.scanTargetArea}>
                {scanState === 'idle' && isCameraActive && (
                  <Animated.View style={[styles.scanLine, scanLineStyle]} />
                )}
              </View>

              {scanState === 'scanning' && (
                <View style={styles.stateOverlay}>
                  <ActivityIndicator color={Colors.dashboard.stroke} size="large" />
                </View>
              )}
            </View>
          </View>
        </View>

        <Text style={styles.scanHint}>
          {scanState === 'idle' ? t('scannerScreen.aimBarcode', 'Helyezd a vonalkódot a\nkeretbe') : t('scannerScreen.inProgress', 'Keresés...')}
        </Text>
      </View>

      {/* Bottom Actions */}
      <SafeAreaView edges={['bottom']} style={styles.bottomArea}>
        <View style={styles.actionRow}>
          <Pressable style={styles.manualBtn} onPress={() => setManualVisible(true)}>
            <View style={styles.manualBtnInner}>
              <MaterialCommunityIcons name="keyboard-outline" size={26} color={Colors.dashboard.stroke} style={styles.manualBtnIcon} />
              <Text style={styles.manualBtnText}>{t('scannerScreen.manualSearch', 'Kód beírása\nmanuálisan')}</Text>
            </View>
          </Pressable>

          <Pressable style={styles.torchBtn} onPress={() => setTorch(!torch)}>
            <View style={styles.torchBtnInner}>
              <MaterialCommunityIcons name={torch ? "flashlight-off" : "flashlight"} size={22} color={Colors.dashboard.stroke} />
            </View>
          </Pressable>
        </View>
      </SafeAreaView>

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
  screen: {
    flex: 1,
    backgroundColor: Colors.dashboard.page,
  },
  doodleBg: {
    ...StyleSheet.absoluteFillObject,
  },
  blob: {
    position: 'absolute',
    opacity: 0.8,
  },
  blobMint: {
    width: 140,
    height: 140,
    backgroundColor: Colors.dashboard.blobMint,
    borderRadius: 70,
    top: 100,
    left: -40,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    borderTopLeftRadius: 40,
    borderBottomRightRadius: 80,
    borderBottomLeftRadius: 50,
  },
  blobBlue: {
    width: 160,
    height: 160,
    backgroundColor: Colors.dashboard.softBlue,
    borderRadius: 80,
    bottom: 80,
    right: -40,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    borderTopLeftRadius: 80,
    borderBottomRightRadius: 40,
    borderBottomLeftRadius: 40,
  },
  appleDoodle: {
    position: 'absolute',
    bottom: 200,
    left: 30,
    opacity: 0.2,
    transform: [{ rotate: '-10deg' }],
  },
  headerSafeArea: {
    backgroundColor: 'transparent',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 48,
    height: 48,
    position: 'relative',
  },
  backBtnShadow: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: -2,
    bottom: -2,
    backgroundColor: Colors.dashboard.shadowHard,
    borderRadius: 24,
  },
  backBtnInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    borderWidth: 0.8,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 24,
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
    fontSize: 24,
    fontWeight: '700',
    color: Colors.dashboard.stroke,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: 40,
  },
  scannerCardWrapper: {
    width: '85%',
    aspectRatio: 1, // Square
    maxWidth: 340,
    position: 'relative',
    marginBottom: Spacing.xl,
  },
  scannerCardShadow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dashboard.stroke,
    borderRadius: 36,
    top: 6,
    left: 4,
  },
  scannerCardInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    overflow: 'hidden',
  },
  cameraPlaceholder: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  cameraCutout: {
    flex: 1,
    margin: 20,
    borderRadius: 24,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
  },
  scanTargetArea: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  scanLine: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 3,
    backgroundColor: Colors.dashboard.stroke,
    shadowColor: Colors.dashboard.stroke,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  stateOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  scanHint: {
    ...Typography.title,
    fontSize: 22,
    color: Colors.dashboard.stroke,
    textAlign: 'center',
    lineHeight: 28,
    marginTop: Spacing.md,
  },
  bottomArea: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? 110 : 96,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xl,
  },
  manualBtn: {
    flex: 1,
    height: 60,
    position: 'relative',
  },
  manualBtnShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: Colors.dashboard.shadowHard,
    borderRadius: 30,
  },
  manualBtnInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dashboard.softOrange, // eadecc
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  manualBtnIcon: {
    position: 'absolute',
    left: Spacing.xl,
  },
  manualBtnText: {
    ...Typography.body,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.dashboard.stroke,
    textAlign: 'center',
  },
  torchBtn: {
    width: 60,
    height: 60,
    position: 'relative',
  },
  torchBtnShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: Colors.dashboard.shadowHard,
    borderRadius: 30,
  },
  torchBtnInner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Keep perm styles for permission screen
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