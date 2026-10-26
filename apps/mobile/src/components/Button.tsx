import { memo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fonts, fontSize, hairline, space } from '../theme';
import { Chamfer } from './Chamfer';
import { Icon, type IconName } from './Icon';
import { Txt } from './Txt';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  right?: ReactNode;
}

const FG: Record<ButtonVariant, string> = {
  primary: colors.onAccent,
  secondary: colors.text,
  ghost: colors.textMuted,
  danger: colors.danger,
};

/** Botão do NOX. Apenas o primário usa o verde e o chanfro de marca. */
export const Button = memo(function Button({
  label,
  onPress,
  variant = 'secondary',
  icon,
  disabled,
  loading,
  compact,
  style,
  accessibilityHint,
  right,
}: Props) {
  const inactive = Boolean(disabled || loading);
  const height = compact ? 36 : 48;
  const fg = FG[variant];

  const content = (
    <View
      style={{
        height,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[2],
        paddingHorizontal: compact ? space[3] : space[5],
      }}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={compact ? 16 : 18} color={fg} /> : null}
      <Txt
        style={{
          fontFamily: variant === 'primary' ? fonts.sansSemi : fonts.sansMedium,
          fontSize: compact ? fontSize.body : fontSize.bodyLg,
          color: fg,
        }}
        numberOfLines={1}
      >
        {label}
      </Txt>
      {right}
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: Boolean(loading) }}
      style={({ pressed }) => [{ opacity: inactive ? 0.45 : pressed ? 0.8 : 1 }, style]}
    >
      {variant === 'primary' ? (
        <Chamfer fill={colors.accent} cut={compact ? 6 : 9}>
          {content}
        </Chamfer>
      ) : (
        <View
          style={{
            borderWidth: variant === 'ghost' ? 0 : hairline,
            borderColor: variant === 'danger' ? colors.danger : colors.border,
            backgroundColor: variant === 'secondary' ? colors.surface : variant === 'danger' ? colors.dangerTint : 'transparent',
          }}
        >
          {content}
        </View>
      )}
    </Pressable>
  );
});

interface IconButtonProps {
  icon: IconName;
  onPress?: () => void;
  onLongPress?: () => void;
  label: string;
  color?: string;
  size?: number;
  disabled?: boolean;
  active?: boolean;
  bordered?: boolean;
  danger?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Botão só de ícone com área de toque mínima de 40dp. */
export const IconButton = memo(function IconButton({
  icon,
  onPress,
  onLongPress,
  label,
  color,
  size = 20,
  disabled,
  active,
  bordered,
  danger,
  style,
}: IconButtonProps) {
  const border = danger ? colors.danger : active ? colors.accent : colors.border;
  const bg = danger ? colors.dangerTint : active ? colors.accentTint : 'transparent';
  const fg = color ?? (danger ? colors.danger : active ? colors.accent : colors.text);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(active) }}
      hitSlop={6}
      style={({ pressed }) => [
        {
          width: 40,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
          borderWidth: bordered || danger ? hairline : 0,
          borderColor: border,
          backgroundColor: bg,
        },
        style,
      ]}
    >
      <Icon name={icon} size={size} color={fg} />
    </Pressable>
  );
});
