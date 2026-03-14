import React from 'react';
import {
  Pressable, Text, StyleSheet, ActivityIndicator,
  ViewStyle, StyleProp, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Radius, Shadows, Typography } from '../../design/tokens';

interface ButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function PrimaryButton({
  label, onPress, loading, disabled, style, icon, size = 'md',
}: ButtonProps) {
  const pad = size === 'sm' ? 10 : size === 'lg' ? 18 : 14;
  const fontSize = size === 'sm' ? 13 : size === 'lg' ? 17 : 15;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.pressable,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      <LinearGradient
        colors={['#FF6B35', '#FF9A6C']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.gradient, { paddingVertical: pad, borderRadius: Radius.full }]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <View style={styles.content}>
            {icon && <Text style={styles.icon}>{icon}</Text>}
            <Text style={[styles.label, { fontSize }]}>{label}</Text>
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function GhostButton({
  label, onPress, disabled, style, icon, size = 'md',
}: ButtonProps) {
  const pad = size === 'sm' ? 10 : size === 'lg' ? 18 : 14;
  const fontSize = size === 'sm' ? 13 : size === 'lg' ? 17 : 15;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        ghostStyles.btn,
        { paddingVertical: pad, borderRadius: Radius.full },
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={styles.content}>
        {icon && <Text style={styles.icon}>{icon}</Text>}
        <Text style={[ghostStyles.label, { fontSize }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function GlassButton({
  label, onPress, disabled, loading, style, icon, size = 'md',
}: ButtonProps) {
  const pad = size === 'sm' ? 10 : size === 'lg' ? 18 : 14;
  const fontSize = size === 'sm' ? 13 : size === 'lg' ? 17 : 15;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        glassBtn.btn,
        { paddingVertical: pad, borderRadius: Radius.full },
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={Colors.primary} size="small" />
      ) : (
        <View style={styles.content}>
          {icon && <Text style={styles.icon}>{icon}</Text>}
          <Text style={[glassBtn.label, { fontSize }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { ...Shadows.primary },
  disabled: { opacity: 0.5 },
  pressed: { transform: [{ scale: 0.97 }] },
  gradient: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { fontSize: 18 },
  label: { color: '#fff', fontWeight: '700', letterSpacing: 0.2 },
});

const ghostStyles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  label: { color: Colors.text.secondary, fontWeight: '600' },
});

const glassBtn = StyleSheet.create({
  btn: {
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: Colors.glass.white,
    borderWidth: 1.5,
    borderColor: Colors.glass.border,
    ...Shadows.glassSoft,
  },
  label: { color: Colors.primary, fontWeight: '700' },
});
