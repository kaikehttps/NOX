import { Text, type TextProps } from 'react-native';
import { type, type TypeVariant } from '../theme';

interface Props extends TextProps {
  variant?: TypeVariant;
  color?: string;
}

/** Texto do NOX: sempre a partir de uma variante tipográfica do tema. */
export function Txt({ variant = 'body', color, style, ...rest }: Props) {
  return <Text {...rest} style={[type[variant], color ? { color } : null, style]} />;
}
