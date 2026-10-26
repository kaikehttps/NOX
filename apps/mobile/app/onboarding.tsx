import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, View, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createProfile, isUsernameAvailable } from '@nox/firebase';
import { LIMITS } from '@nox/shared';
import { displayNameSchema, firstIssue, usernameSchema } from '@nox/validation';
import { Button } from '../src/components/Button';
import { InlineError } from '../src/components/Feedback';
import { Icon } from '../src/components/Icon';
import { Logo } from '../src/components/Logo';
import { TextField } from '../src/components/TextField';
import { Txt } from '../src/components/Txt';
import { errorMessage } from '../src/lib/errors';
import { useNox } from '../src/providers/NoxProvider';
import { useSession } from '../src/providers/SessionProvider';
import { colors, space } from '../src/theme';

type Availability =
  | { state: 'idle' }
  | { state: 'invalid'; message: string }
  | { state: 'checking'; name: string }
  | { state: 'available'; name: string }
  | { state: 'taken'; name: string }
  | { state: 'error'; name: string };

/** Uma tela: nome de usuário (verificado ao vivo) + nome de exibição. */
export default function Onboarding() {
  const client = useNox();
  const { user, signOut } = useSession();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(user?.displayName?.slice(0, LIMITS.displayName.max) ?? '');
  const [availability, setAvailability] = useState<Availability>({ state: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<TextInputInstance>(null);

  // Verificação com debounce; respostas atrasadas de nomes antigos são descartadas.
  useEffect(() => {
    if (!username.trim()) return setAvailability({ state: 'idle' });
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) return setAvailability({ state: 'invalid', message: firstIssue(parsed.error) });
    const name = parsed.data;
    setAvailability({ state: 'checking', name });
    let active = true;
    const timer = setTimeout(() => {
      isUsernameAvailable(client, name)
        .then((ok) => active && setAvailability({ state: ok ? 'available' : 'taken', name }))
        .catch(() => active && setAvailability({ state: 'error', name }));
    }, 450);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [username, client]);

  const nameIssue = displayName.length > 0 ? (() => {
    const r = displayNameSchema.safeParse(displayName);
    return r.success ? null : firstIssue(r.error);
  })() : null;

  const canSubmit = availability.state === 'available' && displayName.trim().length > 0 && !nameIssue && !submitting;

  const submit = async () => {
    if (!user || availability.state !== 'available') return;
    setError(null);
    setSubmitting(true);
    try {
      await createProfile(client, user.uid, {
        username: availability.name,
        displayName: displayName.trim(),
        avatarUrl: user.photoURL ?? null,
      });
      // O guard da navegação leva às abas assim que o perfil aparecer.
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível criar seu perfil.'));
      setSubmitting(false);
    }
  };

  const status = (() => {
    switch (availability.state) {
      case 'checking':
        return (
          <Row>
            <ActivityIndicator size="small" color={colors.textMuted} />
            <Txt variant="mono">verificando @{availability.name}…</Txt>
          </Row>
        );
      case 'available':
        return (
          <Row>
            <Icon name="check" size={14} color={colors.accent} />
            <Txt variant="mono" color={colors.accent}>
              @{availability.name} está livre
            </Txt>
          </Row>
        );
      case 'taken':
        return (
          <Row>
            <Icon name="close" size={14} color={colors.danger} />
            <Txt variant="mono" color={colors.danger}>
              @{availability.name} já está em uso
            </Txt>
          </Row>
        );
      case 'error':
        return <Txt variant="mono" color={colors.warning}>não foi possível verificar agora</Txt>;
      default:
        return <Txt variant="small" color={colors.textFaint}>letras minúsculas, números, _ e . — é assim que te encontram</Txt>;
    }
  })();

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + space[8],
          paddingBottom: insets.bottom + space[6],
          paddingHorizontal: space[6],
          gap: space[5],
        }}
      >
        <View style={{ gap: space[3] }}>
          <Logo size={36} blink />
          <Txt variant="label">identidade</Txt>
          <Txt variant="heading">Como seu grupo vai te ver?</Txt>
        </View>

        <TextField
          label="nome de usuário"
          value={username}
          onChangeText={(v) => setUsername(v.replace(/\s/g, ''))}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          maxLength={LIMITS.username.max + 1}
          mono
          placeholder="seu_nome"
          returnKeyType="next"
          onSubmitEditing={() => nameRef.current?.focus()}
          error={availability.state === 'invalid' ? availability.message : null}
          hint={status}
          right={<Txt variant="mono" color={colors.textFaint}>@</Txt>}
        />

        <TextField
          ref={nameRef}
          label="nome de exibição"
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={LIMITS.displayName.max}
          counter
          placeholder="Como você quer aparecer"
          returnKeyType="done"
          onSubmitEditing={() => canSubmit && void submit()}
          error={nameIssue}
        />

        <InlineError message={error} />

        <Button label="Entrar na frequência" variant="primary" onPress={submit} disabled={!canSubmit} loading={submitting} />

        <View style={{ flex: 1 }} />
        <Pressable onPress={() => void signOut()} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'center' }}>
          <Txt variant="small">
            Conectado como {user?.email ?? 'conta sem e-mail'} · <Txt variant="small" color={colors.text}>sair</Txt>
          </Txt>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>{children}</View>;
}
