import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { chamferPath } from '../theme';

interface Props {
  fill: string;
  stroke?: string;
  cut?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/** Superfície com o motivo de marca: cantos superior-esquerdo e inferior-direito cortados a 45°. */
export function Chamfer({ fill, stroke, cut = 8, style, children }: Props) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s && s.w === width && s.h === height ? s : { w: width, h: height }));
  };
  return (
    <View style={style} onLayout={onLayout}>
      {size ? (
        <Svg width={size.w} height={size.h} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
          <Path d={chamferPath(size.w, size.h, cut, stroke ? 0.5 : 0)} fill={fill} stroke={stroke} strokeWidth={stroke ? 1 : 0} />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}
