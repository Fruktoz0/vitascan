import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../../design/tokens';
import { webPointer } from '../layout/ResponsiveLayout';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onClose: () => void;
  destructive?: boolean;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Mégse',
  onConfirm,
  onClose,
  destructive = false,
}: Props) {
  const dual = typeof onConfirm === 'function';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            {dual ? (
              <>
                <Pressable style={[styles.btn, webPointer]} onPress={onClose}>
                  <View style={styles.btnShadow} />
                  <View style={[styles.btnFace, styles.secondaryFace]}>
                    <Text style={styles.btnLabel}>{cancelLabel}</Text>
                  </View>
                </Pressable>
                <Pressable
                  style={[styles.btn, webPointer]}
                  onPress={() => {
                    onConfirm?.();
                    onClose();
                  }}
                >
                  <View style={styles.btnShadow} />
                  <View style={[styles.btnFace, destructive ? styles.dangerFace : styles.primaryFace]}>
                    <Text style={styles.btnLabel}>{confirmLabel}</Text>
                  </View>
                </Pressable>
              </>
            ) : (
              <Pressable style={[styles.btn, webPointer]} onPress={onClose}>
                <View style={styles.btnShadow} />
                <View style={[styles.btnFace, styles.primaryFace]}>
                  <Text style={styles.btnLabel}>{confirmLabel}</Text>
                </View>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(28, 27, 27, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.dashboard.page,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 24,
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 18,
    shadowColor: Colors.dashboard.shadowHard,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 0,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.dashboard.stroke,
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    color: Colors.dashboard.tabInactive,
    textAlign: 'center',
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    height: 48,
  },
  btnShadow: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: -2,
    bottom: -2,
    backgroundColor: Colors.dashboard.shadowHard,
    borderRadius: 999,
  },
  btnFace: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderColor: Colors.dashboard.stroke,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryFace: {
    backgroundColor: Colors.dashboard.softGreen,
  },
  secondaryFace: {
    backgroundColor: '#fff',
  },
  dangerFace: {
    backgroundColor: Colors.dashboard.errorContainer,
  },
  btnLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.dashboard.stroke,
  },
});
