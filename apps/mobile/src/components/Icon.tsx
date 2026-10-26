import { memo } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../theme';

/**
 * Ícones de traço geométrico (grade 24, pontas quadradas), desenhados para o NOX.
 * Sem biblioteca externa: poucos glifos, consistentes com a linguagem de bordas finas.
 */
const PATHS = {
  chat: 'M4 5h16v11H10l-6 4z',
  spaces: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  settings: 'M4 6h9M17 6h3M15 4v4M4 12h3M11 12h9M9 10v4M4 18h11M19 18h1M17 16v4',
  plus: 'M12 5v14M5 12h14',
  hash: 'M10 4 8 20M16 4l-2 16M5 9h15M4 15h15',
  volume: 'M4 9h4l5-4v14l-5-4H4zM16.5 9.5a3.5 3.5 0 0 1 0 5M19 7a7 7 0 0 1 0 10',
  mic: 'M9 4h6v9H9zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21',
  micOff: 'M9 4h6v9H9zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M4 4l16 16',
  headphones: 'M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H4zM17 15h3v5h-3z',
  headphonesOff: 'M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H4zM17 15h3v5h-3zM3 3l18 18',
  leave: 'M10 4H5v16h5M14 8l4 4-4 4M18 12H9',
  back: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  send: 'M12 19V5M6 11l6-6 6 6',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  reply: 'M10 7l-5 5 5 5M5 12h9a5 5 0 0 1 5 5v1',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  clock: 'M12 7v5l3 2',
  alert: 'M12 3 2 20h20zM12 10v4M12 16.5v1',
  close: 'M6 6l12 12M18 6 6 18',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  check: 'M5 12l5 5 9-10',
  userPlus: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a7 7 0 0 1 14 0v1M19 8v6M16 11h6',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z',
  smile: 'M8.5 14a4 4 0 0 0 7 0M9 9.5v1M15 9.5v1',
  more: '',
  ticket: 'M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM14 7v10',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
} as const;

const CIRCLES: Partial<Record<IconName, [number, number, number][]>> = {
  clock: [[12, 12, 9]],
  smile: [[12, 12, 9]],
  more: [
    [5, 12, 1.2],
    [12, 12, 1.2],
    [19, 12, 1.2],
  ],
};

export type IconName = keyof typeof PATHS;

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export const Icon = memo(function Icon({ name, size = 20, color = colors.text, strokeWidth = 1.75 }: Props) {
  const d = PATHS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {d ? <Path d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" /> : null}
      {CIRCLES[name]?.map(([cx, cy, r], i) => (
        <Circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill={name === 'more' ? color : 'none'}
        />
      ))}
    </Svg>
  );
});
