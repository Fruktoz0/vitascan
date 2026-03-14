import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Modal,
  ScrollView, ActivityIndicator, Alert, Share,
  Platform, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';

import { GlassCardSimple } from '../ui/GlassCard';
import { PrimaryButton, GhostButton } from '../ui/Button';
import { Colors, Gradients, Radius, Spacing, Typography } from '../../design/tokens';

// ─── API hívás (belső, közvetlen fetch) ───────────────────────────────────────

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3005';
let _token: string | null = null;
export function setExportToken(token: string | null) { _token = token; }

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${_token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Hiba az exportálás során.');
  }
  return res.json();
}

// ─── Dátum-preset opciók ─────────────────────────────────────────────────────

interface DatePreset {
  label: string;
  emoji: string;
  days: number;
}

const DATE_PRESETS: DatePreset[] = [
  { label: 'Utolsó 7 nap',  emoji: '📅', days: 7   },
  { label: 'Utolsó 30 nap', emoji: '📆', days: 30  },
  { label: 'Utolsó 90 nap', emoji: '🗓️', days: 90  },
  { label: 'Idei év',       emoji: '📊', days: 0   },  // 0 = idei év
  { label: 'Tavalyi év',    emoji: '📈', days: -1  },  // -1 = tavalyi év
];

function getDateRange(preset: DatePreset): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().split('T')[0];

  if (preset.days === 0) {
    // Idei év
    return { from: `${today.getFullYear()}-01-01`, to };
  }
  if (preset.days === -1) {
    // Tavalyi év
    const y = today.getFullYear() - 1;
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  const from = new Date(today);
  from.setDate(from.getDate() - preset.days + 1);
  return { from: from.toISOString().split('T')[0], to };
}

// ─── Preview kártya ───────────────────────────────────────────────────────────

interface PreviewData {
  from: string;
  to: string;
  days: number;
  logCount: number;
  waterCount: number;
  sheets: string[];
}

function PreviewCard({ data }: { data: PreviewData }) {
  return (
    <GlassCardSimple
      backgroundColor="rgba(46,204,113,0.07)"
      borderColor="rgba(46,204,113,0.25)"
    >
      <Text style={prevStyles.title}>📋 Export előnézet</Text>

      <View style={prevStyles.dateRow}>
        <Text style={prevStyles.dateLabel}>Időszak</Text>
        <Text style={prevStyles.dateValue}>
          {data.from} → {data.to}
        </Text>
      </View>

      <View style={prevStyles.statsRow}>
        <View style={prevStyles.statBox}>
          <Text style={prevStyles.statNum}>{data.days}</Text>
          <Text style={prevStyles.statLabel}>nap</Text>
        </View>
        <View style={prevStyles.statBox}>
          <Text style={prevStyles.statNum}>{data.logCount}</Text>
          <Text style={prevStyles.statLabel}>napló-sor</Text>
        </View>
        <View style={prevStyles.statBox}>
          <Text style={prevStyles.statNum}>{data.waterCount}</Text>
          <Text style={prevStyles.statLabel}>vízbejegyzés</Text>
        </View>
      </View>

      <Text style={prevStyles.sheetsLabel}>Munkafüzetek az XLSX-ben:</Text>
      <View style={prevStyles.sheetList}>
        {data.sheets.map((s) => (
          <View key={s} style={prevStyles.sheetRow}>
            <Text style={prevStyles.sheetCheck}>✓</Text>
            <Text style={prevStyles.sheetName}>{s}</Text>
          </View>
        ))}
      </View>
    </GlassCardSimple>
  );
}

const prevStyles = StyleSheet.create({
  title: { ...Typography.subtitle, color: Colors.text.primary, marginBottom: Spacing.md },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md },
  dateLabel: { ...Typography.label, color: Colors.text.muted },
  dateValue: { ...Typography.bodyMedium, color: Colors.text.primary },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statBox: {
    flex: 1, alignItems: 'center', backgroundColor: 'rgba(46,204,113,0.12)',
    borderRadius: Radius.lg, paddingVertical: Spacing.sm, gap: 2,
  },
  statNum: { fontSize: 24, fontWeight: '900', color: Colors.status.verified },
  statLabel: { ...Typography.caption, color: Colors.text.muted },
  sheetsLabel: { ...Typography.label, color: Colors.text.secondary, marginBottom: Spacing.xs },
  sheetList: { gap: 4 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sheetCheck: { color: Colors.status.verified, fontWeight: '900', fontSize: 14 },
  sheetName: { ...Typography.body, color: Colors.text.secondary },
});

// ─── Letöltés progress ────────────────────────────────────────────────────────

function DownloadProgress({ progress }: { progress: number }) {
  return (
    <View style={dlStyles.container}>
      <ActivityIndicator color={Colors.status.verified} size="small" />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={dlStyles.label}>
          {progress < 33 ? 'Adatok összegyűjtése...'
            : progress < 66 ? 'XLSX formázása...'
            : progress < 95 ? 'Fájl előkészítése...'
            : 'Letöltés...'}
        </Text>
        <View style={dlStyles.track}>
          <View style={[dlStyles.fill, { width: `${progress}%` }]} />
        </View>
      </View>
      <Text style={dlStyles.pct}>{Math.round(progress)}%</Text>
    </View>
  );
}

const dlStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  label: { ...Typography.caption, color: Colors.text.secondary },
  track: { height: 6, backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: Colors.status.verified, borderRadius: 3 },
  pct: { ...Typography.label, color: Colors.status.verified, width: 36, textAlign: 'right' },
});

// ─── Fő komponens ─────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ExportEngine({ visible, onClose }: Props) {
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>(DATE_PRESETS[1]);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [lastFilePath, setLastFilePath] = useState<string | null>(null);

  const { from, to } = getDateRange(selectedPreset);

  const loadPreview = useCallback(async (preset: DatePreset) => {
    const range = getDateRange(preset);
    setLoadingPreview(true);
    setPreview(null);
    setDone(false);
    try {
      const data = await apiGet<PreviewData>(`/export/preview?from=${range.from}&to=${range.to}`);
      setPreview(data);
    } catch (e: any) {
      Alert.alert('Hiba', e.message);
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  const handleSelectPreset = (p: DatePreset) => {
    setSelectedPreset(p);
    loadPreview(p);
  };

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadProgress(0);
    setDone(false);

    // Szimulált progress tick (a fetch nem ad real-time progress-t)
    const ticker = setInterval(() => {
      setDownloadProgress((p) => Math.min(p + 12, 88));
    }, 300);

    try {
      // Fájl letöltése
      const url = `${API_BASE}/export?from=${from}&to=${to}`;
      const filename = `vitascan_export_${from}_${to}.xlsx`;
      const fileUri = (FileSystem as any).documentDirectory + filename;

      const result = await FileSystem.downloadAsync(url, fileUri, {
        headers: { Authorization: `Bearer ${_token}` },
      });

      clearInterval(ticker);
      setDownloadProgress(100);

      if (result.status !== 200) {
        throw new Error('A szerver nem tudta előállítani a fájlt.');
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLastFilePath(result.uri);
      setDone(true);

    } catch (e: any) {
      clearInterval(ticker);
      setDownloadProgress(0);
      Alert.alert('Letöltési hiba', e.message);
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    if (!lastFilePath) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(lastFilePath, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'VitaScan adatok megosztása',
        });
      }
    } catch (e: any) {
      Alert.alert('Megosztási hiba', e.message);
    }
  };

  const handleClose = () => {
    setPreview(null);
    setDone(false);
    setDownloadProgress(0);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

        {/* Fejléc */}
        <LinearGradient
          colors={['#1A6B3C', '#2ECC71', '#A8EDBC']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <Pressable style={styles.closeBtn} onPress={handleClose} hitSlop={12}>
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>
          <Text style={styles.headerEmoji}>📤</Text>
          <Text style={styles.headerTitle}>Excel Export</Text>
          <Text style={styles.headerSub}>
            Töltsd le az összes adatodat professzionálisan formázott XLSX fájlban.
          </Text>
          <View style={styles.premiumBadge}>
            <Text style={styles.premiumBadgeText}>⭐ Premium funkció</Text>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {/* Időszak választó */}
          <Text style={styles.sectionLabel}>Exportálni kívánt időszak</Text>
          <View style={styles.presetGrid}>
            {DATE_PRESETS.map((p) => {
              const active = selectedPreset.label === p.label;
              return (
                <Pressable
                  key={p.label}
                  style={[styles.presetCard, active && styles.presetCardActive]}
                  onPress={() => handleSelectPreset(p)}
                >
                  <Text style={styles.presetEmoji}>{p.emoji}</Text>
                  <Text style={[styles.presetLabel, active && styles.presetLabelActive]}>
                    {p.label}
                  </Text>
                  {active && <View style={styles.presetActiveDot} />}
                </Pressable>
              );
            })}
          </View>

          {/* Dátum összefoglaló */}
          <View style={styles.dateRange}>
            <Text style={styles.dateRangeText}>
              📅 <Text style={{ fontWeight: '800' }}>{from}</Text>
              {' → '}
              <Text style={{ fontWeight: '800' }}>{to}</Text>
            </Text>
          </View>

          {/* Preview */}
          {loadingPreview && (
            <View style={styles.previewLoading}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.previewLoadingText}>Előnézet betöltése...</Text>
            </View>
          )}

          {preview && !loadingPreview && <PreviewCard data={preview} />}

          {!preview && !loadingPreview && (
            <GhostButton
              label="🔍 Előnézet betöltése"
              onPress={() => loadPreview(selectedPreset)}
            />
          )}

          {/* Letöltés progress */}
          {downloading && (
            <GlassCardSimple>
              <DownloadProgress progress={downloadProgress} />
            </GlassCardSimple>
          )}

          {/* Kész állapot */}
          {done && (
            <GlassCardSimple
              backgroundColor="rgba(46,204,113,0.1)"
              borderColor="rgba(46,204,113,0.4)"
            >
              <View style={styles.doneRow}>
                <Text style={styles.doneEmoji}>✅</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.doneTitle}>Letöltés kész!</Text>
                  <Text style={styles.doneSub}>
                    vitascan_export_{from}_{to}.xlsx
                  </Text>
                </View>
              </View>
              <Pressable style={styles.shareBtn} onPress={handleShare}>
                <Text style={styles.shareBtnText}>📤 Megosztás / Megnyitás</Text>
              </Pressable>
            </GlassCardSimple>
          )}

          {/* Tartalom leírás */}
          <GlassCardSimple backgroundColor="rgba(0,0,0,0.02)">
            <Text style={styles.contentsTitle}>Az XLSX fájl tartalma</Text>
            {[
              { sheet: '📝 Napló', desc: 'Minden bejegyzés időbélyeggel, étkezés-típussal, kalóriával és makrókkal' },
              { sheet: '📊 Napi összesítők', desc: 'Naponta összesített kalória, makrók és átlagok' },
              { sheet: '💧 Vízfogyasztás', desc: 'Vízfogyasztási naplóbejegyzések és napi összesítők' },
              { sheet: '👤 Profil', desc: 'Felhasználói profil, célok és export metaadatok' },
            ].map((item) => (
              <View key={item.sheet} style={styles.contentRow}>
                <Text style={styles.contentSheet}>{item.sheet}</Text>
                <Text style={styles.contentDesc}>{item.desc}</Text>
              </View>
            ))}
          </GlassCardSimple>

          {/* Letöltés gomb */}
          {!done && (
            <PrimaryButton
              label={downloading ? 'Generálás...' : '📥  Letöltés XLSX'}
              onPress={handleDownload}
              loading={downloading}
              disabled={downloading}
              size="lg"
            />
          )}

          {done && (
            <PrimaryButton
              label="📥  Újra letöltés"
              onPress={handleDownload}
              size="lg"
            />
          )}

          <GhostButton label="Bezárás" onPress={handleClose} />
          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: { padding: Spacing['2xl'], paddingTop: 48, alignItems: 'center', gap: Spacing.sm },
  closeBtn: {
    position: 'absolute', top: 16, right: 16, width: 32, height: 32,
    borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeIcon: { color: '#fff', fontSize: 14, fontWeight: '700' },
  headerEmoji: { fontSize: 52 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  headerSub: { ...Typography.body, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 22 },
  premiumBadge: {
    backgroundColor: 'rgba(255,215,0,0.25)', borderRadius: Radius.full,
    paddingVertical: 3, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.5)',
    marginTop: Spacing.xs,
  },
  premiumBadgeText: { color: '#FFD700', fontSize: 12, fontWeight: '800' },
  body: { padding: Spacing.xl, gap: Spacing.md },
  sectionLabel: { ...Typography.label, color: Colors.text.secondary },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  presetCard: {
    alignItems: 'center', gap: 4,
    backgroundColor: '#fff', borderRadius: Radius.lg,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg,
    borderWidth: 2, borderColor: '#E8E8E8',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
    minWidth: '30%', flex: 1,
  },
  presetCardActive: { borderColor: Colors.status.verified, backgroundColor: Colors.status.verifiedBg },
  presetEmoji: { fontSize: 22 },
  presetLabel: { ...Typography.caption, color: Colors.text.secondary, fontWeight: '600', textAlign: 'center' },
  presetLabelActive: { color: Colors.status.verified, fontWeight: '800' },
  presetActiveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.status.verified },
  dateRange: {
    backgroundColor: 'rgba(46,204,113,0.08)',
    borderRadius: Radius.md, padding: Spacing.sm,
    alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(46,204,113,0.2)',
  },
  dateRangeText: { ...Typography.body, color: Colors.text.secondary },
  previewLoading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, justifyContent: 'center', paddingVertical: Spacing.md },
  previewLoadingText: { ...Typography.body, color: Colors.text.muted },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  doneEmoji: { fontSize: 36 },
  doneTitle: { ...Typography.subtitle, color: Colors.status.verified },
  doneSub: { ...Typography.caption, color: Colors.text.muted, marginTop: 2 },
  shareBtn: {
    backgroundColor: Colors.status.verifiedBg,
    borderRadius: Radius.full, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1.5, borderColor: 'rgba(46,204,113,0.4)',
  },
  shareBtnText: { ...Typography.bodyMedium, color: Colors.status.verified },
  contentsTitle: { ...Typography.label, color: Colors.text.secondary, marginBottom: Spacing.sm },
  contentRow: { gap: 2, paddingVertical: Spacing.xs, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  contentSheet: { ...Typography.bodyMedium, color: Colors.text.primary, fontSize: 13 },
  contentDesc: { ...Typography.caption, color: Colors.text.muted, lineHeight: 17 },
});
