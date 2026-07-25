import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MaterialIcons, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import * as Haptics from '../src/services/haptics';

import { Colors, Spacing } from '../src/design/tokens';
import { profileApi } from '../src/services/api';
import { useAuthStore } from '../src/stores/authStore';
import { ResponsiveLayout, webPointer } from '../src/components/layout/ResponsiveLayout';
import { useResponsive } from '../src/hooks/useResponsive';

type Gender = 'MALE' | 'FEMALE';
type ActivityKey = 'SEDENTARY' | 'ACTIVE' | 'VERY_ACTIVE';

type FieldCardProps = {
  icon: React.ReactNode;
  label: string;
  highlighted?: boolean;
  children: React.ReactNode;
};

function FieldCard({ icon, label, highlighted, children }: FieldCardProps) {
  return (
    <View style={styles.fieldWrapper}>
      <View style={styles.fieldShadow} />
      <View style={[styles.fieldInner, highlighted && styles.fieldInnerHighlight]}>
        <View style={styles.fieldLabelRow}>
          {icon}
          <Text style={styles.fieldLabel}>{label}</Text>
        </View>
        {children}
      </View>
    </View>
  );
}

export default function PersonalDataScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isDesktop } = useResponsive();
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(user?.username ?? '');
  const [birthDate, setBirthDate] = useState('01/01/1990');
  const [heightCm, setHeightCm] = useState('175');
  const [gender, setGender] = useState<Gender>('MALE');
  const [activity, setActivity] = useState<ActivityKey>('ACTIVE');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    profileApi.getMe()
      .then((p: any) => {
        if (!active) return;
        const prof = p?.profile;
        if (p?.username) setName(p.username);
        if (prof?.heightCm) setHeightCm(String(prof.heightCm));
        if (prof?.birthYear) setBirthDate(`01/01/${prof.birthYear}`);
        if (prof?.gender === 'FEMALE') setGender('FEMALE');
        else if (prof?.gender === 'MALE') setGender('MALE');
        if (prof?.activityLevel === 'SEDENTARY' || prof?.activityLevel === 'LIGHT') setActivity('SEDENTARY');
        else if (prof?.activityLevel === 'VERY_ACTIVE') setActivity('VERY_ACTIVE');
        else setActivity('ACTIVE');
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const heightNum = Number(heightCm);
      const yearMatch = birthDate.match(/(\d{4})/);
      const birthYear = yearMatch ? Number(yearMatch[1]) : undefined;
      const activityLevel = activity === 'SEDENTARY' ? 'LIGHT' : activity === 'VERY_ACTIVE' ? 'VERY_ACTIVE' : 'ACTIVE';
      await profileApi.update({
        heightCm: Number.isFinite(heightNum) ? heightNum : undefined,
        birthYear: Number.isFinite(birthYear ?? NaN) ? birthYear : undefined,
        gender,
        activityLevel,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t('personalData.saved'), t('personalData.savedDesc'));
      router.back();
    } catch (e: any) {
      Alert.alert(t('personalData.saveFailed'), e?.message ?? t('personalData.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const activityOptions: { key: ActivityKey; label: string }[] = useMemo(() => ([
    { key: 'SEDENTARY', label: t('personalData.activitySedentary') },
    { key: 'ACTIVE', label: t('personalData.activityActive') },
    { key: 'VERY_ACTIVE', label: t('personalData.activityVery') },
  ]), [t]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={Colors.dashboard.stroke} />
        </View>
      </View>
    );
  }

  return (
    <ResponsiveLayout>
    <View style={styles.screen}>
      <View style={[styles.blob, styles.blobMint]} pointerEvents="none" />
      <View style={[styles.blob, styles.blobPeach]} pointerEvents="none" />

      <SafeAreaView edges={['top']} style={{ backgroundColor: 'transparent' }}>
        <View style={styles.header}>
          <Pressable style={[styles.backBtn, webPointer]} onPress={() => router.back()} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.dashboard.stroke} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{t('personalData.screenTitle')}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
      >
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={isDesktop ? styles.formGrid : undefined}>
          <View style={isDesktop ? styles.formCol : undefined}>
          <FieldCard
            icon={<Ionicons name="person-outline" size={16} color={Colors.dashboard.stroke} />}
            label={t('personalData.name')}
          >
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('personalData.namePlaceholder')}
              placeholderTextColor="#9C9C9C"
              style={styles.textInput}
              onFocus={() => setFocusedField('name')}
              onBlur={() => setFocusedField(null)}
            />
          </FieldCard>

          <FieldCard
            icon={<MaterialIcons name="event" size={16} color={Colors.dashboard.stroke} />}
            label={t('personalData.birthDate')}
          >
            <View style={styles.rowBetween}>
              <TextInput
                value={birthDate}
                onChangeText={setBirthDate}
                placeholder={t('personalData.birthDatePlaceholder')}
                placeholderTextColor="#9C9C9C"
                style={[styles.textInput, { flex: 1 }]}
                onFocus={() => setFocusedField('birth')}
                onBlur={() => setFocusedField(null)}
              />
              <MaterialCommunityIcons name="calendar-month-outline" size={20} color={Colors.dashboard.stroke} />
            </View>
          </FieldCard>

          <FieldCard
            icon={<MaterialCommunityIcons name="human-male-height" size={16} color={Colors.dashboard.stroke} />}
            label={t('personalData.height')}
            highlighted={focusedField !== 'name' && focusedField !== 'birth'}
          >
            <View style={styles.heightRow}>
              <TextInput
                value={heightCm}
                onChangeText={(v) => setHeightCm(v.replace(/[^0-9.]/g, ''))}
                keyboardType="numeric"
                style={styles.heightValue}
                onFocus={() => setFocusedField('height')}
                onBlur={() => setFocusedField(null)}
              />
              <Text style={styles.heightUnit}>{t('personalData.heightUnit')}</Text>
            </View>
          </FieldCard>
          </View>

          <View style={isDesktop ? styles.formCol : undefined}>
          <FieldCard
            icon={<Ionicons name="male-female-outline" size={16} color={Colors.dashboard.stroke} />}
            label={t('personalData.gender')}
          >
            <View style={styles.chipRow}>
              <Pressable
                onPress={() => setGender('MALE')}
                style={[styles.chip, gender === 'MALE' && styles.chipActive, webPointer]}
              >
                <Text style={[styles.chipText, gender === 'MALE' && styles.chipTextActive]}>
                  {t('personalData.genderMale')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setGender('FEMALE')}
                style={[styles.chip, gender === 'FEMALE' && styles.chipActive, webPointer]}
              >
                <Text style={[styles.chipText, gender === 'FEMALE' && styles.chipTextActive]}>
                  {t('personalData.genderFemale')}
                </Text>
              </Pressable>
            </View>
          </FieldCard>

          <FieldCard
            icon={<Ionicons name="bicycle-outline" size={16} color={Colors.dashboard.stroke} />}
            label={t('personalData.activityLevel')}
          >
            <View style={{ gap: 8, marginTop: 4 }}>
              {activityOptions.map((opt) => {
                const active = activity === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setActivity(opt.key)}
                    style={[styles.radioRow, active && styles.radioRowActive, webPointer]}
                  >
                    <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
                      {active && <View style={styles.radioDot} />}
                    </View>
                    <Text style={[styles.radioLabel, active && styles.radioLabelActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </FieldCard>
          </View>
          </View>

          <View style={{ height: 80 }} />
        </ScrollView>

        <SafeAreaView edges={['bottom']} style={styles.saveBarWrap}>
          <Pressable
            disabled={saving}
            onPress={handleSave}
            style={({ pressed }) => [styles.saveBtn, webPointer, pressed && { opacity: 0.85 }]}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveBtnText}>{t('personalData.save')}</Text>
            )}
          </Pressable>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
    </ResponsiveLayout>
  );
}

const STROKE = Colors.dashboard.stroke;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.dashboard.page },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'flex-start',
  },
  formCol: {
    flex: 1,
    minWidth: 280,
    gap: 12,
  },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  blob: {
    position: 'absolute',
    borderWidth: 1.5, borderColor: STROKE,
  },
  blobMint: {
    width: 200, height: 200,
    top: -60, right: -60,
    backgroundColor: 'rgba(232,245,233,0.6)',
    borderTopLeftRadius: 100,
    borderTopRightRadius: 80,
    borderBottomRightRadius: 110,
    borderBottomLeftRadius: 90,
  },
  blobPeach: {
    width: 160, height: 160,
    bottom: 100, left: -60,
    backgroundColor: 'rgba(255,218,214,0.55)',
    borderTopLeftRadius: 90,
    borderTopRightRadius: 60,
    borderBottomRightRadius: 100,
    borderBottomLeftRadius: 80,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: STROKE },

  scroll: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 14,
  },

  fieldWrapper: { position: 'relative', paddingRight: 4, paddingBottom: 4 },
  fieldShadow: {
    position: 'absolute', top: 4, left: 4, right: 0, bottom: 0,
    backgroundColor: STROKE, borderRadius: 22,
  },
  fieldInner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.4,
    borderColor: STROKE,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 4,
  },
  fieldInnerHighlight: {
    backgroundColor: '#F4E5C2',
  },
  fieldLabelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 2,
  },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: STROKE, letterSpacing: 0.4 },
  textInput: {
    fontSize: 16,
    fontWeight: '600',
    color: STROKE,
    paddingVertical: 4,
  },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },

  heightRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  heightValue: {
    fontSize: 32,
    fontWeight: '900',
    color: STROKE,
    letterSpacing: -0.5,
    flex: 1,
    textAlign: 'center',
    paddingVertical: 0,
  },
  heightUnit: { fontSize: 14, fontWeight: '700', color: STROKE, paddingBottom: 4 },

  chipRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.4,
    borderColor: STROKE,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: '#D7EBD2' },
  chipText: { fontSize: 14, fontWeight: '700', color: STROKE },
  chipTextActive: { color: STROKE, fontWeight: '800' },

  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.2,
    borderColor: 'rgba(28,27,27,0.25)',
    backgroundColor: '#FFFFFF',
  },
  radioRowActive: {
    borderColor: STROKE,
    borderWidth: 1.4,
  },
  radioOuter: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 1.4, borderColor: STROKE,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  radioOuterActive: { backgroundColor: STROKE },
  radioDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  radioLabel: { fontSize: 14, fontWeight: '600', color: STROKE },
  radioLabelActive: { fontWeight: '800' },

  saveBarWrap: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  saveBtn: {
    backgroundColor: STROKE,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
