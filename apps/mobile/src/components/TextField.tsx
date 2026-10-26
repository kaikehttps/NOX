import { forwardRef, useState, type ReactNode } from 'react';
import { TextInput, View, type StyleProp, type TextInputInstance, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, fonts, fontSize, hairline, space } from '../theme';
import { Txt } from './Txt';

interface Props extends TextInputProps {
  label?: string;
  /** Mensagem de erro sob o campo (substitui a dica). */
  error?: string | null;
  hint?: ReactNode;
  /** Exibe "n/max" à direita do rótulo. */
  counter?: boolean;
  mono?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  right?: ReactNode;
}

/** Campo de texto com rótulo técnico em mono e borda fina que acende no foco. */
export const TextField = forwardRef<TextInputInstance, Props>(function TextField(
  { label, error, hint, counter, mono, containerStyle, right, style, onFocus, onBlur, value, maxLength, multiline, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const border = error ? colors.danger : focused ? colors.borderStrong : colors.border;
  return (
    <View style={[{ gap: space[1] + 2 }, containerStyle]}>
      {label || counter ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {label ? <Txt variant="label">{label}</Txt> : <View />}
          {counter && maxLength ? (
            <Txt variant="micro">
              {(value ?? '').length}/{maxLength}
            </Txt>
          ) : null}
        </View>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          borderWidth: hairline,
          borderColor: border,
          backgroundColor: colors.surface,
          minHeight: 48,
        }}
      >
        {focused ? <View style={{ position: 'absolute', left: -hairline, top: -hairline, bottom: -hairline, width: 2, backgroundColor: error ? colors.danger : colors.accent }} /> : null}
        <TextInput
          ref={ref}
          value={value}
          maxLength={maxLength}
          multiline={multiline}
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          keyboardAppearance="dark"
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            {
              flex: 1,
              color: colors.text,
              fontFamily: mono ? fonts.mono : fonts.sans,
              fontSize: fontSize.bodyLg,
              paddingHorizontal: space[3],
              paddingVertical: multiline ? space[3] : space[2],
              minHeight: 46,
              textAlignVertical: multiline ? 'top' : 'center',
            },
            style,
          ]}
          {...rest}
        />
        {right ? <View style={{ paddingRight: space[2], alignSelf: 'center' }}>{right}</View> : null}
      </View>
      {error ? (
        <Txt variant="small" color={colors.danger}>
          {error}
        </Txt>
      ) : hint ? (
        typeof hint === 'string' ? (
          <Txt variant="small" color={colors.textFaint}>
            {hint}
          </Txt>
        ) : (
          hint
        )
      ) : null}
    </View>
  );
});
