/**
 * Tokens de design do NOX. Fonte única de verdade para cores, tipografia,
 * espaçamento e movimento em desktop (CSS variables) e mobile (StyleSheet).
 * Componentes nunca devem usar valores de cor literais.
 */

export interface Palette {
  bg: string;
  nav: string;
  surface: string;
  elevated: string;
  overlay: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentSoft: string;
  /** Texto sobre a cor de destaque. */
  onAccent: string;
  accentTint: string;
  danger: string;
  dangerTint: string;
  warning: string;
  idle: string;
  dnd: string;
  offline: string;
  selection: string;
}

export const dark: Palette = {
  bg: '#050608',
  nav: '#090B0E',
  surface: '#0D1014',
  elevated: '#12161B',
  overlay: 'rgba(5, 6, 8, 0.72)',
  border: '#242A31',
  borderStrong: '#343C45',
  text: '#F0F3F1',
  textMuted: '#929B98',
  textFaint: '#5D6664',
  accent: '#B7FF5A',
  accentSoft: '#8DBF4A',
  onAccent: '#050608',
  accentTint: 'rgba(183, 255, 90, 0.10)',
  danger: '#FF5C68',
  dangerTint: 'rgba(255, 92, 104, 0.12)',
  warning: '#F5C451',
  idle: '#F5C451',
  dnd: '#FF5C68',
  offline: '#4A5250',
  selection: 'rgba(183, 255, 90, 0.22)',
};

/** Tema claro opcional. O destaque é escurecido para manter contraste AA sobre fundo claro. */
export const light: Palette = {
  bg: '#F4F5F2',
  nav: '#ECEEEA',
  surface: '#FFFFFF',
  elevated: '#FFFFFF',
  overlay: 'rgba(20, 24, 22, 0.40)',
  border: '#D9DDD8',
  borderStrong: '#BFC5BF',
  text: '#0B0D0C',
  textMuted: '#55605C',
  textFaint: '#8A938F',
  accent: '#4F8A10',
  accentSoft: '#6FA82E',
  onAccent: '#FFFFFF',
  accentTint: 'rgba(79, 138, 16, 0.10)',
  danger: '#D6303D',
  dangerTint: 'rgba(214, 48, 61, 0.10)',
  warning: '#B7860B',
  idle: '#B7860B',
  dnd: '#D6303D',
  offline: '#9AA19D',
  selection: 'rgba(79, 138, 16, 0.18)',
};

export const palettes = { dark, light } as const;
export type ThemeName = keyof typeof palettes;

export const font = {
  sans: 'Geist',
  mono: 'Geist Mono',
  /** Pilhas de fallback para a web. */
  sansStack: "'Geist Variable', 'Geist', 'Segoe UI', system-ui, sans-serif",
  monoStack: "'Geist Mono Variable', 'Geist Mono', 'Cascadia Mono', Consolas, monospace",
} as const;

/** Tamanhos em px (desktop) / dp (mobile). `fontScale` do usuário multiplica estes valores. */
export const fontSize = {
  micro: 10,
  label: 11,
  small: 12,
  body: 14,
  bodyLg: 15,
  title: 17,
  heading: 22,
  display: 34,
} as const;

export const lineHeight = { tight: 1.2, normal: 1.45, relaxed: 1.6 } as const;

/** Rótulos técnicos (mono) usam caixa alta com tracking leve. */
export const tracking = { label: 0.08, wide: 0.2, brand: 0.32 } as const;

export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;

/** Cantos quase retos: o NOX é geométrico. */
export const radius = { none: 0, xs: 2, sm: 4, md: 6, lg: 10, pill: 999 } as const;

export const motion = {
  fast: 120,
  base: 180,
  slow: 260,
  cursorBlink: 1100,
  easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
  easingOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const;

export const layout = {
  railWidth: 64,
  sidebarWidth: 248,
  membersWidth: 232,
  headerHeight: 44,
  voiceDockHeight: 92,
} as const;

/** Paleta determinística para avatares sem imagem: tons escuros, nunca o verde de destaque. */
export const avatarTints = ['#1C2A22', '#232233', '#2E2420', '#1D2A30', '#2B2A1C', '#2A1F2B', '#1F2B2A', '#2C2326'] as const;

export function avatarTint(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return avatarTints[Math.abs(h) % avatarTints.length]!;
}

export const ACCENT_PRESETS = ['#B7FF5A', '#5AF0FF', '#FF8A5A', '#C9A7FF', '#FFE45A', '#F0F3F1'] as const;
