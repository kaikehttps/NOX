import { memo, useMemo, useState, type ReactNode } from 'react';
import { Alert, Pressable, SectionList, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { subscribeCategories, subscribeChannels, subscribeCommunity, subscribeVoiceStates } from '@nox/firebase';
import { useProfile, useSubscription } from '@nox/firebase/react';
import {
  LIMITS,
  ROLE_LABEL,
  can,
  canOnChannel,
  sameVoiceRoom,
  type Category,
  type Channel,
  type ChannelType,
  type Community,
  type CommunityRole,
  type VoiceState,
} from '@nox/shared';
import { channelCreateSchema, firstIssue } from '@nox/validation';
import { Avatar } from '../../src/components/Avatar';
import { Badge } from '../../src/components/Badge';
import { Button, IconButton } from '../../src/components/Button';
import { EmptyState, InlineError, Loading, useToast } from '../../src/components/Feedback';
import { Icon } from '../../src/components/Icon';
import { Header, Sheet } from '../../src/components/Layout';
import { TextField } from '../../src/components/TextField';
import { Txt } from '../../src/components/Txt';
import { errorMessage } from '../../src/lib/errors';
import { nameOf } from '../../src/lib/format';
import { haptic } from '../../src/lib/haptics';
import { useNox } from '../../src/providers/NoxProvider';
import { useSession } from '../../src/providers/SessionProvider';
import { isVoiceLive, useVoice, useVoiceSnapshot } from '../../src/providers/VoiceProvider';
import { colors, fonts, hairline, space } from '../../src/theme';

interface Section {
  key: string;
  title: string;
  data: Channel[];
}

export default function CommunityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const communityId = String(id);
  const client = useNox();
  const router = useRouter();
  const toast = useToast();
  const { memberships } = useSession();
  const voice = useVoice();
  const snap = useVoiceSnapshot();
  const [sheet, setSheet] = useState<null | 'invite' | 'channel'>(null);

  const community = useSubscription<Community | null>((emit, fail) => subscribeCommunity(client, communityId, emit, fail), [client, communityId]);
  const channels = useSubscription<Channel[]>((emit) => subscribeChannels(client, communityId, emit), [client, communityId]).data;
  const categories = useSubscription<Category[]>((emit) => subscribeCategories(client, communityId, emit), [client, communityId]).data;
  const voiceStates = useSubscription<VoiceState[]>((emit) => subscribeVoiceStates(client, { communityId }, emit), [client, communityId]).data;

  const role: CommunityRole | null = memberships?.find((m) => m.communityId === communityId)?.role ?? null;

  const sections = useMemo<Section[]>(() => {
    const visible = (channels ?? []).filter((ch) => canOnChannel(role, ch, 'view'));
    const cats = [...(categories ?? [])].sort((a, b) => a.position - b.position);
    const known = new Set(cats.map((c) => c.id));
    const out: Section[] = [];
    const loose = visible.filter((ch) => !ch.categoryId || !known.has(ch.categoryId));
    if (loose.length) out.push({ key: '_', title: 'canais', data: loose });
    for (const cat of cats) {
      const data = visible.filter((ch) => ch.categoryId === cat.id);
      if (data.length) out.push({ key: cat.id, title: cat.name, data });
    }
    return out;
  }, [channels, categories, role]);

  const occupants = useMemo(() => {
    const map = new Map<string, VoiceState[]>();
    for (const s of voiceStates ?? []) map.set(s.channelId, [...(map.get(s.channelId) ?? []), s]);
    return map;
  }, [voiceStates]);

  const c = community.data;
  if (community.loading && c === undefined) return <Shell><Loading /></Shell>;
  if (!c) return <Shell><EmptyState code="// sem acesso" text="Este espaço não existe mais ou você não participa dele." /></Shell>;

  const openChannel = (ch: Channel) => {
    if (ch.type === 'text') return router.push(`/channel/${communityId}/${ch.id}`);
    if (!canOnChannel(role, ch, 'connect')) return toast('Você não tem permissão para entrar neste canal de voz.', 'error');
    const ref = { kind: 'channel' as const, communityId, channelId: ch.id };
    if (!(isVoiceLive(snap) && sameVoiceRoom(snap.ref, ref))) void voice.join({ ref, label: ch.name, context: c.name });
    router.push('/voice');
  };

  const more = () => {
    const options: Parameters<typeof Alert.alert>[2] = [];
    if (role !== 'owner') {
      options.push({
        text: 'Sair do espaço',
        style: 'destructive',
        onPress: () =>
          Alert.alert(`Sair de ${c.name}?`, 'Você precisará de um novo convite para voltar.', [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Sair',
              style: 'destructive',
              onPress: () =>
                void client.api.leaveCommunity(communityId).then(
                  () => {
                    toast('Você saiu do espaço.');
                    router.back();
                  },
                  (err: unknown) => toast(errorMessage(err), 'error'),
                ),
            },
          ]),
      });
    }
    options.push({ text: 'Fechar', style: 'cancel' });
    Alert.alert(c.name, role ? `Seu papel: ${ROLE_LABEL[role]}` : undefined, options);
  };

  const canInvite = can(role, 'invites.create');
  const canManage = can(role, 'channels.manage');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header
        back
        left={<Avatar seed={c.id} name={c.name} url={c.iconUrl} size={32} />}
        title={c.name}
        subtitle={`${(channels ?? []).length} CANAIS${role ? ` · ${ROLE_LABEL[role].toUpperCase()}` : ''}`}
        right={
          <>
            {canInvite ? <IconButton icon="userPlus" label="Convidar" onPress={() => setSheet('invite')} /> : null}
            <IconButton icon="more" label="Mais opções" onPress={more} />
          </>
        }
      />
      <SectionList
        sections={sections}
        keyExtractor={(ch) => ch.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: space[10] }}
        ListHeaderComponent={
          c.description || canManage ? (
            <View style={{ padding: space[4], gap: space[3], borderBottomWidth: hairline, borderBottomColor: colors.border }}>
              {c.description ? <Txt variant="small">{c.description}</Txt> : null}
              {canManage ? <Button label="Novo canal" icon="plus" compact onPress={() => setSheet('channel')} style={{ alignSelf: 'flex-start' }} /> : null}
            </View>
          ) : undefined
        }
        renderSectionHeader={({ section }) => (
          <Txt variant="label" style={{ paddingHorizontal: space[4], paddingTop: space[5], paddingBottom: space[2] }}>
            {section.title}
          </Txt>
        )}
        renderItem={({ item }) => (
          <ChannelRow
            channel={item}
            occupants={occupants.get(item.id)}
            active={item.type === 'voice' && isVoiceLive(snap) && sameVoiceRoom(snap.ref, { kind: 'channel', communityId, channelId: item.id })}
            locked={item.type === 'voice' ? !canOnChannel(role, item, 'connect') : !canOnChannel(role, item, 'send')}
            onPress={openChannel}
          />
        )}
        ListEmptyComponent={channels === undefined ? <Loading /> : <EmptyState code="// sem canais" text="Nenhum canal visível para você ainda." />}
      />

      <InviteSheet visible={sheet === 'invite'} onClose={() => setSheet(null)} communityId={communityId} communityName={c.name} />
      <ChannelSheet visible={sheet === 'channel'} onClose={() => setSheet(null)} communityId={communityId} categories={categories ?? []} />
    </View>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header back title="Espaço" />
      {children}
    </View>
  );
}

/* ───────────── canal ───────────── */

const ChannelRow = memo(function ChannelRow({
  channel,
  occupants,
  active,
  locked,
  onPress,
}: {
  channel: Channel;
  occupants: VoiceState[] | undefined;
  active: boolean;
  locked: boolean;
  onPress: (ch: Channel) => void;
}) {
  const isVoice = channel.type === 'voice';
  return (
    <View>
      <Pressable
        onPress={() => onPress(channel)}
        accessibilityRole="button"
        accessibilityLabel={`${isVoice ? 'Canal de voz' : 'Canal'} ${channel.name}`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          marginHorizontal: space[2],
          paddingHorizontal: space[2],
          height: 44,
          backgroundColor: active ? colors.accentTint : pressed ? colors.surface : 'transparent',
          borderLeftWidth: 2,
          borderLeftColor: active ? colors.accent : 'transparent',
        })}
      >
        <Icon name={isVoice ? 'volume' : 'hash'} size={18} color={active ? colors.accent : colors.textMuted} />
        <Txt variant="body" numberOfLines={1} style={{ flex: 1 }} color={active ? colors.text : colors.textMuted}>
          {channel.name}
        </Txt>
        {locked ? <Icon name="lock" size={14} color={colors.textFaint} /> : null}
        {isVoice && occupants?.length ? <Badge label={`${occupants.length}`} tone={active ? 'accent' : 'default'} /> : null}
      </Pressable>
      {isVoice && occupants?.length ? (
        <View style={{ paddingLeft: space[4] + space[2] + 18 + space[3], paddingBottom: space[2], gap: space[1] + 2 }}>
          {occupants.map((o) => (
            <Occupant key={o.uid} uid={o.uid} />
          ))}
        </View>
      ) : null}
    </View>
  );
});

function Occupant({ uid }: { uid: string }) {
  const client = useNox();
  const profile = useProfile(client, uid);
  const name = nameOf(profile);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <Avatar seed={uid} name={name} url={profile?.avatarUrl} size={22} />
      <Txt variant="small" numberOfLines={1}>
        {name}
      </Txt>
    </View>
  );
}

/* ───────────── convite ───────────── */

function InviteSheet({ visible, onClose, communityId, communityName }: { visible: boolean; onClose: () => void; communityId: string; communityName: string }) {
  const client = useNox();
  const toast = useToast();
  const [invite, setInvite] = useState<{ code: string; expiresAt: number | null; maxUses: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      setInvite(await client.api.createInvite(communityId, { maxAgeSeconds: 60 * 60 * 24 * 7, maxUses: null }));
      haptic.success();
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível gerar o convite.'));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setInvite(null);
    setError(null);
    onClose();
  };

  const message = invite ? `Entre no espaço "${communityName}" no NOX com o convite: ${invite.code}` : '';

  return (
    <Sheet visible={visible} onClose={close} title="convidar para o espaço" scroll>
      {invite ? (
        <>
          <View style={{ borderWidth: hairline, borderColor: colors.borderStrong, backgroundColor: colors.surface, padding: space[4], gap: space[2] }}>
            <Txt variant="micro">CÓDIGO DE CONVITE</Txt>
            <Txt variant="heading" style={{ fontFamily: fonts.monoMedium, letterSpacing: 2 }} selectable>
              {invite.code}
            </Txt>
            <Txt variant="micro">
              {invite.expiresAt ? `EXPIRA EM ${new Date(invite.expiresAt).toLocaleDateString('pt-BR')}` : 'SEM EXPIRAÇÃO'}
              {invite.maxUses ? ` · ${invite.maxUses} USOS` : ' · USOS ILIMITADOS'}
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <Button
              label="Copiar"
              icon="copy"
              style={{ flex: 1 }}
              onPress={() => void Clipboard.setStringAsync(invite.code).then(() => toast('Código copiado.', 'success'))}
            />
            <Button
              label="Compartilhar"
              icon="share"
              variant="primary"
              style={{ flex: 1 }}
              onPress={() => void Share.share({ message }).catch(() => undefined)}
            />
          </View>
        </>
      ) : (
        <>
          <Txt variant="small">Gera um código válido por 7 dias. Quem tiver o código entra no espaço como membro.</Txt>
          <InlineError message={error} />
          <Button label="Gerar convite" variant="primary" icon="ticket" onPress={create} loading={busy} />
        </>
      )}
    </Sheet>
  );
}

/* ───────────── novo canal ───────────── */

function ChannelSheet({
  visible,
  onClose,
  communityId,
  categories,
}: {
  visible: boolean;
  onClose: () => void;
  communityId: string;
  categories: Category[];
}) {
  const client = useNox();
  const toast = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState<ChannelType>('text');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setName('');
    setType('text');
    setCategoryId(null);
    setError(null);
    onClose();
  };

  const create = async () => {
    setError(null);
    if (!name.trim()) return setError('Dê um nome ao canal.');
    const parsed = channelCreateSchema.safeParse({ communityId, name, type, categoryId });
    if (!parsed.success) return setError(firstIssue(parsed.error));
    setBusy(true);
    try {
      await client.api.createChannel(communityId, { name: parsed.data.name, type, categoryId: parsed.data.categoryId });
      haptic.success();
      toast(`Canal ${type === 'text' ? '#' : ''}${parsed.data.name} criado.`, 'success');
      close();
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível criar o canal.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={close} title="novo canal" scroll>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        {(['text', 'voice'] as const).map((t) => (
          <Chip key={t} label={t === 'text' ? '# texto' : '» voz'} active={type === t} onPress={() => setType(t)} />
        ))}
      </View>
      <TextField
        label="nome"
        value={name}
        onChangeText={setName}
        maxLength={LIMITS.channel.nameMax}
        counter
        autoCapitalize="none"
        mono
        placeholder={type === 'text' ? 'geral' : 'sala-de-voz'}
        autoFocus
      />
      {categories.length > 0 ? (
        <View style={{ gap: space[2] }}>
          <Txt variant="label">categoria</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            <Chip label="Nenhuma" active={categoryId === null} onPress={() => setCategoryId(null)} />
            {categories.map((cat) => (
              <Chip key={cat.id} label={cat.name} active={categoryId === cat.id} onPress={() => setCategoryId(cat.id)} />
            ))}
          </View>
        </View>
      ) : null}
      <InlineError message={error} />
      <Button label="Criar canal" variant="primary" onPress={create} loading={busy} disabled={!name.trim()} />
    </Sheet>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      style={{
        paddingHorizontal: space[3],
        height: 34,
        justifyContent: 'center',
        borderWidth: hairline,
        borderColor: active ? colors.accent : colors.border,
        backgroundColor: active ? colors.accentTint : colors.surface,
      }}
    >
      <Txt variant="mono" color={active ? colors.accent : colors.textMuted}>
        {label}
      </Txt>
    </Pressable>
  );
}
