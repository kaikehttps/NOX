import { memo, useId } from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { ClipPath, Defs, Image as SvgImage, Path } from 'react-native-svg';
import type { PresenceStatus } from '@nox/shared';
import { avatarTint, chamferFor, chamferPath, colors, fonts } from '../theme';
import { StatusDot } from './StatusDot';
import { Txt } from './Txt';

interface Props {
  /** Semente estável para a cor (uid ou id do espaço). */
  seed: string;
  name: string;
  url?: string | null;
  size?: number;
  /** Anel verde de atividade de voz. */
  speaking?: boolean;
  status?: PresenceStatus;
  /** Cor do fundo sob o avatar (anel do ponto de presença). */
  surface?: string;
  style?: ViewStyle;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]!.charAt(0);
  const second = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : parts[0]!.charAt(1);
  return (first + second).toUpperCase();
}

/** Avatar chanfrado (cortes de 45° no canto superior-esquerdo e inferior-direito). */
export const Avatar = memo(function Avatar({ seed, name, url, size = 36, speaking, status, surface = colors.bg, style }: Props) {
  const rawId = useId();
  const clipId = `av${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const c = chamferFor(size);
  const d = chamferPath(size, size, c);
  const dotSize = Math.max(7, Math.round(size * 0.24));

  return (
    <View style={[{ width: size, height: size }, style]} accessibilityLabel={name}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <ClipPath id={clipId}>
            <Path d={d} />
          </ClipPath>
        </Defs>
        <Path d={d} fill={avatarTint(seed)} />
        {url ? (
          <SvgImage href={{ uri: url }} width={size} height={size} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />
        ) : null}
        {speaking ? <Path d={chamferPath(size, size, c, 1.25)} fill="none" stroke={colors.accent} strokeWidth={2.5} /> : null}
      </Svg>
      {url ? null : (
        <View
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}
          pointerEvents="none"
        >
          <Txt
            style={{
              fontFamily: fonts.monoMedium,
              fontSize: Math.max(9, Math.round(size * 0.34)),
              lineHeight: Math.round(size * 0.5),
              color: colors.text,
            }}
          >
            {initials(name)}
          </Txt>
        </View>
      )}
      {status ? <StatusDot status={status} size={dotSize} ringColor={surface} style={{ position: 'absolute', right: -2, bottom: -2 }} /> : null}
    </View>
  );
});
