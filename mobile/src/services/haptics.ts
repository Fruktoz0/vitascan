import { Platform } from 'react-native';
import * as ExpoHaptics from 'expo-haptics';

/** Web-safe haptics — no-op on web, native expo-haptics elsewhere. */
export const ImpactFeedbackStyle = ExpoHaptics.ImpactFeedbackStyle;
export const NotificationFeedbackType = ExpoHaptics.NotificationFeedbackType;

export async function impactAsync(style: ExpoHaptics.ImpactFeedbackStyle = ExpoHaptics.ImpactFeedbackStyle.Medium) {
  if (Platform.OS === 'web') return;
  try {
    await ExpoHaptics.impactAsync(style);
  } catch {}
}

export async function notificationAsync(type: ExpoHaptics.NotificationFeedbackType) {
  if (Platform.OS === 'web') return;
  try {
    await ExpoHaptics.notificationAsync(type);
  } catch {}
}

export async function selectionAsync() {
  if (Platform.OS === 'web') return;
  try {
    await ExpoHaptics.selectionAsync();
  } catch {}
}
