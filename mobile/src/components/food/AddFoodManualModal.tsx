import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView,
  TextInput, Pressable, Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { foodApi } from '../../services/api';
import { GlassCardSimple } from '../ui/GlassCard';
import { PrimaryButton, GhostButton } from '../ui/Button';
import { Colors, Radius, Spacing, Typography } from '../../design/tokens';

interface Props {
  visible: boolean;
  prefillBarcode?: string;
  prefillName?: string;
  onClose: () => void;
  onCreated?: (food: any) => void;
}

interface Field {
  key: string;
  labelKey: string;
  placeholder: string;
  required?: boolean;
  keyboard?: 'default' | 'decimal-pad';
  emoji: string;
}

const FIELDS: Field[] = [
  { key: 'name',    labelKey: 'food.foodName', placeholder: 'e.g. Greek yogurt', required: true, emoji: '🍽️' },
  { key: 'brand',   labelKey: 'food.brandOptional', placeholder: 'e.g. Danone', emoji: '🏷️' },
  { key: 'barcode', labelKey: 'food.barcodeOptional', placeholder: '12345678', emoji: '📊' },
];

const NUTRI_FIELDS: Field[] = [
  { key: 'kcal',    labelKey: 'food.caloriesPer100g', placeholder: '150',  required: true, keyboard: 'decimal-pad', emoji: '🔥' },
  { key: 'protein', labelKey: 'food.proteinPer100g', placeholder: '10',  required: true, keyboard: 'decimal-pad', emoji: '💪' },
  { key: 'carbs',   labelKey: 'food.carbsPer100g', placeholder: '20',  required: true, keyboard: 'decimal-pad', emoji: '🌾' },
  { key: 'fat',     labelKey: 'food.fatPer100g', placeholder: '5',   required: true, keyboard: 'decimal-pad', emoji: '🥑' },
  { key: 'fiber',   labelKey: 'food.fiberPer100g', placeholder: '1.5', keyboard: 'decimal-pad', emoji: '🌿' },
  { key: 'sugar',   labelKey: 'food.sugarPer100g', placeholder: '8',   keyboard: 'decimal-pad', emoji: '🍬' },
];

export default function AddFoodManualModal({ visible, prefillBarcode, prefillName, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, string>>({
    name: prefillName ?? '',
    barcode: prefillBarcode ?? '',
  });
  const [saving, setSaving] = useState(false);

  const set = (key: string, val: string) => setValues((v) => ({ ...v, [key]: val }));

  const handleSave = async () => {
    // Kötelező mezők
    const missing = [...FIELDS, ...NUTRI_FIELDS]
      .filter((f) => f.required && !values[f.key]?.trim());
    if (missing.length) {
      Alert.alert(t('food.missingDataTitle'), t('food.fillFields', { fields: missing.map((f) => t(f.labelKey)).join(', ') }));
      return;
    }

    setSaving(true);
    try {
      const food = await foodApi.create({
        name: values.name.trim(),
        brand: values.brand?.trim() || undefined,
        barcode: values.barcode?.trim() || undefined,
        kcal: parseFloat(values.kcal),
        protein: parseFloat(values.protein),
        carbs: parseFloat(values.carbs),
        fat: parseFloat(values.fat),
        fiber: values.fiber ? parseFloat(values.fiber) : undefined,
        sugar: values.sugar ? parseFloat(values.sugar) : undefined,
        source: 'USER_SCAN',
      });
      onCreated?.(food);
      onClose();
    } catch (e: any) {
      Alert.alert(t('food.errorTitle'), e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>➕ {t('food.manualAddTitle')}</Text>
          <Text style={styles.subtitle}>
            {t('food.manualAddSubtitle')}
          </Text>
        </View>

        <View style={styles.body}>
          {/* Alap adatok */}
          <GlassCardSimple>
            <Text style={styles.sectionLabel}>{t('food.baseData')}</Text>
            {FIELDS.map((f) => (
              <View key={f.key} style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>{f.emoji} {t(f.labelKey)}{f.required ? ' *' : ''}</Text>
                <TextInput
                  style={styles.input}
                  value={values[f.key] ?? ''}
                  onChangeText={(v) => set(f.key, v)}
                  placeholder={f.placeholder}
                  placeholderTextColor={Colors.text.muted}
                  keyboardType={f.keyboard ?? 'default'}
                />
              </View>
            ))}
          </GlassCardSimple>

          {/* Tápértékek */}
          <GlassCardSimple>
            <Text style={styles.sectionLabel}>{t('food.nutritionPer100g')}</Text>
            <View style={styles.nutriGrid}>
              {NUTRI_FIELDS.map((f) => (
                <View key={f.key} style={styles.nutriFieldWrap}>
                  <Text style={styles.fieldLabel}>{f.emoji} {t(f.labelKey)}{f.required ? ' *' : ''}</Text>
                  <TextInput
                    style={styles.input}
                    value={values[f.key] ?? ''}
                    onChangeText={(v) => set(f.key, v)}
                    placeholder={f.placeholder}
                    placeholderTextColor={Colors.text.muted}
                    keyboardType={f.keyboard ?? 'default'}
                  />
                </View>
              ))}
            </View>
          </GlassCardSimple>

          {/* Info */}
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              💡 {t('food.infoPer100g')}
            </Text>
          </View>

          <PrimaryButton label={`💾  ${t('food.submit')}`} onPress={handleSave} loading={saving} size="lg" />
          <GhostButton label={t('common.cancel')} onPress={onClose} />
          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: { padding: Spacing['2xl'], backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  title: { ...Typography.title, color: Colors.text.primary, marginBottom: Spacing.xs },
  subtitle: { ...Typography.body, color: Colors.text.secondary, lineHeight: 21 },
  body: { padding: Spacing.xl, gap: Spacing.md },
  sectionLabel: { ...Typography.label, color: Colors.text.secondary, marginBottom: Spacing.sm },
  fieldWrap: { gap: 5, marginBottom: Spacing.sm },
  fieldLabel: { ...Typography.caption, color: Colors.text.secondary, fontWeight: '600' },
  input: {
    backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: Radius.md,
    padding: Spacing.md, fontSize: 15, color: Colors.text.primary,
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.08)',
  },
  nutriGrid: { gap: Spacing.sm },
  nutriFieldWrap: { gap: 5 },
  infoBox: {
    backgroundColor: 'rgba(74,144,217,0.08)',
    borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: 'rgba(74,144,217,0.2)',
  },
  infoText: { ...Typography.caption, color: '#2B6CB0', lineHeight: 18 },
});
