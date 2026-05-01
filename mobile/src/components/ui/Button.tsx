import React from 'react';
import {
  Pressable, Text, StyleSheet, ActivityIndicator,
  ViewStyle, StyleProp, View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../../design/tokens';

interface ButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: string;
  size?: 'sm' | 'md' | 'lg';
}

// HTML: bg-primary-container border-[0.8px] border-on-background
//       rounded-[2rem_1rem_2rem_1rem] py-4 px-6
//       shadow-[4px_4px_0px_0px_rgba(28,27,27,1)]
export function PrimaryButton({
  label, onPress, loading, disabled, style, icon, size = 'md',
}: ButtonProps) {
  const paddingVertical = size === 'sm' ? 12 : size === 'lg' ? 16 : 14;
  const fontSize = size === 'sm' ? 16 : size === 'lg' ? 20 : 18;

  // HTML-beli aszimmetrikus lekerekítés: rounded-[2rem_1rem_2rem_1rem]
  const radii = {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 32,
    borderBottomLeftRadius: 16,
  };

  return (
    // A külső nézet 4px extra teret biztosít az offset árnyéknak
    <View style={[styles.wrapper, style, { opacity: disabled ? 0.6 : 1 }]}>
      {/* Szilárd fekete hard shadow: 4px jobbra-le, nincs blur */}
      <View style={[styles.hardShadow, radii]} />

      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        style={({ pressed }) => [
          styles.btn,
          radii,
          { paddingVertical },
          pressed && styles.pressed,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={Colors.dashboard.stroke} size="small" />
        ) : (
          <View style={styles.content}>
            {/* HTML-ben: add_circle ikon */}
            <MaterialIcons name="add-circle" size={24} color={Colors.dashboard.stroke} />
            <Text style={[styles.label, { fontSize }]}>{label}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

export function GhostButton({
  label, onPress, disabled, style, icon, size = 'md',
}: ButtonProps) {
  const paddingVertical = size === 'sm' ? 12 : size === 'lg' ? 20 : 16;
  const fontSize = size === 'sm' ? 16 : size === 'lg' ? 20 : 18;

  return (
    <View style={[styles.wrapper, style, { opacity: disabled ? 0.6 : 1 }]}>
      <View style={[styles.hardShadow, { borderRadius: 32 }]} />
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.ghostBtn,
          { paddingVertical, borderRadius: 32 },
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.content}>
          {icon && <Text style={{ fontSize: 20 }}>{icon}</Text>}
          <Text style={[styles.ghostLabel, { fontSize }]}>{label}</Text>
        </View>
      </Pressable>
    </View>
  );
}

export function GlassButton({
  label, onPress, disabled, loading, style, icon, size = 'md',
}: ButtonProps) {
  const paddingVertical = size === 'sm' ? 12 : size === 'lg' ? 20 : 16;
  const fontSize = size === 'sm' ? 16 : size === 'lg' ? 20 : 18;

  return (
    <View style={[styles.wrapper, style, { opacity: disabled ? 0.6 : 1 }]}>
      <View style={[styles.hardShadow, { borderRadius: 32 }]} />
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        style={({ pressed }) => [
          styles.glassBtn,
          { paddingVertical, borderRadius: 32 },
          pressed && styles.pressed,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={Colors.dashboard.stroke} size="small" />
        ) : (
          <View style={styles.content}>
            {icon && <Text style={{ fontSize: 20 }}>{icon}</Text>}
            <Text style={[styles.label, { fontSize }]}>{label}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    // paddingBottom + paddingRight = helyet hagy az eltolt fekete árnyéknak
    paddingBottom: 4,
    paddingRight: 4,
  },
  hardShadow: {
    // Absolute, eltolva 4px jobbra+le → HTML: shadow-[4px_4px_0px_0px_rgba(28,27,27,1)]
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dashboard.shadowHard,
    top: 4,
    left: 4,
    bottom: 0,
    right: 0,
  },
  btn: {
    // HTML: bg-primary-container border-[0.8px] border-on-background
    backgroundColor: Colors.dashboard.blobMint, // #e8f5e9 = primary-container
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    // Lenyomáskor a gomb "bemozdul" → a shadow eltűnik, és a gomb lecsúszik
    transform: [{ translateX: 4 }, { translateY: 4 }],
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: {
    color: Colors.dashboard.stroke,
    fontWeight: '700',
  },
  ghostBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostLabel: {
    color: Colors.dashboard.stroke,
    fontWeight: '700',
  },
  glassBtn: {
    backgroundColor: Colors.dashboard.card,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
