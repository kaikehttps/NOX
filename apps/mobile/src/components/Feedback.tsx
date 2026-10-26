import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, hairline, motion, space } from '../theme';
import { Button } from './Button';
import { Icon } from './Icon';
import { Txt } from './Txt';

/* ───────────── estado vazio ───────────── */

interface EmptyProps {
  /** Rótulo técnico curto (ex.: "// sem conversas"). */
  code?: string;
  text: string;
  action?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ code, text, action, style }: EmptyProps) {
  return (
    <View style={[{ paddingVertical: space[10], paddingHorizontal: space[6], alignItems: 'flex-start', gap: space[3] }, style]}>
      {code ? <Txt variant="label" color={colors.textFaint}>{code}</Txt> : null}
      <Txt variant="body" color={colors.textMuted}>
        {text}
      </Txt>
      {action ? <Button label={action.label} onPress={action.onPress} compact /> : null}
    </View>
  );
}

/* ───────────── erro em linha ───────────── */

export function InlineError({ message, style }: { message: string | null | undefined; style?: StyleProp<ViewStyle> }) {
  if (!message) return null;
  return (
    <View
      accessibilityRole="alert"
      style={[
        {
          flexDirection: 'row',
          gap: space[2],
          alignItems: 'flex-start',
          padding: space[3],
          backgroundColor: colors.dangerTint,
          borderLeftWidth: 2,
          borderLeftColor: colors.danger,
        },
        style,
      ]}
    >
      <Icon name="alert" size={16} color={colors.danger} />
      <Txt variant="small" color={colors.text} style={{ flex: 1 }}>
        {message}
      </Txt>
    </View>
  );
}

/* ───────────── carregando ───────────── */

export function Loading({ label, style }: { label?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ padding: space[8], alignItems: 'center', gap: space[3] }, style]}>
      <ActivityIndicator color={colors.textMuted} />
      {label ? <Txt variant="label">{label}</Txt> : null}
    </View>
  );
}

/* ───────────── toast ───────────── */

type ToastTone = 'default' | 'error' | 'success';
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => undefined);

export const useToast = () => useContext(ToastContext);

/** Avisos curtos e não bloqueantes no topo da tela. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const seq = useRef(0);
  const show = useCallback((message: string, tone: ToastTone = 'default') => {
    seq.current += 1;
    setToast({ id: seq.current, message, tone });
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? <ToastView key={toast.id} item={toast} onDone={() => setToast((t) => (t?.id === toast.id ? null : t))} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const opacity = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: motion.base, useNativeDriver: true }),
      Animated.delay(item.tone === 'error' ? 3600 : 2400),
      Animated.timing(opacity, { toValue: 0, duration: motion.slow, useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => finished && onDone());
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const accent = item.tone === 'error' ? colors.danger : item.tone === 'success' ? colors.accent : colors.borderStrong;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        top: insets.top + space[2],
        left: space[4],
        right: space[4],
        opacity,
        backgroundColor: colors.elevated,
        borderWidth: hairline,
        borderColor: colors.border,
        borderLeftWidth: 2,
        borderLeftColor: accent,
        paddingVertical: space[3],
        paddingHorizontal: space[4],
      }}
    >
      <Txt variant="small" color={colors.text}>
        {item.message}
      </Txt>
    </Animated.View>
  );
}
