import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, hairline, space } from '../theme';
import { IconButton } from './Button';
import { Txt } from './Txt';

/* ───────────── cabeçalho ───────────── */

interface HeaderProps {
  title: ReactNode;
  /** Linha técnica em mono sob o título (id do canal, estado, etc.). */
  subtitle?: ReactNode;
  back?: boolean;
  onBack?: () => void;
  left?: ReactNode;
  right?: ReactNode;
}

/** Cabeçalho compacto próprio (o header nativo fica desligado em todo o app). */
export function Header({ title, subtitle, back, onBack, left, right }: HeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: colors.nav,
        borderBottomWidth: hairline,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: back ? space[1] : space[4], gap: space[2] }}>
        {back ? (
          <IconButton
            icon="back"
            label="Voltar"
            onPress={() => (onBack ? onBack() : router.canGoBack() ? router.back() : router.replace('/conversas'))}
          />
        ) : null}
        {left}
        <View style={{ flex: 1, minWidth: 0 }}>
          {typeof title === 'string' ? (
            <Txt variant="title" numberOfLines={1}>
              {title}
            </Txt>
          ) : (
            title
          )}
          {subtitle ? (
            typeof subtitle === 'string' ? (
              <Txt variant="micro" numberOfLines={1}>
                {subtitle}
              </Txt>
            ) : (
              subtitle
            )
          ) : null}
        </View>
        {right ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1], paddingRight: space[1] }}>{right}</View> : null}
      </View>
    </View>
  );
}

/* ───────────── rótulo de seção ───────────── */

export function SectionLabel({ children, right, style }: { children: ReactNode; right?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], paddingTop: space[5], paddingBottom: space[2], gap: space[2] },
        style,
      ]}
    >
      <Txt variant="label" style={{ flex: 1 }} numberOfLines={1}>
        {children}
      </Txt>
      {right}
    </View>
  );
}

/* ───────────── controle segmentado ───────────── */

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (v: T) => void;
}

/** Abas internas em mono com sublinhado verde no item ativo. */
export function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <View style={{ flexDirection: 'row', borderBottomWidth: hairline, borderBottomColor: colors.border, paddingHorizontal: space[2] }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{ paddingHorizontal: space[3], paddingVertical: space[3], flexDirection: 'row', gap: space[1] + 2, alignItems: 'center' }}
          >
            <Txt variant="label" color={active ? colors.text : colors.textFaint}>
              {o.label}
            </Txt>
            {o.count ? (
              <View style={{ minWidth: 16, paddingHorizontal: 4, backgroundColor: colors.accent, alignItems: 'center' }}>
                <Txt variant="micro" color={colors.onAccent}>
                  {o.count > 99 ? '99+' : o.count}
                </Txt>
              </View>
            ) : null}
            {active ? <View style={{ position: 'absolute', left: space[3], right: space[3], bottom: -hairline, height: 2, backgroundColor: colors.accent }} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/* ───────────── painel inferior ───────────── */

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Envolve o conteúdo em ScrollView (formulários). */
  scroll?: boolean;
}

/** Painel inferior modal (menus de contexto e formulários curtos). */
export function Sheet({ visible, onClose, title, children, scroll }: SheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
        <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} accessibilityLabel="Fechar" />
        <View
          style={{
            backgroundColor: colors.nav,
            borderTopWidth: hairline,
            borderTopColor: colors.borderStrong,
            paddingBottom: insets.bottom + space[3],
            maxHeight: '85%',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: space[4], paddingRight: space[1], paddingTop: space[1] }}>
            <View style={{ flex: 1 }}>{title ? <Txt variant="label">{title}</Txt> : null}</View>
            <IconButton icon="close" label="Fechar" onPress={onClose} size={18} color={colors.textMuted} />
          </View>
          {scroll ? (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: space[2], gap: space[4] }}>
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Item de menu de um Sheet. */
export function SheetItem({
  label,
  icon,
  onPress,
  danger,
}: {
  label: string;
  icon?: ReactNode;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingHorizontal: space[4],
        height: 50,
        backgroundColor: pressed ? colors.elevated : 'transparent',
      })}
    >
      {icon}
      <Txt variant="body" color={danger ? colors.danger : colors.text}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** Divisória fina. */
export const Divider = ({ inset = 0 }: { inset?: number }) => (
  <View style={{ height: hairline, backgroundColor: colors.border, marginLeft: inset }} />
);
