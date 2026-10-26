import { useCallback, useMemo } from 'react';
import { Phone, Users } from 'lucide-react';
import type { Conversation, UserProfile, VoiceState } from '@nox/shared';
import { sameVoiceRoom } from '@nox/shared';
import { subscribeVoiceStates } from '@nox/firebase';
import { usePresence, useProfiles, useSubscription } from '@nox/firebase/react';
import { Avatar } from '../components/Avatar';
import { Empty, SignalLoader } from '../components/Overlay';
import { errorText, useNav, useSession, useUi, useVoice } from '../lib/context';
import { useData } from '../lib/data';
import { client, voice } from '../lib/nox';
import { Chat } from './Chat';
import { conversationTitle } from './HomeSidebar';
import { STATUS_LABEL } from './MePanel';
import { VoiceStage } from './Voice';
import { confirmBlock, confirmUnfriend } from './HomeView';

function ProfilePanel({ profile, uid }: { profile: UserProfile | null | undefined; uid: string }) {
  const presence = usePresence(client(), uid);
  const ui = useUi();
  const { friends } = useData();
  const isFriend = friends.some((f) => f.uid === uid);
  if (profile === null) {
    return (
      <aside className="side-panel">
        <Empty glyph="// conta removida">Esta pessoa excluiu a conta.</Empty>
      </aside>
    );
  }
  return (
    <aside className="side-panel">
      <div className="profile-card">
        <Avatar profile={profile} size={72} presence={presence?.state ?? 'offline'} fallbackSeed={uid} />
        <div>
          <div className="name">{profile?.displayName ?? '…'}</div>
          <div className="mono faint">@{profile?.username}</div>
        </div>
        <span className="chip">● {STATUS_LABEL[presence?.state ?? 'offline']}</span>
        {profile?.bio && <p className="muted selectable" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{profile.bio}</p>}
        <div className="label" style={{ marginTop: 8 }}>
          membro desde
        </div>
        <div className="mono muted">{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('pt-BR') : '—'}</div>
        <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
          {isFriend && (
            <button className="btn" onClick={() => profile && confirmUnfriend(ui, profile)}>
              Desfazer amizade
            </button>
          )}
          <button className="btn danger" onClick={() => profile && confirmBlock(ui, profile)}>
            Bloquear
          </button>
        </div>
      </div>
    </aside>
  );
}

export function ConversationView({ conversationId, conversation }: { conversationId: string; conversation: Conversation | undefined }) {
  const { uid } = useSession();
  const ui = useUi();
  const { go } = useNav();
  const { markRead, loaded } = useData();
  const v = useVoice();
  const c = client();

  const memberIds = conversation?.memberIds ?? [];
  const profiles = useProfiles(c, memberIds);
  const voiceStates = useSubscription<VoiceState[]>((emit) => subscribeVoiceStates(c, { conversationId }, emit), [conversationId]);
  const scope = useMemo(() => ({ kind: 'conversation' as const, conversationId }), [conversationId]);
  const roomRef = useMemo(() => ({ kind: 'conversation' as const, conversationId }), [conversationId]);
  const onActivity = useCallback(() => markRead(conversationId), [markRead, conversationId]);

  if (!conversation) {
    return (
      <main className="main">
        <div className="main-head" />
        {loaded ? (
          <Empty glyph="// 404" action={<button className="btn" onClick={() => go({ kind: 'home', tab: 'online' })}>Voltar</button>}>
            Conversa não encontrada.
          </Empty>
        ) : (
          <div className="empty">
            <SignalLoader />
          </div>
        )}
      </main>
    );
  }

  const title = conversationTitle(conversation, uid, profiles);
  const other = conversation.type === 'dm' ? conversation.memberIds.find((u) => u !== uid) : undefined;
  const inCall = sameVoiceRoom(v.ref, roomRef) && (v.state === 'connecting' || v.state === 'connected' || v.state === 'reconnecting');
  const callActive = inCall || (voiceStates.data?.length ?? 0) > 0;
  const mentionables = memberIds.map((u) => profiles[u]).filter((p): p is UserProfile => Boolean(p) && p!.uid !== uid);

  const startCall = async () => {
    try {
      await voice.join(roomRef);
    } catch (err) {
      ui.toast(errorText(err), 'error');
    }
  };

  return (
    <>
      <main className="main">
        <div className="main-head">
          {other ? <Avatar profile={profiles[other]} size={24} fallbackSeed={other} /> : <Users size={16} className="faint" />}
          <span className="name truncate">{title}</span>
          {conversation.type === 'group' && <span className="topic">{conversation.memberIds.length} membros</span>}
          {conversation.locked && <span className="chip bad">bloqueada</span>}
          <div className="actions">
            {!conversation.locked && !inCall && client().hasServer && (
              <button className="icon-btn" title="Iniciar chamada de voz" onClick={startCall}>
                <Phone size={16} />
              </button>
            )}
          </div>
        </div>
        <div style={{ minHeight: 0, display: 'grid', gridTemplateRows: callActive ? 'minmax(240px, 42%) 1fr' : '1fr' }}>
          {callActive && (
            <div style={{ minHeight: 0, borderBottom: '1px solid var(--nox-border)', display: 'grid' }}>
              <VoiceStage roomRef={roomRef} title={title} occupants={voiceStates.data ?? []} canConnect={!conversation.locked} />
            </div>
          )}
          <Chat
            scope={scope}
            target={title}
            canModerate={false}
            mentionables={mentionables}
            onActivity={onActivity}
            lockedReason={conversation.locked ? 'Conversa bloqueada: vocês não são mais amigos ou houve um bloqueio. O histórico continua disponível.' : null}
            intro={
              <div className="chat-intro">
                <div className="prompt">❯ canal privado estabelecido</div>
                <h1>{title}</h1>
                <p className="muted" style={{ margin: 0 }}>
                  {conversation.type === 'dm' ? 'Início da conversa de vocês. Só vocês dois veem isto.' : 'Início do grupo. Só os membros veem isto.'}
                </p>
              </div>
            }
          />
        </div>
      </main>
      {other && <ProfilePanel profile={profiles[other]} uid={other} />}
    </>
  );
}
