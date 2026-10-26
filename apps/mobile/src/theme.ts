import { StyleSheet, type TextStyle } from 'react-native';
import { dark, fontSize, lineHeight, motion, radius, space, tracking, avatarTint, type Palette } from '@nox/design-system';
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono/400Regular';
import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono/500Medium';

/**
 * Tema do mobile derivado dos tokens do design system. O NOX mobile é escuro por padrão;
 * nenhum componente usa cor literal — tudo sai daqui.
 */
export const colors: Palette = dark;

/** No Android cada peso é uma família própria (fontWeight não seleciona arquivos customizados). */
export const fonts = {
  sans: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemi: 'Geist_600SemiBold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
} as const;

export const fontAssets = {
  [fonts.sans]: Geist_400Regular,
  [fonts.sansMedium]: Geist_500Medium,
  [fonts.sansSemi]: Geist_600SemiBold,
  [fonts.mono]: GeistMono_400Regular,
  [fonts.monoMedium]: GeistMono_500Medium,
};

export { fontSize, motion, radius, space, avatarTint };

const lh = (size: number, k: number = lineHeight.normal) => Math.round(size * k);

/** Rótulos técnicos: mono, caixa alta, tracking leve. */
export const type = StyleSheet.create({
  display: { fontFamily: fonts.sansSemi, fontSize: fontSize.display, lineHeight: lh(fontSize.display, lineHeight.tight), color: colors.text, letterSpacing: -0.6 },
  heading: { fontFamily: fonts.sansSemi, fontSize: fontSize.heading, lineHeight: lh(fontSize.heading, lineHeight.tight), color: colors.text, letterSpacing: -0.3 },
  title: { fontFamily: fonts.sansMedium, fontSize: fontSize.title, lineHeight: lh(fontSize.title), color: colors.text },
  body: { fontFamily: fonts.sans, fontSize: fontSize.bodyLg, lineHeight: lh(fontSize.bodyLg), color: colors.text },
  bodyStrong: { fontFamily: fonts.sansMedium, fontSize: fontSize.bodyLg, lineHeight: lh(fontSize.bodyLg), color: colors.text },
  small: { fontFamily: fonts.sans, fontSize: fontSize.body, lineHeight: lh(fontSize.body), color: colors.textMuted },
  label: {
    fontFamily: fonts.monoMedium,
    fontSize: fontSize.label,
    lineHeight: lh(fontSize.label, lineHeight.normal),
    color: colors.textMuted,
    letterSpacing: fontSize.label * tracking.label,
    textTransform: 'uppercase',
  },
  mono: { fontFamily: fonts.mono, fontSize: fontSize.small, lineHeight: lh(fontSize.small), color: colors.textMuted },
  micro: { fontFamily: fonts.mono, fontSize: fontSize.micro, lineHeight: lh(fontSize.micro), color: colors.textFaint, letterSpacing: fontSize.micro * tracking.label },
}) satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

/** Borda fina padrão do NOX. */
export const hairline = Math.max(StyleSheet.hairlineWidth, 1);

/** Tamanho do chanfro (corte de 45°) proporcional ao lado. */
export const chamferFor = (size: number) => Math.max(3, Math.round(size * 0.22));

/** Caminho SVG de um retângulo com cantos superior-esquerdo e inferior-direito chanfrados. */
export function chamferPath(w: number, h: number, c: number, inset = 0): string {
  const i = inset;
  const k = Math.max(0, c - i * 0.41);
  return `M${i + k} ${i}H${w - i}V${h - i - k}L${w - i - k} ${h - i}H${i}V${i + k}Z`;
}
