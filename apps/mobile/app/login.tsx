import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Pressable, ScrollView, View, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authErrorMessage, resetPassword, signInWithEmail, signInWithGoogleIdToken, signUpWithEmail } from '@nox/firebase';
import { BRAND } from '@nox/shared';
import { Button, IconButton } from '../src/components/Button';
import { InlineError, useToast } from '../src/components/Feedback';
import { Logo } from '../src/components/Logo';
import { TextField } from '../src/components/TextField';
import { Txt } from '../src/components/Txt';
import { getGoogleIdToken, googleEnabled, googleErrorMessage } from '../src/lib/google';
import { useNox } from '../src/providers/NoxProvider';
import { colors, hairline, space } from '../src/theme';

type Mode = 'signin' | 'signup';
type Busy = null | 'google' | 'email' | 'reset';

export default function Login() {
  const client = useNox();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const google = async () => {
    setError(null);
    setBusy('google');
    try {
      const idToken = await getGoogleIdToken();
      await signInWithGoogleIdToken(client, idToken);
      // A navegação acontece sozinha quando a sessão muda.
    } catch (err) {
      const msg = googleErrorMessage(err);
      if (msg) setError(msg);
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    setError(null);
    if (!email.trim()) return setError('Informe seu e-mail.');
    if (!password) return setError('Informe a senha.');
    setBusy('email');
    try {
      if (mode === 'signin') await signInWithEmail(client, email, password);
      else await signUpWithEmail(client, email, password);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const forgot = async () => {
    setError(null);
    if (!email.trim()) return setError('Digite seu e-mail acima para receber o link de redefinição.');
    setBusy('reset');
    try {
      await resetPassword(client, email);
      toast('Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.', 'success');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const signup = mode === 'signup';

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + space[2],
          paddingBottom: insets.bottom + space[6],
          paddingHorizontal: space[6],
          gap: space[5],
        }}
      >
        <View style={{ marginLeft: -space[3] }}>
          <IconButton icon="back" label="Voltar" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        </View>

        <View style={{ gap: space[3] }}>
          <Logo size={36} />
          <Txt variant="label">{signup ? 'nova conta' : 'acesso'}</Txt>
          <Txt variant="heading">{signup ? 'Criar sua conta' : 'Entrar no NOX'}</Txt>
        </View>

        {googleEnabled() ? (
          <>
            <Button
              label="Continuar com Google"
              onPress={google}
              loading={busy === 'google'}
              disabled={busy !== null && busy !== 'google'}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <View style={{ flex: 1, height: hairline, backgroundColor: colors.border }} />
              <Txt variant="micro">OU COM E-MAIL</Txt>
              <View style={{ flex: 1, height: hairline, backgroundColor: colors.border }} />
            </View>
          </>
        ) : null}

        <View style={{ gap: space[4] }}>
          <TextField
            label="e-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            placeholder="voce@exemplo.com"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <TextField
            ref={passwordRef}
            label="senha"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={signup ? 'new-password' : 'current-password'}
            textContentType={signup ? 'newPassword' : 'password'}
            returnKeyType="go"
            placeholder={signup ? 'mínimo de 6 caracteres' : '••••••••'}
            onSubmitEditing={submit}
          />
        </View>

        <InlineError message={error} />

        <Button
          label={signup ? 'Criar conta' : 'Entrar'}
          variant="primary"
          onPress={submit}
          loading={busy === 'email'}
          disabled={busy !== null && busy !== 'email'}
        />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: space[3] }}>
          <Pressable
            onPress={() => {
              setMode(signup ? 'signin' : 'signup');
              setError(null);
            }}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Txt variant="small">
              {signup ? 'Já tem conta? ' : 'Novo por aqui? '}
              <Txt variant="small" color={colors.text}>
                {signup ? 'Entrar' : 'Criar conta'}
              </Txt>
            </Txt>
          </Pressable>
          {signup ? null : (
            <Pressable onPress={forgot} accessibilityRole="button" hitSlop={8} disabled={busy !== null}>
              <Txt variant="small" color={busy === 'reset' ? colors.textFaint : colors.textMuted}>
                Esqueci minha senha
              </Txt>
            </Pressable>
          )}
        </View>

        <View style={{ flex: 1 }} />
        <Txt variant="micro" style={{ textAlign: 'center' }}>
          {BRAND.tagline.toUpperCase()}
        </Txt>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
