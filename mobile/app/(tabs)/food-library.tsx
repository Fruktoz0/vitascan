import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList,
  Pressable, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import i18n from '../../src/i18n';

import { foodApi, Food } from '../../src/services/api';
import FoodDetailModal from '../../src/components/food/FoodDetailModal';
import AddFoodManualModal from '../../src/components/food/AddFoodManualModal';
import { GlassCardSimple } from '../../src/components/ui/GlassCard';
import { Colors, Gradients, Radius, Spacing, Typography } from '../../src/design/tokens';

type FilterStatus = 'all' | 'VERIFIED' | 'UNVERIFIED';

// ─── FoodRow ──────────────────────────────────────────────────────────────────
function FoodRow({ food, onPress }: { food: Food; onPress: () => void }) {
  const isVerified = food.status === 'VERIFIED';
  const displayName = (i18n.language === 'en' ? food.nameEn : food.nameHu) ?? food.displayName ?? food.name;

  return (
    <Pressable
      style={({ pressed }) => [rowStyles.card, pressed && { opacity: 0.85 }]}
      onPress={onPress}
    >
      {/* Bal szín-csík */}
      <View style={[rowStyles.stripe, { backgroundColor: isVerified ? Colors.status.verified : Colors.macro.carbs }]} />

      <View style={rowStyles.content}>
        <View style={rowStyles.nameRow}>
          <Text style={rowStyles.name} numberOfLines={1}>{displayName}</Text>
          <View style={rowStyles.badges}>
            {isVerified && <Text style={rowStyles.verifiedDot}>✅</Text>}
            {(food.creator?.reputation ?? 0) >= 10 && <Text style={rowStyles.expertDot}>🏆</Text>}
          </View>
        </View>
        <Text style={rowStyles.meta} numberOfLines={1}>
          {food.brand ? `${food.brand} · ` : ''}
          💪 {food.protein}g · 🌾 {food.carbs}g · 🥑 {food.fat}g
        </Text>
      </View>

      <View style={rowStyles.right}>
        <Text style={rowStyles.kcal}>{food.kcal}</Text>
        <Text style={rowStyles.kcalUnit}>kcal</Text>
      </View>
    </Pressable>
  );
}

const rowStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: Radius.lg,
    overflow: 'hidden', marginBottom: Spacing.xs,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  stripe: { width: 4, alignSelf: 'stretch' },
  content: { flex: 1, padding: Spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { flex: 1, ...Typography.bodyMedium, color: Colors.text.primary },
  badges: { flexDirection: 'row', gap: 2 },
  verifiedDot: { fontSize: 13 },
  expertDot: { fontSize: 12 },
  meta: { ...Typography.caption, color: Colors.text.muted, marginTop: 3 },
  right: { paddingRight: Spacing.md, alignItems: 'center' },
  kcal: { fontSize: 18, fontWeight: '900', color: Colors.primary },
  kcalUnit: { ...Typography.caption, color: Colors.text.muted },
});

// ─── Főképernyő ───────────────────────────────────────────────────────────────
export default function FoodLibraryScreen() {
  const { t } = useTranslation();
  const filterOptions: { value: FilterStatus; label: string; emoji: string }[] = [
    { value: 'all', label: t('food.all'), emoji: '🍽️' },
    { value: 'VERIFIED', label: t('food.verified'), emoji: '✅' },
    { value: 'UNVERIFIED', label: t('food.new'), emoji: '🆕' },
  ];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const statusParam = filterStatus !== 'all' ? filterStatus : undefined;
      const { foods } = await foodApi.search(q, { limit: 30 });
      // Kliens oldali státusz szűrés
      const filtered = statusParam ? foods.filter((f) => f.status === statusParam) : foods;
      setResults(filtered);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(text), 350);
  };

  const handleSelectFood = async (food: Food) => {
    try {
      const detail = await foodApi.getById(food.id);
      setSelectedFood(detail);
      setDetailVisible(true);
    } catch {
      setSelectedFood(food);
      setDetailVisible(true);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FAFAFA' }}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Fejléc gradiens */}
        <LinearGradient
          colors={['#FF9A6C', '#FFD4B8']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.headerTitle}>🍎 {t('food.libraryTitle')}</Text>
              <Text style={styles.headerSub}>{t('food.librarySubtitle')}</Text>
            </View>
            <Pressable style={styles.addBtn} onPress={() => setAddVisible(true)}>
              <Text style={styles.addBtnText}>+ {t('food.newFood')}</Text>
            </Pressable>
          </View>

          {/* Keresőmező */}
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={handleQueryChange}
              placeholder={t('food.searchPlaceholder')}
              placeholderTextColor={Colors.text.muted}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
        </LinearGradient>

        {/* Szűrők */}
        <View style={styles.filterBar}>
          <View style={styles.filterChips}>
            {filterOptions.map((f) => (
              <Pressable
                key={f.value}
                style={[styles.chip, filterStatus === f.value && styles.chipActive]}
                onPress={() => { setFilterStatus(f.value); if (query.length >= 2) doSearch(query); }}
              >
                <Text style={[styles.chipText, filterStatus === f.value && styles.chipTextActive]}>
                  {f.emoji} {f.label}
                </Text>
              </Pressable>
            ))}
          </View>

        </View>

        {/* Lista */}
        {loading && query.length >= 2 ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={styles.loadingText}>{t('food.searching')}</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item, i) => item.id ?? String(i)}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <FoodRow food={item} onPress={() => handleSelectFood(item)} />
            )}
            ListEmptyComponent={
              query.length >= 2 && !loading ? (
                <GlassCardSimple style={styles.emptyCard}>
                  <Text style={styles.emptyEmoji}>🔍</Text>
                  <Text style={styles.emptyTitle}>{t('food.noResults')}</Text>
                  <Text style={styles.emptyDesc}>
                    {t('food.notFound', { query })}
                  </Text>
                  <Pressable style={styles.addNewBtn} onPress={() => setAddVisible(true)}>
                    <Text style={styles.addNewBtnText}>+ {t('food.addManual')}</Text>
                  </Pressable>
                </GlassCardSimple>
              ) : query.length < 2 ? (
                <GlassCardSimple style={styles.emptyCard}>
                  <Text style={styles.emptyEmoji}>👆</Text>
                  <Text style={styles.emptyTitle}>{t('food.startTyping')}</Text>
                  <Text style={styles.emptyDesc}>{t('food.minChars')}</Text>
                </GlassCardSimple>
              ) : null
            }
          />
        )}
      </SafeAreaView>

      {/* Étel részlet modal */}
      <FoodDetailModal
        food={selectedFood}
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
        logSource="SEARCH"
      />

      {/* Manuális hozzáadás */}
      <AddFoodManualModal
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        onCreated={(food) => {
          setAddVisible(false);
          setSelectedFood(food);
          setDetailVisible(true);
          if (query.length >= 2) doSearch(query);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: Spacing.xl, paddingTop: Spacing['2xl'], gap: Spacing.md },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#fff' },
  headerSub: { ...Typography.caption, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  addBtn: {
    backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: Radius.full,
    paddingVertical: 8, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
  },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: '#fff', borderRadius: Radius.xl, paddingHorizontal: Spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, paddingVertical: 14, fontSize: 15, color: Colors.text.primary },
  filterBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
    gap: Spacing.sm,
  },
  filterChips: { flex: 1, flexDirection: 'row', gap: 6 },
  chip: {
    paddingVertical: 5, paddingHorizontal: 10,
    backgroundColor: '#F5F5F5', borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  chipText: { ...Typography.caption, color: Colors.text.secondary, fontWeight: '600' },
  chipTextActive: { color: Colors.primary, fontWeight: '800' },
  list: { padding: Spacing.lg, paddingBottom: 120 },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingTop: 60 },
  loadingText: { ...Typography.body, color: Colors.text.muted },
  emptyCard: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing['3xl'], margin: Spacing.lg },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { ...Typography.subtitle, color: Colors.text.primary },
  emptyDesc: { ...Typography.body, color: Colors.text.muted, textAlign: 'center', lineHeight: 22 },
  addNewBtn: {
    marginTop: Spacing.sm, backgroundColor: Colors.primary,
    borderRadius: Radius.full, paddingVertical: 10, paddingHorizontal: 20,
  },
  addNewBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
