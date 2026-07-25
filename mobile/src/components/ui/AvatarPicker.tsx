import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, Image, ScrollView, ActivityIndicator,
} from 'react-native';
import { AVATAR_OPTIONS, avatarUrl } from '../../design/avatars';
import { Colors } from '../../design/tokens';

export function UserAvatar({
  avatarKey,
  size = 40,
  style,
}: {
  avatarKey?: string | null;
  size?: number;
  style?: any;
}) {
  return (
    <Image
      source={{ uri: avatarUrl(avatarKey) }}
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: Colors.dashboard.softBlue }, style]}
    />
  );
}

export default function AvatarPicker({
  visible,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value?: string | null;
  onSelect: (key: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const selected = value?.trim() || 'Felix';
  const [saving, setSaving] = useState(false);

  const pick = async (key: string) => {
    setSaving(true);
    try {
      await onSelect(key);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Válassz avatárt</Text>
          <Text style={styles.sub}>Ingyenes illusztrációk — bármikor cserélheted.</Text>
          {saving ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color={Colors.dashboard.stroke} />
          ) : (
            <ScrollView contentContainerStyle={styles.grid}>
              {AVATAR_OPTIONS.map((key) => {
                const active = selected === key;
                return (
                  <Pressable
                    key={key}
                    style={[styles.option, active && styles.optionActive]}
                    onPress={() => pick(key)}
                  >
                    <Image source={{ uri: avatarUrl(key) }} style={styles.optionImg} />
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Kész</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(28,27,27,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.dashboard.page,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    paddingHorizontal: 20,
    paddingBottom: 28,
    maxHeight: '78%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(28,27,27,0.2)',
    marginTop: 12,
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center', color: Colors.dashboard.stroke },
  sub: { fontSize: 13, textAlign: 'center', color: Colors.dashboard.tabInactive, marginTop: 6, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', paddingBottom: 12 },
  option: {
    width: '22%',
    aspectRatio: 1,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    backgroundColor: '#fff',
    padding: 4,
    overflow: 'hidden',
  },
  optionActive: { backgroundColor: Colors.dashboard.softGreen },
  optionImg: { width: '100%', height: '100%', borderRadius: 16 },
  closeBtn: {
    marginTop: 12,
    height: 48,
    borderRadius: 999,
    backgroundColor: Colors.dashboard.nutritionIcon,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
