import { memo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { previewInvite, subscribeCommunity } from '@nox/firebase';
import { useSubscription } from '@nox/firebase/react';
import { BRAND, LIMITS, ROLE_LABEL, type Community, type Membership } from '@nox/shared';
import { communityCreateSchema, firstIssue, inviteCodeSchema } from '@nox/validation';
import { Avatar } from '../../src/components/Avatar';
import { Badge } from '../../src/components/Badge';
import { Button } from '../../src/components/Button';
import { EmptyState, InlineError, Loading, useToast } from '../../src/components/Feedback';
import { Icon } from '../../src/components/Icon';
import { Divider, Sheet } from '../../src/components/Layout';
import { Logo } from '../../src/components/Logo';
import { TextField } from '../../src/components/TextField';
import { Txt } from '../../src/components/Txt';
import { errorMessage } from '../../src/lib/errors';
import { haptic } from '../../src/lib/haptics';
import { useNox } from '../../src/providers/NoxProvider';
import { useSession } from '../../src/providers/SessionProvider';
import { colors, hairline, space } from '../../src/theme';

export default function EspacosScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { memberships } = useSession();
  const [sheet, setSheet] = useState<null | 'create' | 'join'>(null);

  const sorted = [...(memberships ?? [])].sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.nav, borderBottomWidth: hairline, borderBottomColor: colors.border }}>
        <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], gap: space[3] }}>
          <Logo size={22} />
          <Txt variant="label" color={colors.text} style={{ flex: 1 }}>
            NOX // espaços
          </Txt>
          <Txt variant="micro">{memberships ? `${memberships.length} ATIVOS` : ''}</Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: space[2], paddingHorizontal: space[4], paddingBottom: space[3] }}>
          <Button label="Criar espaço" variant="primary" compact icon="plus" onPress={() => setSheet('create')} style={{ flex: 1 }} />
          <Button label="Usar convite" compact icon="ticket" onPress={() => setSheet('join')} style={{ flex: 1 }} />
        </View>
      </View>

      {memberships === undefined ? (
        <Loading />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(m) => m.communityId}
          renderItem={({ item }) => <CommunityRow membership={item} onOpen={(id) => router.push(`/community/${id}`)} />}
          ItemSeparatorComponent={() => <Divider inset={space[4] + 44 + space[3]} />}
          ListEmptyComponent={<EmptyState code="// nenhum espaço" text={BRAND.empty.communities} />}
          contentContainerStyle={{ paddingBottom: space[6] }}
        />
      )}

      <CreateCommunitySheet visible={sheet === 'create'} onClose={() => setSheet(null)} />
      <JoinSheet visible={sheet === 'join'} onClose={() => setSheet(null)} />
    </View>
  );
}

const CommunityRow = memo(function CommunityRow({ membership, onOpen }: { membership: Membership; onOpen: (id: string) => void }) {
  const client = useNox();
  const { data: community } = useSubscription<Community | null>(
    (emit, fail) => subscribeCommunity(client, membership.communityId, emit, fail),
    [client, membership.communityId],
  );
  const name = community?.name ?? '…';
  return (
    <Pressable
      onPress={() => onOpen(membership.communityId)}
      accessibilityRole="button"
      accessibilityLabel={`Espaço ${name}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingHorizontal: space[4],
        paddingVertical: space[3],
        backgroundColor: pressed ? colors.surface : 'transparent',
      })}
    >
      <Avatar seed={membership.communityId} name={name} url={community?.iconUrl} size={44} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Txt variant="bodyStrong" numberOfLines={1}>
          {name}
        </Txt>
        {community?.description ? (
          <Txt variant="small" numberOfLines={1}>
            {community.description}
          </Txt>
        ) : null}
        <Badge label={ROLE_LABEL[membership.role]} tone={membership.role === 'owner' ? 'accent' : 'default'} />
      </View>
      <Icon name="chevronRight" size={18} color={colors.textFaint} />
    </Pressable>
  );
});

/* ───────────── criar espaço ───────────── */

function CreateCommunitySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const client = useNox();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setName('');
    setDescription('');
    setError(null);
    onClose();
  };

  const create = async () => {
    setError(null);
    if (name.trim().length < LIMITS.community.nameMin) return setError(`O nome precisa de pelo menos ${LIMITS.community.nameMin} caracteres.`);
    const parsed = communityCreateSchema.safeParse({ name, description });
    if (!parsed.success) return setError(firstIssue(parsed.error));
    setBusy(true);
    try {
      const { communityId } = await client.api.createCommunity(parsed.data.name, parsed.data.description);
      haptic.success();
      toast('Espaço criado.', 'success');
      close();
      router.push(`/community/${communityId}`);
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível criar o espaço.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={close} title="novo espaço" scroll>
      <TextField label="nome" value={name} onChangeText={setName} maxLength={LIMITS.community.nameMax} counter placeholder="Ex.: Quarta do Jogo" autoFocus />
      <TextField
        label="descrição (opcional)"
        value={description}
        onChangeText={setDescription}
        maxLength={LIMITS.community.descriptionMax}
        multiline
        style={{ minHeight: 80 }}
        placeholder="Sobre o que é este espaço"
      />
      <InlineError message={error} />
      <Button label="Criar espaço" variant="primary" onPress={create} loading={busy} disabled={name.trim().length < LIMITS.community.nameMin} />
    </Sheet>
  );
}

/* ───────────── entrar com convite ───────────── */

type Preview = { code: string; communityId: string; communityName: string };

function JoinSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const client = useNox();
  const router = useRouter();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<null | 'check' | 'join'>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setCode('');
    setPreview(null);
    setError(null);
    onClose();
  };

  const check = async () => {
    setError(null);
    setPreview(null);
    const parsed = inviteCodeSchema.safeParse(code);
    if (!parsed.success) return setError('Código inválido. Confira e tente de novo.');
    setBusy('check');
    try {
      const p = await previewInvite(client, parsed.data);
      if (!p) setError('Convite não encontrado.');
      else if (p.revoked) setError('Este convite foi revogado.');
      else setPreview({ code: p.code, communityId: p.communityId, communityName: p.communityName });
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível verificar o convite.'));
    } finally {
      setBusy(null);
    }
  };

  const join = async () => {
    if (!preview) return;
    setBusy('join');
    setError(null);
    try {
      const res = await client.api.redeemInvite(preview.code);
      haptic.success();
      toast(res.alreadyMember ? 'Você já participa deste espaço.' : `Bem-vindo a ${preview.communityName}.`, 'success');
      close();
      router.push(`/community/${res.communityId}`);
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível entrar no espaço.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet visible={visible} onClose={close} title="entrar com convite" scroll>
      <TextField
        label="código ou link do convite"
        value={code}
        onChangeText={(v) => {
          setCode(v.trim());
          setPreview(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        mono
        placeholder="abcd2345ef"
        returnKeyType="search"
        onSubmitEditing={check}
        autoFocus
      />
      {preview ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface }}>
          <Avatar seed={preview.communityId} name={preview.communityName} size={40} />
          <View style={{ flex: 1 }}>
            <Txt variant="micro">CONVITE VÁLIDO</Txt>
            <Txt variant="bodyStrong" numberOfLines={1}>
              {preview.communityName}
            </Txt>
          </View>
        </View>
      ) : null}
      <InlineError message={error} />
      {preview ? (
        <Button label={`Entrar em ${preview.communityName}`} variant="primary" onPress={join} loading={busy === 'join'} />
      ) : (
        <Button label="Verificar convite" onPress={check} loading={busy === 'check'} disabled={!code} />
      )}
    </Sheet>
  );
}
