import * as Haptics from 'expo-haptics';

/** Toques táteis curtos; falhas (ex.: aparelho sem motor) são ignoradas. */
export const haptic = {
  light: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined),
  medium: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined),
  warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined),
  select: () => void Haptics.selectionAsync().catch(() => undefined),
};
