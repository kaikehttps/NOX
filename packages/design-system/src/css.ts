import { font, fontSize, layout, motion, palettes, radius, type Palette, type ThemeName } from './tokens';

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

export function paletteVars(p: Palette): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) out[`--nox-${kebab(k)}`] = v;
  return out;
}

/** Converte `#RRGGBB` em `r, g, b` para composições com transparência. */
export function hexToRgbTriplet(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '183, 255, 90';
  return `${parseInt(m[1]!, 16)}, ${parseInt(m[2]!, 16)}, ${parseInt(m[3]!, 16)}`;
}

/** Variáveis aplicadas em `:root` no desktop. A cor de destaque pode ser sobrescrita pelo usuário. */
export function themeVars(theme: ThemeName, accentOverride?: string): Record<string, string> {
  const p = { ...palettes[theme] };
  if (accentOverride && theme === 'dark') {
    p.accent = accentOverride;
    const rgb = hexToRgbTriplet(accentOverride);
    p.accentTint = `rgba(${rgb}, 0.10)`;
    p.selection = `rgba(${rgb}, 0.22)`;
  }
  return {
    ...paletteVars(p),
    '--nox-accent-rgb': hexToRgbTriplet(p.accent),
    '--nox-font-sans': font.sansStack,
    '--nox-font-mono': font.monoStack,
    '--nox-radius-xs': `${radius.xs}px`,
    '--nox-radius-sm': `${radius.sm}px`,
    '--nox-radius-md': `${radius.md}px`,
    '--nox-radius-lg': `${radius.lg}px`,
    '--nox-fast': `${motion.fast}ms`,
    '--nox-base': `${motion.base}ms`,
    '--nox-slow': `${motion.slow}ms`,
    '--nox-ease': motion.easing,
    '--nox-ease-out': motion.easingOut,
    '--nox-rail-w': `${layout.railWidth}px`,
    '--nox-sidebar-w': `${layout.sidebarWidth}px`,
    '--nox-members-w': `${layout.membersWidth}px`,
    '--nox-header-h': `${layout.headerHeight}px`,
    ...Object.fromEntries(Object.entries(fontSize).map(([k, v]) => [`--nox-fs-${kebab(k)}`, `${v}px`])),
  };
}

export function themeCss(theme: ThemeName = 'dark', selector = ':root'): string {
  const vars = themeVars(theme);
  return `${selector}{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')}}`;
}
