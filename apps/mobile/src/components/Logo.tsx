import { memo, useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SYMBOL } from '@nox/design-system';
import { colors, motion } from '../theme';

interface Props {
  size?: number;
  color?: string;
  /** Cor do bloco central (o "sinal"/cursor). */
  signalColor?: string;
  /** Pisca o sinal como um cursor de terminal (respeita "reduzir movimento"). */
  blink?: boolean;
}

/** Símbolo do NOX. O bloco central é o sinal: pisca como cursor quando `blink`. */
export const Logo = memo(function Logo({ size = 40, color = colors.text, signalColor = colors.accent, blink = false }: Props) {
  const [on, setOn] = useState(true);

  useEffect(() => {
    if (!blink) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      // Pisca em degraus (liga/desliga), como um cursor real — sem fade.
      timer = setInterval(() => setOn((v) => !v), motion.cursorBlink / 2);
    });
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [blink]);

  return (
    <Svg width={size} height={size} viewBox={SYMBOL.tightViewBox} accessibilityLabel="NOX">
      <Path d={SYMBOL.left} fill={color} />
      <Path d={SYMBOL.signal} fill={signalColor} opacity={on ? 1 : 0} />
      <Path d={SYMBOL.right} fill={color} />
    </Svg>
  );
});
