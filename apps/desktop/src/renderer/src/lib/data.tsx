import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Block, Conversation, FriendRequest, Friendship, Membership } from '@nox/shared';
import {
  subscribeBlocks,
  subscribeConversations,
  subscribeFriendRequests,
  subscribeFriends,
  subscribeMemberships,
} from '@nox/firebase';
import { useProfiles, useSubscription } from '@nox/firebase/react';
import { client } from './nox';
import { useNav, useSession } from './context';

interface Data {
  memberships: Membership[];
  conversations: Conversation[];
  friends: Friendship[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  blocks: Block[];
  loaded: boolean;
  isUnread: (c: Conversation) => boolean;
  unreadCount: number;
  markRead: (conversationId: string) => void;
}

const DataCtx = createContext<Data | null>(null);

export function useData(): Data {
  const d = useContext(DataCtx);
  if (!d) throw new Error('useData fora do DataProvider');
  return d;
}

const READ_KEY = 'nox.read';

function loadRead(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/**
 * Listeners globais do usuário logado: um por coleção, compartilhados por toda a interface.
 * São encerrados no logout (desmontagem do provider).
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const { uid, status } = useSession();
  const { view } = useNav();
  const c = client();

  const memberships = useSubscription<Membership[]>((emit) => subscribeMemberships(c, uid, emit), [uid]);
  const conversations = useSubscription<Conversation[]>((emit) => subscribeConversations(c, uid, emit), [uid]);
  const friends = useSubscription<Friendship[]>((emit) => subscribeFriends(c, uid, emit), [uid]);
  const incoming = useSubscription<FriendRequest[]>((emit) => subscribeFriendRequests(c, uid, 'incoming', emit), [uid]);
  const outgoing = useSubscription<FriendRequest[]>((emit) => subscribeFriendRequests(c, uid, 'outgoing', emit), [uid]);
  const blocks = useSubscription<Block[]>((emit) => subscribeBlocks(c, uid, emit), [uid]);

  const [read, setRead] = useState<Record<string, number>>(loadRead);

  const markRead = useCallback((conversationId: string) => {
    setRead((prev) => {
      const next = { ...prev, [conversationId]: Date.now() };
      try {
        localStorage.setItem(READ_KEY, JSON.stringify(next));
      } catch {
        /* ignora */
      }
      return next;
    });
  }, []);

  const convs = conversations.data ?? [];
  const isUnread = useCallback(
    (cv: Conversation) => Boolean(cv.lastMessageAt && cv.lastMessageAuthorId && cv.lastMessageAuthorId !== uid && cv.lastMessageAt > (read[cv.id] ?? 0)),
    [read, uid],
  );
  const unreadCount = convs.filter(isUnread).length + (incoming.data?.length ?? 0);

  // Notificações nativas para mensagens novas fora da conversa em foco.
  const authorIds = useMemo(() => [...new Set(convs.map((cv) => cv.lastMessageAuthorId).filter((x): x is string => Boolean(x)))], [convs]);
  const authors = useProfiles(c, authorIds);
  const seen = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    if (!conversations.data) return;
    const prev = seen.current;
    const next = new Map(conversations.data.map((cv) => [cv.id, cv.lastMessageAt ?? 0]));
    seen.current = next;
    if (!prev) return; // primeira carga não notifica
    for (const cv of conversations.data) {
      const before = prev.get(cv.id) ?? 0;
      if (!cv.lastMessageAt || cv.lastMessageAt <= before || cv.lastMessageAuthorId === uid || !cv.lastMessageAuthorId) continue;
      const viewing = view.kind === 'conversation' && view.conversationId === cv.id && document.hasFocus();
      if (viewing || status === 'dnd') continue;
      const author = authors[cv.lastMessageAuthorId];
      const title = cv.type === 'group' ? `${cv.name ?? 'Grupo'} · ${author?.displayName ?? ''}` : (author?.displayName ?? 'Nova mensagem');
      void window.nox?.notify(title, cv.lastMessagePreview ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.data]);

  useEffect(() => {
    void window.nox?.setBadge(unreadCount);
  }, [unreadCount]);

  const value = useMemo<Data>(
    () => ({
      memberships: memberships.data ?? [],
      conversations: convs,
      friends: friends.data ?? [],
      incoming: incoming.data ?? [],
      outgoing: outgoing.data ?? [],
      blocks: blocks.data ?? [],
      loaded: !memberships.loading && !conversations.loading && !friends.loading,
      isUnread,
      unreadCount,
      markRead,
    }),
    [memberships, convs, friends, incoming, outgoing, blocks, conversations.loading, isUnread, unreadCount, markRead],
  );

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
