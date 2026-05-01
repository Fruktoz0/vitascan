import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView,
  TextInput, Pressable, ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import i18n from '../../i18n';
import { Food, foodApi } from '../../services/api';
import { GlassCardSimple } from '../ui/GlassCard';
import { Colors, Spacing } from '../../design/tokens';

interface Props {
  visible: boolean;
  prefillBarcode?: string;
  prefillName?: string;
  onClose: () => void;
  onCreated?: (food: Food) => void;
}

export default function AddFoodManualModal({ visible, prefillBarcode, prefillName, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState(prefillName ?? prefillBarcode ?? '');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Food[]>([]);
  const cleanQuery = query.trim();

  useEffect(() => {
    if (!visible) return;
    setQuery(prefillName ?? prefillBarcode ?? '');
  }, [visible, prefillName, prefillBarcode]);

  useEffect(() => {
    if (!visible) return;
    if (cleanQuery.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { foods } = await foodApi.search(cleanQuery, { limit: 20 });
        setResults(foods);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [cleanQuery, visible]);

  const getDisplayName = (food: Food) =>
    (i18n.language === 'en' ? food.nameEn : food.nameHu) ?? food.displayName ?? food.name;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={[styles.headerBand, { paddingTop: Math.max(insets.top + 1, 8) }]}>
          <View style={styles.headerTop}>
            <Pressable style={styles.iconBtnWrap} onPress={onClose} hitSlop={8}>
              <View style={styles.iconBtnShadow} />
              <View style={styles.iconBtnInner}>
                <MaterialIcons name="arrow-back" size={20} color={Colors.dashboard.stroke} />
              </View>
            </Pressable>
            <Text style={styles.title} numberOfLines={1}>Etel hozzaadasa</Text>
          </View>
          <View style={styles.searchWrap}>
            <View style={styles.searchShadow} />
            <View style={styles.searchBox}>
              <MaterialIcons name="search" size={18} color={Colors.dashboard.tabInactive} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('food.searchPlaceholder')}
                placeholderTextColor={Colors.dashboard.tabInactive}
                style={styles.searchInput}
              />
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabRowContent}
            style={styles.tabRow}
          >
            {['Legutobbiak', 'Kedvencek', 'Gyakori', 'Sajat etelek'].map((label, idx) => (
              <Pressable key={label} style={styles.tabChipWrap}>
                <View style={styles.tabChipShadow} />
                <View style={[styles.tabChip, idx === 0 && styles.tabChipActive]}>
                  <Text style={[styles.tabChipText, idx === 0 && styles.tabChipTextActive]}>{label}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.body}>
          <GlassCardSimple>
            {cleanQuery.length < 2 ? (
              <View style={styles.skeletonWrap}>
                {[0, 1, 2, 3].map((row) => (
                  <View key={row} style={styles.skeletonRow}>
                    <View style={styles.skeletonAvatar} />
                    <View style={styles.skeletonTextCol}>
                      <View style={[styles.skeletonLine, styles.skeletonLineMain]} />
                      <View style={[styles.skeletonLine, styles.skeletonLineSub]} />
                    </View>
                    <View style={styles.skeletonCircle} />
                  </View>
                ))}
              </View>
            ) : loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color={Colors.dashboard.stroke} />
                <Text style={styles.emptyHint}>{t('food.searching')}</Text>
              </View>
            ) : results.length === 0 ? (
              <View style={styles.loadingWrap}>
                <Text style={styles.emptyHint}>{t('food.noResults')}</Text>
              </View>
            ) : (
              results.map((food) => (
                <Pressable key={food.id} style={styles.quickRow} onPress={() => onCreated?.(food)}>
                  <Text style={styles.quickEmoji}>🍽️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.quickName} numberOfLines={1}>{getDisplayName(food)}</Text>
                    <Text style={styles.quickMeta}>{Math.round(food.kcal)} kcal / 100g</Text>
                  </View>
                  <View style={styles.quickAddBtn}>
                    <MaterialIcons name="add" size={18} color={Colors.dashboard.stroke} />
                  </View>
                </Pressable>
              ))
            )}
          </GlassCardSimple>

          <Pressable style={styles.scanCardWrap}>
            <View style={styles.scanCardShadow} />
            <View style={styles.scanCard}>
              <View style={styles.scanIconWrap}>
                <MaterialIcons name="qr-code-scanner" size={22} color={Colors.dashboard.stroke} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.scanTitle}>Vonalkod beolvasasa</Text>
                <Text style={styles.scanSub}>Gyorsabb hozzaadas termekekhez</Text>
              </View>
              <MaterialIcons name="arrow-forward-ios" size={14} color={Colors.dashboard.tabInactive} />
            </View>
          </Pressable>
          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dashboard.page },
  headerBand: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.sm, gap: Spacing.xs },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    position: 'relative',
  },
  iconBtnWrap: { width: 40, height: 40, position: 'absolute', left: 0, top: 0 },
  iconBtnShadow: {
    position: 'absolute', top: 3, left: 3, right: -1, bottom: -1,
    borderRadius: 20, backgroundColor: Colors.dashboard.shadowHard,
  },
  iconBtnInner: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.dashboard.stroke,
    textAlign: 'center',
  },
  searchWrap: { height: 52, marginTop: 10 },
  searchShadow: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: -1,
    bottom: -1,
    borderRadius: 26,
    backgroundColor: Colors.dashboard.shadowHard,
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: Colors.dashboard.stroke,
    borderRadius: 26, paddingHorizontal: 14, ...StyleSheet.absoluteFillObject,
  },
  searchInput: { flex: 1, paddingVertical: 12, color: Colors.dashboard.stroke, fontSize: 14 },
  tabRow: { marginTop: 10 },
  tabRowContent: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  tabChipWrap: { height: 32 },
  tabChipShadow: { display: 'none' },
  tabChip: {
    borderWidth: 1.2, borderColor: Colors.dashboard.stroke, borderRadius: 16,
    paddingVertical: 5, paddingHorizontal: 10, backgroundColor: '#d5e6f0',
  },
  tabChipActive: { backgroundColor: '#dbead0' },
  tabChipText: { fontSize: 12, color: Colors.dashboard.tabInactive, fontWeight: '600' },
  tabChipTextActive: { color: Colors.dashboard.stroke },
  body: { padding: Spacing.xl, gap: Spacing.md },
  skeletonWrap: { gap: 12, paddingVertical: 4 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  skeletonAvatar: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: '#e5e5e5',
    borderWidth: 1.1, borderColor: Colors.dashboard.strokeSoft,
  },
  skeletonTextCol: { flex: 1, gap: 6 },
  skeletonLine: {
    height: 10, borderRadius: 999, backgroundColor: '#e8e8e8',
    borderWidth: 1, borderColor: Colors.dashboard.strokeSoft,
  },
  skeletonLineMain: { width: '62%' },
  skeletonLineSub: { width: '38%' },
  skeletonCircle: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#e5e5e5',
    borderWidth: 1.1, borderColor: Colors.dashboard.strokeSoft,
  },
  loadingWrap: { paddingVertical: 18, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyHint: { fontSize: 13, color: Colors.dashboard.tabInactive, fontWeight: '600' },
  quickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  quickEmoji: { fontSize: 22 },
  quickName: { fontSize: 16, fontWeight: '700', color: Colors.dashboard.stroke },
  quickMeta: { fontSize: 12, color: Colors.dashboard.tabInactive, marginTop: 2 },
  quickAddBtn: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: Colors.dashboard.stroke,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#cddfd3',
  },
  scanCardWrap: { height: 76 },
  scanCardShadow: {
    position: 'absolute', top: 2, left: 2, right: 0, bottom: 0,
    borderRadius: 24, backgroundColor: Colors.dashboard.shadowHard, opacity: 0.9,
  },
  scanCard: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5, borderColor: Colors.dashboard.stroke, borderRadius: 24,
    backgroundColor: '#d8eadf', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14,
  },
  scanIconWrap: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.dashboard.stroke,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#ecf4ec',
  },
  scanTitle: { fontSize: 15, fontWeight: '800', color: Colors.dashboard.stroke },
  scanSub: { fontSize: 12, color: Colors.dashboard.tabInactive, marginTop: 2 },
});
