import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { subscribeConversation, subscribeVoiceStates } from '@nox/firebase';
import { usePresence, useProfile, useProfiles, useSubscription } from '@nox/firebase/react';
import { sameVoiceRoom, type Conversation, type MessageScope, type VoiceRoomRef, type VoiceState } from '@nox/shared';
import { Avatar } from '../../src/components/Avatar';
import { IconButton } from '../../src/components/Button';
import { EmptyState, Loading } from '../../src/components/Feedback';
import { Header } from '../../src/components/Layout';
import { PRESENCE_LABEL } from '../../src/components/StatusDot';
import { Txt } from '../../src/components/Txt';
import { ChatView } from '../../src/chat/ChatView';
import { nameOf } from '../../src/lib/format';
import { useNox } from '../../src/providers/NoxProvider';
import { useMe } from '../../src/providers/SessionProvider';
import { isVoiceLive, useVoice, useVoiceSnapshot } from '../../src/providers/VoiceProvider';
import { colors, space } from '../../src/theme';

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = String(id);
  const client = useNox();
  const router = useRouter();
  const { uid } = useMe();
  const voice = useVoice();
  const snap = useVoiceSnapshot();

  const conv = useSubscription<Conversation | null>((emit) => subscribeConversation(client, conversationId, emit), [client, conversationId]);
  const inCall = useSubscription<VoiceState[]>((emit) => subscribeVoiceStates(client, { conversationId }, emit), [client, conversationId]).data;

  const scope = useMemo<MessageScope>(() => ({ kind: 'conversation', conversationId }), [conversationId]);
  const voiceRef = useMemo<VoiceRoomRef>(() => ({ kind: 'conversation', conversationId }), [conversationId]);

  const c = conv.data;
  const others = c ? c.memberIds.filter((m) => m !== uid) : [];
  const isDm = c?.type === 'dm';
  const otherUid = isDm ? (others[0] ?? null) : null;
  const other = useProfile(client, otherUid);
  const presence = usePresence(client, otherUid);
  const groupProfiles = useProfiles(client, isDm ? [] : others.slice(0, 5));

  if (conv.loading && !c) return <Shell><Loading /></Shell>;
  if (!c) return <Shell><EmptyState code="// 404" text="Conversa não encontrada ou você não participa dela." /></Shell>;

  const title = isDm ? nameOf(other) : c.name || others.slice(0, 5).map((m) => nameOf(groupProfiles[m])).join(', ') || 'Grupo';
  const callHere = isVoiceLive(snap) && sameVoiceRoom(snap.ref, voiceRef);
  const callCount = inCall?.length ?? 0;

  const startCall = () => {
    if (!callHere) void voice.join({ ref: voiceRef, label: title, context: isDm ? 'chamada privada' : 'chamada em grupo' });
    router.push('/voice');
  };

  const subtitle = isDm ? (
    <Txt variant="micro" color={presence?.state === 'online' ? colors.accent : colors.textFaint} numberOfLines={1}>
      {other?.username ? `@${other.username} · ` : ''}
      {PRESENCE_LABEL[presence?.state ?? 'offline'].toUpperCase()}
      {callCount > 0 ? ` · ${callCount} EM CHAMADA` : ''}
    </Txt>
  ) : (
    <Txt variant="micro" numberOfLines={1}>
      {`GRUPO · ${c.memberIds.length} MEMBROS`}
      {callCount > 0 ? ` · ${callCount} EM CHAMADA` : ''}
    </Txt>
  );

  return (
    <ChatView
      scope={scope}
      placeholder={isDm ? `Mensagem para ${title}` : 'Mensagem para o grupo'}
      blockedReason={c.locked ? 'Esta conversa está bloqueada: dá para ler o histórico, mas não enviar novas mensagens.' : null}
      header={
        <Header
          back
          left={<Avatar seed={otherUid ?? c.id} name={title} url={isDm ? other?.avatarUrl : null} size={32} status={isDm ? (presence?.state ?? 'offline') : undefined} surface={colors.nav} />}
          title={title}
          subtitle={subtitle}
          right={
            c.locked ? null : (
              <IconButton
                icon="phone"
                label={callHere ? 'Abrir chamada' : 'Iniciar chamada de voz'}
                onPress={startCall}
                active={callHere || callCount > 0}
                bordered
              />
            )
          }
        />
      }
    />
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header back title="Conversa" />
      <View style={{ padding: space[2] }}>{children}</View>
    </View>
  );
}
