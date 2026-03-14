import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Modal,
  ScrollView, Animated, useRef,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Colors, Gradients, Radius, Spacing, Typography } from '../../design/tokens';
import { GlassCardSimple } from '../ui/GlassCard';
import { PrimaryButton, GhostButton } from '../ui/Button';

// ─── Feature konfiguráció ────────────────────────────────────────────────────

export type PremiumFeature =
  | 'unlimited_logs'
  | 'unlimited_scans'
  | 'full_history'
  | 'export'
  | 'premium_foods'
  | 'customization'
  | 'monthly_stats';

const FEATURE_META: Record<PremiumFeature, { icon: string; title: string; desc: string }> = {
  unlimited_logs:  { icon: '📝', title: 'Korlátlan naplózás',      desc: 'Naponta több mint 10 bejegyzéshez Premium szükséges.' },
  unlimited_scans: { icon: '📷', title: 'Korlátlan szkennelés',    desc: 'Naponta több mint 5 szkenneléshez Premium szükséges.' },
  full_history:    { icon: '📊', title: 'Teljes statisztika',       desc: 'A korábbi hetek adataihoz Premium szükséges.' },
  export:          { icon: '📤', title: 'Excel export',            desc: 'Az adatok XLSX-be exportálásához Premium szükséges.' },
  premium_foods:   { icon: '⭐', title: 'Prémium étel-adatbázis', desc: 'A prémium étel-katalógushoz Premium szükséges.' },
  customization:   { icon: '🎨', title: 'Profil testreszabás',     desc: 'Egyedi avatár és téma csak Premiumban.' },
  monthly_stats:   { icon: '📅', title: 'Havi statisztika',        desc: 'Havi lebontáshoz Premium szükséges.' },
};

const ALL_PREMIUM_FEATURES = [
  { icon: '📝', title: 'Korlátlan naplózás',       desc: 'Annyi bejegyzés, amennyit csak akarsz' },
  { icon: '📷', title: 'Korlátlan szkennelés',     desc: 'Vonalkód limit nélkül' },
  { icon: '📊', title: 'Teljes statisztika',        desc: 'Heti, havi, éves trendek' },
  { icon: '📤', title: 'Excel export',             desc: 'XLSX letöltés, teljes napló' },
  { icon: '⭐', title: 'Prémium étel-adatbázis',  desc: 'Extra prémium ételek' },
  { icon: '🚫', title: 'Reklámok nélkül',          desc: 'Teljesen tiszta élmény' },
];

// ─── PremiumUpsellModal ──────────────────────────────────────────────────────

interface UpsellModalProps {
  visible: boolean;
  feature?: PremiumFeature;
  onClose: () => void;
  onUpgrade?: () => void;
}

export function PremiumUpsellModal({ visible, feature, onClose, onUpgrade }: UpsellModalProps) {
  const [plan, setPlan] = useState<'monthly' | 'yearly'>('yearly');
  const meta = feature ? FEATURE_META[feature] : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={upsellStyles.container} showsVerticalScrollIndicator={false}>
        {/* Gradiens fejléc */}
        <LinearGradient
          colors={['#1A1A2E', '#2D2D4E', '#4A3F6B']}
          style={upsellStyles.header}
        >
          <Pressable style={upsellStyles.closeBtn} onPress={onClose} hitSlop={12}>
            <Text style={upsellStyles.closeIcon}>✕</Text>
          </Pressable>

          <View style={upsellStyles.crownBox}>
            <Text style={upsellStyles.crownEmoji}>⭐</Text>
          </View>
          <Text style={upsellStyles.headerTitle}>VitaScan Premium</Text>
          <Text style={upsellStyles.headerSub}>Korlátlan hozzáférés az összes funkcióhoz</Text>

          {/* Specifikus feature kiemelése */}
          {meta && (
            <View style={upsellStyles.featureHighlight}>
              <Text style={upsellStyles.featureHighlightIcon}>{meta.icon}</Text>
              <Text style={upsellStyles.featureHighlightText}>{meta.desc}</Text>
            </View>
          )}
        </LinearGradient>

        <View style={upsellStyles.body}>
          {/* Feature lista */}
          <Text style={upsellStyles.sectionLabel}>Mit kapsz Premiumban?</Text>
          <GlassCardSimple backgroundColor="rgba(74,63,107,0.06)" borderColor="rgba(74,63,107,0.15)">
            {ALL_PREMIUM_FEATURES.map((f, i) => (
              <View key={f.title} style={[upsellStyles.featureRow, i < ALL_PREMIUM_FEATURES.length - 1 && upsellStyles.featureDivider]}>
                <View style={upsellStyles.featureIconBox}>
                  <Text style={{ fontSize: 18 }}>{f.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={upsellStyles.featureTitle}>{f.title}</Text>
                  <Text style={upsellStyles.featureDesc}>{f.desc}</Text>
                </View>
                <Text style={upsellStyles.checkMark}>✓</Text>
              </View>
            ))}
          </GlassCardSimple>

          {/* Árak */}
          <Text style={upsellStyles.sectionLabel}>Válassz csomagot</Text>
          <View style={upsellStyles.planRow}>
            {/* Havi */}
            <Pressable
              style={[upsellStyles.planCard, plan === 'monthly' && upsellStyles.planCardActive]}
              onPress={() => setPlan('monthly')}
            >
              <Text style={upsellStyles.planPeriod}>Havi</Text>
              <Text style={upsellStyles.planPrice}>1 990 Ft</Text>
              <Text style={upsellStyles.planUnit}>/hó</Text>
            </Pressable>

            {/* Éves – ajánlott */}
            <Pressable
              style={[upsellStyles.planCard, upsellStyles.planCardYearly, plan === 'yearly' && upsellStyles.planCardActive]}
              onPress={() => setPlan('yearly')}
            >
              <View style={upsellStyles.savingBadge}>
                <Text style={upsellStyles.savingText}>-37%</Text>
              </View>
              <Text style={upsellStyles.planPeriod}>Éves</Text>
              <Text style={upsellStyles.planPrice}>14 990 Ft</Text>
              <Text style={upsellStyles.planUnit}>/év · 1 249 Ft/hó</Text>
            </Pressable>
          </View>

          {/* CTA */}
          <PrimaryButton
            label={`⭐  Premium – ${plan === 'yearly' ? '14 990 Ft/év' : '1 990 Ft/hó'}`}
            onPress={onUpgrade ?? onClose}
            size="lg"
          />

          <Text style={upsellStyles.disclaimer}>
            Az előfizetés az App Store / Google Play fiókodon keresztül kezelődik.
            Bármikor lemondható.
          </Text>

          <GhostButton label="Maradok az ingyenes verzióban" onPress={onClose} />
          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </Modal>
  );
}

const upsellStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: { padding: Spacing['2xl'], paddingTop: 48, alignItems: 'center', gap: Spacing.sm },
  closeBtn: {
    position: 'absolute', top: 16, right: 16,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  closeIcon: { color: '#fff', fontSize: 14, fontWeight: '700' },
  crownBox: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,215,0,0.2)',
    borderWidth: 2, borderColor: 'rgba(255,215,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  crownEmoji: { fontSize: 40 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  headerSub: { ...Typography.body, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  featureHighlight: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(255,107,53,0.25)', borderRadius: Radius.lg,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm, borderWidth: 1, borderColor: 'rgba(255,107,53,0.4)',
  },
  featureHighlightIcon: { fontSize: 22 },
  featureHighlightText: { ...Typography.body, color: '#FFD4B8', flex: 1, lineHeight: 20 },
  body: { padding: Spacing.xl, gap: Spacing.md },
  sectionLabel: { ...Typography.label, color: Colors.text.secondary },
  featureRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, gap: Spacing.md },
  featureDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  featureIconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(74,63,107,0.1)', alignItems: 'center', justifyContent: 'center',
  },
  featureTitle: { ...Typography.bodyMedium, color: Colors.text.primary },
  featureDesc: { ...Typography.caption, color: Colors.text.muted, marginTop: 1 },
  checkMark: { color: '#2ECC71', fontSize: 16, fontWeight: '900' },
  planRow: { flexDirection: 'row', gap: Spacing.sm },
  planCard: {
    flex: 1, alignItems: 'center', padding: Spacing.md,
    backgroundColor: '#fff', borderRadius: Radius.xl,
    borderWidth: 2, borderColor: '#E8E8E8', gap: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  planCardYearly: { position: 'relative' },
  planCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  savingBadge: {
    position: 'absolute', top: -10, right: -6,
    backgroundColor: '#2ECC71', borderRadius: Radius.full,
    paddingVertical: 2, paddingHorizontal: 8,
  },
  savingText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  planPeriod: { ...Typography.caption, color: Colors.text.muted, fontWeight: '700' },
  planPrice: { fontSize: 22, fontWeight: '900', color: Colors.text.primary },
  planUnit: { ...Typography.caption, color: Colors.text.muted },
  disclaimer: { ...Typography.caption, color: Colors.text.muted, textAlign: 'center', lineHeight: 18 },
});

// ─── PremiumLockOverlay ───────────────────────────────────────────────────────
// Ráhúzható egy meglévő komponensre, elmosódó blur + lakat ikon

interface LockOverlayProps {
  feature: PremiumFeature;
  children: React.ReactNode;
  locked?: boolean;           // false esetén simán rendereli
  compact?: boolean;
}

export function PremiumLockOverlay({ feature, children, locked = true, compact = false }: LockOverlayProps) {
  const [upsellVisible, setUpsellVisible] = useState(false);
  const meta = FEATURE_META[feature];

  if (!locked) return <>{children}</>;

  return (
    <View style={lockStyles.wrapper}>
      {/* Elmosódott tartalom */}
      <View style={lockStyles.blurred} pointerEvents="none">
        {children}
      </View>

      {/* Lock overlay */}
      <Pressable style={lockStyles.overlay} onPress={() => setUpsellVisible(true)}>
        <BlurView intensity={18} tint="light" style={StyleSheet.absoluteFillObject} />
        <LinearGradient
          colors={['rgba(26,26,46,0.55)', 'rgba(74,63,107,0.65)']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[lockStyles.lockBox, compact && lockStyles.lockBoxCompact]}>
          <Text style={lockStyles.lockIcon}>🔒</Text>
          {!compact && (
            <>
              <Text style={lockStyles.lockTitle}>{meta.title}</Text>
              <Text style={lockStyles.lockDesc}>{meta.desc}</Text>
            </>
          )}
          <View style={lockStyles.unlockBtn}>
            <Text style={lockStyles.unlockText}>⭐ Premium-ra váltás</Text>
          </View>
        </View>
      </Pressable>

      <PremiumUpsellModal
        visible={upsellVisible}
        feature={feature}
        onClose={() => setUpsellVisible(false)}
      />
    </View>
  );
}

const lockStyles = StyleSheet.create({
  wrapper: { position: 'relative', overflow: 'hidden', borderRadius: Radius.xl },
  blurred: { opacity: 0.35 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  lockBox: { alignItems: 'center', gap: Spacing.sm, padding: Spacing.xl },
  lockBoxCompact: { gap: Spacing.xs, padding: Spacing.md },
  lockIcon: { fontSize: 36 },
  lockTitle: { fontSize: 16, fontWeight: '800', color: '#fff', textAlign: 'center' },
  lockDesc: { ...Typography.body, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 20 },
  unlockBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingVertical: 8, paddingHorizontal: 20,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10,
  },
  unlockText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});

// ─── PremiumBadge — kis jelvény Premium funkciók jelöléséhez ─────────────────

export function PremiumBadge({ style }: { style?: any }) {
  return (
    <View style={[badgeStyles.badge, style]}>
      <Text style={badgeStyles.text}>⭐ PRO</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    backgroundColor: '#FFD700',
    borderRadius: Radius.full,
    paddingVertical: 2, paddingHorizontal: 8,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 10, fontWeight: '900', color: '#7A5C00' },
});

// ─── DailyLimitBar — FREE felhasználóknak mutatja a maradék limiteket ─────────

interface DailyLimitBarProps {
  type: 'logs' | 'scans';
  used: number;
  limit: number;
  onUpgrade: () => void;
}

export function DailyLimitBar({ type, used, limit, onUpgrade }: DailyLimitBarProps) {
  const pct = Math.min(used / limit, 1);
  const remaining = Math.max(limit - used, 0);
  const isAlmostFull = pct >= 0.8;
  const isFull = pct >= 1;

  const label = type === 'logs'
    ? `📝 Napi naplók: ${remaining} maradt`
    : `📷 Napi szkennelések: ${remaining} maradt`;

  return (
    <View style={limitStyles.container}>
      <View style={limitStyles.header}>
        <Text style={[limitStyles.label, isFull && limitStyles.labelFull]}>{label}</Text>
        {isAlmostFull && (
          <Pressable onPress={onUpgrade}>
            <Text style={limitStyles.upgradeLink}>⭐ Bővítés</Text>
          </Pressable>
        )}
      </View>
      <View style={limitStyles.track}>
        <View style={[
          limitStyles.fill,
          { width: `${pct * 100}%` },
          isAlmostFull && limitStyles.fillWarn,
          isFull && limitStyles.fillFull,
        ]} />
      </View>
      {isFull && (
        <Text style={limitStyles.fullText}>
          Elérted a napi limitet. Válts Premiumra a korlátlan hozzáférésért!
        </Text>
      )}
    </View>
  );
}

const limitStyles = StyleSheet.create({
  container: { gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...Typography.caption, color: Colors.text.secondary, fontWeight: '600' },
  labelFull: { color: '#E74C3C', fontWeight: '800' },
  upgradeLink: { ...Typography.caption, color: Colors.primary, fontWeight: '800' },
  track: {
    height: 6, backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: Radius.full, overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: '#2ECC71', borderRadius: Radius.full },
  fillWarn: { backgroundColor: '#F5A623' },
  fillFull: { backgroundColor: '#E74C3C' },
  fullText: { ...Typography.caption, color: '#E74C3C', lineHeight: 18 },
});
