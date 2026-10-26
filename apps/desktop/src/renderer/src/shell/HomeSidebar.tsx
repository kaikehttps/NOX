import { memo, useMemo } from 'react';
import { Plus, Users } from 'lucide-react';
import type { Conversation, UserProfile } from '@nox/shared';
import { usePresences, useProfiles } from '@nox/firebase/react';
import { Avatar } from '../components/Avatar';
import { useNav, useSession, useUi } from '../lib/context';
import { useData } from '../lib/data';
import { client } from '../lib/nox';
import { GroupModal } from '../modals/GroupModal';
import { MePanel } from './MePanel';
import { VoiceDock } from './Voice';

export function conversationTitle(cv: Conversation, me: string, profiles: Record<string, UserProfile | null | undefined>): string {
  if (cv.type === 'group') {
    if (cv.name) return cv.name;
    return (
      cv.memberIds
        .filter((u) => u !== me)
        .map((u) => profiles[u]?.displayName ?? '…')
        .join(', ') || 'Grupo'
    );
  }
  const other = cv.memberIds.find((u) => u !== me);
  const p = other ? profiles[other] : undefined;
  return p === null ? 'conta removida' : (p?.displayName ?? '…');
}

const ConversationItem = memo(function ConversationItem(props: {
  cv: Conversation;
  me: string;
  active: boolean;
  unread: boolean;
  profiles: Record<string, UserProfile | null | undefined>;
  presence: Record<string, { state: 'online' | 'idle' | 'dnd' | 'offline' } | undefined>;
}) {
  const { go } = useNav();
  const { cv, me, profiles } = props;
  const other = cv.type === 'dm' ? cv.memberIds.find((u) => u !== me) : undefined;
  const title = conversationTitle(cv, me, profiles);
  return (
    <button
      className={`nav-item${props.active ? ' active' : ''}${props.unread ? ' unread' : ''}`}
      onClick={() => go({ kind: 'conversation', conversationId: cv.id })}
    >
      {other ? (
        <Avatar profile={profiles[other]} size={26} presence={props.presence[other]?.state ?? 'offline'} fallbackSeed={other} />
      ) : (
        <span className="avatar" style={{ width: 26, height: 26 }}>
          <span className="face" style={{ background: 'var(--nox-elevated)' }}>
            <Users size={13} />
          </span>
        </span>
      )}
      <span className="truncate" style={{ flex: 1 }}>
        {title}
        {cv.type === 'group' && <span className="sub">{cv.memberIds.length} membros</span>}
      </span>
      {props.unread && <span className="count-badge">•</span>}
    </button>
  );
});

export function HomeSidebar() {
  const { uid } = useSession();
  const { view, go } = useNav();
  const ui = useUi();
  const { conversations, incoming, isUnread } = useData();

  const peerIds = useMemo(() => [...new Set(conversations.flatMap((cv) => cv.memberIds))].filter((u) => u !== uid), [conversations, uid]);
  const profiles = useProfiles(client(), peerIds);
  const presence = usePresences(client(), peerIds);

  const visible = conversations.filter((cv) => cv.type === 'group' || cv.lastMessagePreview !== null || (view.kind === 'conversation' && view.conversationId === cv.id));

  return (
    <aside className="sidebar">
      <div className="panel-head">
        <span className="title">Início</span>
        <span className="path">~/</span>
      </div>
      <div className="sidebar-scroll">
        <button className={`nav-item${view.kind === 'home' && view.tab !== 'pending' ? ' active' : ''}`} onClick={() => go({ kind: 'home', tab: 'online' })}>
          <span className="glyph">◎</span>
          Amigos
        </button>
        <button className={`nav-item${view.kind === 'home' && view.tab === 'pending' ? ' active' : ''}`} onClick={() => go({ kind: 'home', tab: 'pending' })}>
          <span className="glyph">↯</span>
          Solicitações
          {incoming.length > 0 && (
            <span className="meta">
              <span className="count-badge">{incoming.length}</span>
            </span>
          )}
        </button>

        <div className="section-label">
          <span className="label">mensagens diretas</span>
          <button title="Novo grupo" aria-label="Novo grupo" onClick={() => ui.openModal((close) => <GroupModal onClose={close} />)}>
            <Plus size={14} />
          </button>
        </div>
        {visible.length === 0 ? (
          <p className="hint" style={{ padding: '4px 8px', margin: 0 }}>
            Conversas aparecem aqui. Abra uma pela lista de amigos.
          </p>
        ) : (
          visible.map((cv) => (
            <ConversationItem
              key={cv.id}
              cv={cv}
              me={uid}
              active={view.kind === 'conversation' && view.conversationId === cv.id}
              unread={isUnread(cv)}
              profiles={profiles}
              presence={presence}
            />
          ))
        )}
      </div>
      <VoiceDock />
      <MePanel />
    </aside>
  );
}
