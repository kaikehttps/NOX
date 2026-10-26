import { memo, useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { subscribeConversations, subscribeFriendRequests, subscribeFriends } from '@nox/firebase';
import { usePresence, useProfile, useProfiles, useSubscription } from '@nox/firebase/react';
import { BRAND, normalizeUsername, type Conversation, type FriendRequest, type Friendship } from '@nox/shared';
import { firstIssue, usernameSchema } from '@nox/validation';
import { Avatar } from '../../src/components/Avatar';
import { Button, IconButton } from '../../src/components/Button';
import { EmptyState, InlineError, Loading, useToast } from '../../src/components/Feedback';
import { Divider, Segmented } from '../../src/components/Layout';
import { Logo } from '../../src/components/Logo';
import { UserRow } from '../../src/components/Rows';
import { PRESENCE_LABEL, StatusDot } from '../../src/components/StatusDot';
import { TextField } from '../../src/components/TextField';
import { Txt } from '../../src/components/Txt';
import { errorMessage } from '../../src/lib/errors';
import { nameOf, shortTime } from '../../src/lib/format';
import { haptic } from '../../src/lib/haptics';
import { useNox } from '../../src/providers/NoxProvider';
import { useMe, useSession } from '../../src/providers/SessionProvider';
import { colors, hairline, space } from '../../src/theme';

type Tab = 'conversas' | 'amigos' | 'pedidos';

export default function ConversasScreen() {
  const client = useNox();
  const { uid } = useMe();
  const { status } = useSession();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('conversas');

  const conversations = useSubscription<Conversation[]>((emit) => subscribeConversations(client, uid, emit), [client, uid]);
  const friends = useSubscription<Friendship[]>((emit) => subscribeFriends(client, uid, emit), [client, uid]);
  const incoming = useSubscription<FriendRequest[]>((emit) => subscribeFriendRequests(client, uid, 'incoming', emit), [client, uid]);
  const outgoing = useSubscription<FriendRequest[]>((emit) => subscribeFriendRequests(client, uid, 'outgoing', emit), [client, uid]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.nav }}>
        <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], gap: space[3] }}>
          <Logo size={22} />
          <Txt variant="label" color={colors.text} style={{ flex: 1 }}>
            NOX // conversas
          </Txt>
          <StatusDot status={status === 'invisible' ? 'offline' : status} ringColor={colors.nav} />
          <Txt variant="micro">{PRESENCE_LABEL[status].toUpperCase()}</Txt>
        </View>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'conversas', label: 'Conversas' },
            { value: 'amigos', label: 'Amigos' },
            { value: 'pedidos', label: 'Pedidos', count: incoming.data?.length ?? 0 },
          ]}
        />
      </View>

      {tab === 'conversas' ? (
        <ConversationList state={conversations} myUid={uid} onFindFriends={() => setTab('amigos')} />
      ) : tab === 'amigos' ? (
        <FriendsList friends={friends.data} loading={friends.loading} />
      ) : (
        <RequestsList incoming={incoming.data} outgoing={outgoing.data} loading={incoming.loading || outgoing.loading} />
      )}
    </View>
  );
}

/* ───────────── conversas ───────────── */

function ConversationList({
  state,
  myUid,
  onFindFriends,
}: {
  state: { data: Conversation[] | undefined; loading: boolean; error: Error | null };
  myUid: string;
  onFindFriends: () => void;
}) {
  const router = useRouter();
  const open = useCallback((id: string) => router.push(`/conversation/${id}`), [router]);
  if (state.loading && !state.data) return <Loading />;
  if (state.error) return <InlineError message={errorMessage(state.error)} style={{ margin: space[4] }} />;
  const data = state.data ?? [];
  return (
    <FlatList
      data={data}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => <ConversationRow conv={item} myUid={myUid} onOpen={open} />}
      ItemSeparatorComponent={() => <Divider inset={space[4] + 44 + space[3]} />}
      ListEmptyComponent={<EmptyState code="// sem conversas" text={BRAND.empty.conversations} action={{ label: 'Ver amigos', onPress: onFindFriends }} />}
      contentContainerStyle={{ paddingBottom: space[6] }}
    />
  );
}

const ConversationRow = memo(function ConversationRow({
  conv,
  myUid,
  onOpen,
}: {
  conv: Conversation;
  myUid: string;
  onOpen: (id: string) => void;
}) {
  const client = useNox();
  const others = conv.memberIds.filter((id) => id !== myUid);
  const isDm = conv.type === 'dm';
  const otherUid = isDm ? (others[0] ?? null) : null;
  const other = useProfile(client, otherUid);
  const presence = usePresence(client, otherUid);
  const groupProfiles = useProfiles(client, isDm ? [] : others.slice(0, 4));

  const title = isDm
    ? nameOf(other)
    : conv.name || others.slice(0, 4).map((id) => nameOf(groupProfiles[id])).join(', ') || 'Grupo';

  return (
    <Pressable
      onPress={() => onOpen(conv.id)}
      accessibilityRole="button"
      accessibilityLabel={`Conversa com ${title}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingHorizontal: space[4],
        paddingVertical: space[3],
        backgroundColor: pressed ? colors.surface : 'transparent',
      })}
    >
      <Avatar
        seed={otherUid ?? conv.id}
        name={title}
        url={isDm ? other?.avatarUrl : null}
        size={44}
        status={isDm ? (presence?.state ?? 'offline') : undefined}
      />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Txt variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
            {title}
          </Txt>
          <Txt variant="micro">{shortTime(conv.lastMessageAt)}</Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          {conv.locked ? <Txt variant="micro" color={colors.warning}>BLOQUEADA</Txt> : null}
          {!isDm ? <Txt variant="micro">{`GRUPO·${conv.memberIds.length}`}</Txt> : null}
          <Txt variant="small" numberOfLines={1} style={{ flex: 1 }}>
            {conv.lastMessagePreview || 'Sem mensagens ainda.'}
          </Txt>
        </View>
      </View>
    </Pressable>
  );
});

/* ───────────── amigos ───────────── */

function FriendsList({ friends, loading }: { friends: Friendship[] | undefined; loading: boolean }) {
  const client = useNox();
  const router = useRouter();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) return setError(firstIssue(parsed.error));
    setSending(true);
    try {
      const res = await client.api.sendFriendRequest(normalizeUsername(parsed.data));
      haptic.success();
      setUsername('');
      toast(res.status === 'accepted' ? 'Pedido aceito: vocês agora são amigos.' : `Pedido enviado para @${parsed.data}.`, 'success');
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível enviar o pedido.'));
    } finally {
      setSending(false);
    }
  };

  const manage = useCallback(
    (f: Friendship, name: string) => {
      Alert.alert(name, undefined, [
        { text: 'Abrir conversa', onPress: () => router.push(`/conversation/${f.conversationId}`) },
        {
          text: 'Remover amizade',
          style: 'destructive',
          onPress: () =>
            void client.api.removeFriend(f.uid).then(
              () => toast('Amizade removida.'),
              (err: unknown) => toast(errorMessage(err), 'error'),
            ),
        },
        {
          text: 'Bloquear',
          style: 'destructive',
          onPress: () =>
            void client.api.block(f.uid).then(
              () => toast('Usuário bloqueado.'),
              (err: unknown) => toast(errorMessage(err), 'error'),
            ),
        },
        { text: 'Cancelar', style: 'cancel' },
      ]);
    },
    [client, router, toast],
  );

  return (
    <FlatList
      data={friends ?? []}
      keyExtractor={(f) => f.uid}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ padding: space[4], gap: space[3], borderBottomWidth: hairline, borderBottomColor: colors.border }}>
          <TextField
            label="adicionar amigo"
            value={username}
            onChangeText={(v) => {
              setUsername(v.replace(/\s/g, ''));
              setError(null);
            }}
            placeholder="nome de usuário"
            autoCapitalize="none"
            autoCorrect={false}
            mono
            returnKeyType="send"
            onSubmitEditing={add}
            error={error}
            right={
              <IconButton icon="userPlus" label="Enviar pedido" onPress={add} disabled={!username || sending} color={username ? colors.accent : colors.textFaint} />
            }
          />
        </View>
      }
      renderItem={({ item }) => <FriendRow friendship={item} onOpen={(id) => router.push(`/conversation/${id}`)} onManage={manage} />}
      ListEmptyComponent={loading ? <Loading /> : <EmptyState code="// frequência vazia" text={BRAND.empty.friends} />}
      contentContainerStyle={{ paddingBottom: space[6] }}
    />
  );
}

const FriendRow = memo(function FriendRow({
  friendship,
  onOpen,
  onManage,
}: {
  friendship: Friendship;
  onOpen: (conversationId: string) => void;
  onManage: (f: Friendship, name: string) => void;
}) {
  const client = useNox();
  const profile = useProfile(client, friendship.uid);
  return (
    <UserRow
      uid={friendship.uid}
      onPress={() => onOpen(friendship.conversationId)}
      onLongPress={() => onManage(friendship, nameOf(profile))}
      right={<IconButton icon="more" label="Opções" onPress={() => onManage(friendship, nameOf(profile))} color={colors.textMuted} />}
    />
  );
});

/* ───────────── pedidos ───────────── */

function RequestsList({ incoming, outgoing, loading }: { incoming?: FriendRequest[]; outgoing?: FriendRequest[]; loading: boolean }) {
  const client = useNox();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    try {
      await fn();
      haptic.light();
      toast(ok, 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  type Item = { kind: 'header'; label: string } | { kind: 'in' | 'out'; req: FriendRequest };
  const items: Item[] = [];
  if (incoming?.length) {
    items.push({ kind: 'header', label: `recebidos · ${incoming.length}` });
    for (const r of incoming) items.push({ kind: 'in', req: r });
  }
  if (outgoing?.length) {
    items.push({ kind: 'header', label: `enviados · ${outgoing.length}` });
    for (const r of outgoing) items.push({ kind: 'out', req: r });
  }

  if (loading && items.length === 0) return <Loading />;

  return (
    <FlatList
      data={items}
      keyExtractor={(it) => (it.kind === 'header' ? `h:${it.label}` : `${it.kind}:${it.req.id}`)}
      ListEmptyComponent={<EmptyState code="// nada pendente" text={BRAND.empty.requests} />}
      contentContainerStyle={{ paddingBottom: space[6] }}
      renderItem={({ item }) => {
        if (item.kind === 'header')
          return (
            <Txt variant="label" style={{ paddingHorizontal: space[4], paddingTop: space[5], paddingBottom: space[2] }}>
              {item.label}
            </Txt>
          );
        const r = item.req;
        const isBusy = busy === r.id;
        return item.kind === 'in' ? (
          <UserRow
            uid={r.from}
            showPresence={false}
            right={
              <>
                <Button
                  label="Aceitar"
                  variant="primary"
                  compact
                  loading={isBusy}
                  onPress={() => void run(r.id, () => client.api.acceptFriendRequest(r.id), 'Pedido aceito.')}
                />
                <IconButton
                  icon="close"
                  label="Recusar"
                  disabled={isBusy}
                  color={colors.textMuted}
                  onPress={() => void run(r.id, () => client.api.deleteFriendRequest(r.id), 'Pedido recusado.')}
                />
              </>
            }
          />
        ) : (
          <UserRow
            uid={r.to}
            showPresence={false}
            right={
              <Button
                label="Cancelar"
                compact
                variant="ghost"
                loading={isBusy}
                onPress={() => void run(r.id, () => client.api.deleteFriendRequest(r.id), 'Pedido cancelado.')}
              />
            }
          />
        );
      }}
    />
  );
}
