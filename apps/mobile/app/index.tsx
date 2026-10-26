import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '@nox/shared';
import { Button } from '../src/components/Button';
import { Logo } from '../src/components/Logo';
import { Txt } from '../src/components/Txt';
import { colors, space } from '../src/theme';

/** Primeira abertura: curta e memorável. Sem carregamento falso. */
export default function Entry() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        paddingTop: insets.top + space[6],
        paddingBottom: insets.bottom + space[6],
        paddingHorizontal: space[6],
      }}
    >
      <Txt variant="label" color={colors.textFaint}>
        {BRAND.systemLabel}
      </Txt>

      <View style={{ flex: 1, justifyContent: 'center', gap: space[6] }}>
        <Logo size={72} blink />
        <View style={{ gap: space[3] }}>
          <Txt variant="mono" color={colors.accent}>
            {'> '}
            <Txt variant="mono" color={colors.textMuted}>
              {BRAND.entry.status}
            </Txt>
          </Txt>
          <Txt variant="display">{BRAND.entry.headline}</Txt>
        </View>
      </View>

      <View style={{ gap: space[4] }}>
        <Button label={BRAND.entry.cta} variant="primary" onPress={() => router.push('/login')} />
        <Txt variant="micro" style={{ textAlign: 'center' }}>
          {BRAND.taglineIntl}
        </Txt>
      </View>
    </View>
  );
}
