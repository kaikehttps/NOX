import { View, type ViewStyle } from 'react-native';
import { colors, hairline, space } from '../theme';
import { Txt } from './Txt';

type Tone = 'default' | 'accent' | 'danger';

interface Props {
  label: string;
  tone?: Tone;
  style?: ViewStyle;
}

const TONES: Record<Tone, { fg: string; bg: string; border: string }> = {
  default: { fg: colors.textMuted, bg: 'transparent', border: colors.border },
  accent: { fg: colors.accent, bg: colors.accentTint, border: colors.accentTint },
  danger: { fg: colors.danger, bg: colors.dangerTint, border: colors.dangerTint },
};

/** Etiqueta técnica em mono (papéis, contagens, estados). */
export function Badge({ label, tone = 'default', style }: Props) {
  const t = TONES[tone];
  return (
    <View
      style={[
        { paddingHorizontal: space[1] + 2, paddingVertical: 1, borderWidth: hairline, borderColor: t.border, backgroundColor: t.bg, alignSelf: 'flex-start' },
        style,
      ]}
    >
      <Txt variant="micro" color={t.fg} numberOfLines={1}>
        {label.toUpperCase()}
      </Txt>
    </View>
  );
}
