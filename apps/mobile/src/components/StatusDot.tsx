import { memo } from 'react';
import { View, type ViewStyle } from 'react-native';
import type { PresenceStatus } from '@nox/shared';
import { colors } from '../theme';

export const presenceColor = (s: PresenceStatus | undefined): string => {
  switch (s) {
    case 'online':
      return colors.accent;
    case 'idle':
      return colors.idle;
    case 'dnd':
      return colors.dnd;
    default:
      return colors.offline;
  }
};

export const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  online: 'online',
  idle: 'ausente',
  dnd: 'não perturbe',
  invisible: 'invisível',
  offline: 'offline',
};

interface Props {
  status: PresenceStatus | undefined;
  size?: number;
  /** Cor do anel que separa o ponto do fundo. */
  ringColor?: string;
  style?: ViewStyle;
}

/** Indicador de presença: quadrado (geométrico, como o resto do NOX). */
export const StatusDot = memo(function StatusDot({ status, size = 9, ringColor = colors.bg, style }: Props) {
  const hollow = status === 'offline' || status === 'invisible' || status === undefined;
  return (
    <View
      style={[
        {
          width: size + 4,
          height: size + 4,
          backgroundColor: ringColor,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <View
        style={{
          width: size,
          height: size,
          backgroundColor: hollow ? 'transparent' : presenceColor(status),
          borderWidth: hollow ? 1.5 : 0,
          borderColor: presenceColor(status),
        }}
      />
    </View>
  );
});
