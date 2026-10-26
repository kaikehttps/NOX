import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { saveSettings, subscribeSettings, updateProfile, DEFAULT_SETTINGS } from '@nox/firebase';
import { useSubscription } from '@nox/firebase/react';
import { BRAND, LIMITS, type PresenceStatus, type UserSettings } from '@nox/shared';
import { firstIssue, profileUpdateSchema } from '@nox/validation';
import { Avatar } from '../../src/components/Avatar';
import { Button } from '../../src/components/Button';
import { InlineError, useToast } from '../../src/components/Feedback';
import { Icon } from '../../src/components/Icon';
import { Divider, SectionLabel } from '../../src/components/Layout';
import { Logo } from '../../src/components/Logo';
import { PRESENCE_LABEL, StatusDot } from '../../src/components/StatusDot';
import { TextField } from '../../src/components/TextField';
import { Txt } from '../../src/components/Txt';
import { errorMessage } from '../../src/lib/errors';
import { haptic } from '../../src/lib/haptics';
import { useNox } from '../../src/providers/NoxProvider';
import { useMe, useSession } from '../../src/providers/SessionProvider';
import { colors, hairline, space } from '../../src/theme';

const STATUSES: { value: Exclude<PresenceStatus, 'offline'>; hint: string }[] = [
  { value: 'online', hint: 'Disponível para o grupo.' },
  { value: 'idle', hint: 'Por perto, mas não respondendo.' },
  { value: 'dnd', hint: 'Sem interrupções.' },
  { value: 'invisible', hint: 'Aparece offline para os outros.' },
];

export default function AjustesScreen() {
  const client = useNox();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { uid, profile } = useMe();
  const { status, setStatus, signOut, finishAccountDeletion } = useSession();

  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // Mantém os campos em sincronia quando o perfil muda em outro dispositivo.
  useEffect(() => setDisplayName(profile.displayName), [profile.displayName]);
  useEffect(() => setBio(profile.bio), [profile.bio]);

  const settings = useSubscription<UserSettings>((emit) => subscribeSettings(client, uid, emit), [client, uid]).data ?? DEFAULT_SETTINGS;

  const dirty = displayName.trim() !== profile.displayName || bio !== profile.bio;

  const save = async () => {
    setProfileError(null);
    const parsed = profileUpdateSchema.safeParse({ displayName, bio });
    if (!parsed.success) return setProfileError(firstIssue(parsed.error));
    setSaving(true);
    try {
      await updateProfile(client, uid, { displayName: parsed.data.displayName ?? profile.displayName, bio: parsed.data.bio ?? '' });
      haptic.success();
      toast('Perfil atualizado.', 'success');
    } catch (err) {
      setProfileError(errorMessage(err, 'Não foi possível salvar.'));
    } finally {
      setSaving(false);
    }
  };

  const togglePrivacy = (value: boolean) => {
    void saveSettings(client, uid, { allowFriendRequests: value }).catch((err: unknown) => toast(errorMessage(err), 'error'));
  };

  const confirmSignOut = () => {
    Alert.alert('Sair do NOX?', 'Você pode entrar de novo a qualquer momento.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: () => {
          setSigningOut(true);
          void signOut().finally(() => setSigningOut(false));
        },
      },
    ]);
  };

  const confirmDelete = () => {
    Alert.alert(
      'Excluir sua conta?',
      'Seu perfil, amizades e espaços sem outros membros serão apagados. Mensagens enviadas continuam visíveis para os outros como "conta removida". Isso não pode ser desfeito.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir definitivamente',
          style: 'destructive',
          onPress: async () => {
            setDeleteError(null);
            setDeleting(true);
            try {
              await client.api.deleteAccount();
              await finishAccountDeletion();
            } catch (err) {
              setDeleteError(errorMessage(err, 'Não foi possível excluir a conta.'));
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.nav, borderBottomWidth: hairline, borderBottomColor: colors.border }}>
        <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], gap: space[3] }}>
          <Logo size={22} />
          <Txt variant="label" color={colors.text}>
            NOX // ajustes
          </Txt>
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space[10] }}>
        {/* identidade */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4], padding: space[4] }}>
          <Avatar seed={uid} name={profile.displayName} url={profile.avatarUrl} size={60} status={status === 'invisible' ? 'offline' : status} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="title" numberOfLines={1}>
              {profile.displayName}
            </Txt>
            <Txt variant="mono" numberOfLines={1}>
              @{profile.username}
            </Txt>
          </View>
        </View>

        <SectionLabel>perfil</SectionLabel>
        <View style={{ paddingHorizontal: space[4], gap: space[4] }}>
          <TextField label="nome de exibição" value={displayName} onChangeText={setDisplayName} maxLength={LIMITS.displayName.max} counter />
          <TextField
            label="bio"
            value={bio}
            onChangeText={setBio}
            maxLength={LIMITS.bio.max}
            counter
            multiline
            style={{ minHeight: 88 }}
            placeholder="Uma linha sobre você"
          />
          <InlineError message={profileError} />
          <Button label="Salvar perfil" variant={dirty ? 'primary' : 'secondary'} onPress={save} disabled={!dirty || !displayName.trim()} loading={saving} />
        </View>

        <SectionLabel>status</SectionLabel>
        <View style={{ borderTopWidth: hairline, borderBottomWidth: hairline, borderColor: colors.border }}>
          {STATUSES.map((s, i) => {
            const active = status === s.value;
            return (
              <View key={s.value}>
                {i > 0 ? <Divider inset={space[4]} /> : null}
                <Pressable
                  onPress={() => {
                    haptic.select();
                    void setStatus(s.value).catch(() => toast('Não foi possível atualizar seu status.', 'error'));
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space[3],
                    paddingHorizontal: space[4],
                    paddingVertical: space[3],
                    backgroundColor: pressed ? colors.surface : active ? colors.accentTint : 'transparent',
                  })}
                >
                  <StatusDot status={s.value === 'invisible' ? 'offline' : s.value} ringColor="transparent" />
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong">{capitalize(PRESENCE_LABEL[s.value])}</Txt>
                    <Txt variant="small">{s.hint}</Txt>
                  </View>
                  {active ? <Icon name="check" size={18} color={colors.accent} /> : null}
                </Pressable>
              </View>
            );
          })}
        </View>

        <SectionLabel>privacidade</SectionLabel>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], gap: space[3] }}>
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong">Aceitar pedidos de amizade</Txt>
            <Txt variant="small">Quando desligado, ninguém consegue te adicionar pelo nome de usuário.</Txt>
          </View>
          <Switch
            value={settings.allowFriendRequests}
            onValueChange={togglePrivacy}
            trackColor={{ false: colors.borderStrong, true: colors.accentSoft }}
            thumbColor={settings.allowFriendRequests ? colors.accent : colors.textMuted}
            ios_backgroundColor={colors.borderStrong}
          />
        </View>

        <SectionLabel>conta</SectionLabel>
        <View style={{ paddingHorizontal: space[4], gap: space[3] }}>
          <Button label="Sair" icon="leave" onPress={confirmSignOut} loading={signingOut} />
          <Button label="Excluir conta" variant="danger" icon="trash" onPress={confirmDelete} loading={deleting} />
          <InlineError message={deleteError} />
        </View>

        <View style={{ alignItems: 'center', gap: space[1], paddingTop: space[10] }}>
          <Txt variant="micro">{BRAND.systemLabel}</Txt>
          <Txt variant="micro">
            {BRAND.tagline.toUpperCase()} · v{Constants.expoConfig?.version ?? '0.1.0'}
          </Txt>
        </View>
      </ScrollView>
    </View>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
