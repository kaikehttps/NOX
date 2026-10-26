import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '@nox/shared';
import { colors, hairline, space } from '../theme';
import { Logo } from './Logo';
import { Txt } from './Txt';

interface Props {
  missing: string[];
  error: string | null;
  onReady?: () => void;
}

/** Exibida quando o build não recebeu as variáveis do Firebase/API — nunca um crash. */
export function ConfigMissing({ missing, error, onReady }: Props) {
  const insets = useSafeAreaInsets();
  useEffect(() => onReady?.(), [onReady]);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space[10], paddingBottom: insets.bottom + space[8], paddingHorizontal: space[6], gap: space[5] }}
    >
      <Logo size={44} signalColor={colors.danger} />
      <Txt variant="label">{BRAND.systemLabel}</Txt>
      <Txt variant="heading">Configuração ausente</Txt>
      <Txt variant="body" color={colors.textMuted}>
        {error
          ? 'O app não conseguiu iniciar a conexão com o servidor.'
          : 'Este build do NOX foi gerado sem as variáveis de ambiente necessárias. Copie apps/mobile/.env.example para .env, preencha os valores e gere o app novamente.'}
      </Txt>
      <View style={{ borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface, padding: space[4], gap: space[2] }}>
        {error ? (
          <Txt variant="mono" color={colors.danger}>
            {error}
          </Txt>
        ) : (
          missing.map((k) => (
            <Txt key={k} variant="mono" color={colors.text}>
              <Txt variant="mono" color={colors.danger}>
                {'✕ '}
              </Txt>
              {k}
            </Txt>
          ))
        )}
      </View>
      <Txt variant="micro">Para desenvolvimento local, use EXPO_PUBLIC_USE_EMULATORS=true.</Txt>
    </ScrollView>
  );
}
