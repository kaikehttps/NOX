import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import type { User } from 'firebase/auth';
import type { DocumentSnapshot, Unsubscribe } from 'firebase/firestore';
import { BurstLimiter, LIMITS, type MessageReply, type MessageScope, type UserProfile } from '@nox/shared';
import type { NoxClient } from './client';
import { observeAuth } from './auth';
import { KeyedSubscriptionStore } from './store';
import { subscribePresence, type PresenceSnapshot } from './presence';
import {
  fetchOlderMessages,
  newMessageId,
  scopeKey,
  sendMessage,
  subscribeProfile,
  subscribeRecentMessages,
  type MessageView,
} from './repo';

/* ───────────── genérico ───────────── */

export interface SubscriptionState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
}

/**
 * Assina uma fonte em tempo real enquanto o componente estiver montado.
 * O listener é encerrado ao desmontar ou quando as dependências mudam.
 */
export function useSubscription<T>(
  subscribe: ((emit: (value: T) => void, fail: (err: Error) => void) => Unsubscribe) | null,
  deps: readonly unknown[],
): SubscriptionState<T> {
  const [state, setState] = useState<SubscriptionState<T>>({ data: undefined, loading: subscribe !== null, error: null });
  useEffect(() => {
    if (!subscribe) {
      setState({ data: undefined, loading: false, error: null });
      return;
    }
    setState((s) => ({ data: s.data, loading: true, error: null }));
    let active = true;
    const unsub = subscribe(
      (data) => active && setState({ data, loading: false, error: null }),
      (error) => active && setState({ data: undefined, loading: false, error }),
    );
    return () => {
      active = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function useAuthUser(client: NoxClient): { user: User | null; loading: boolean } {
  const [state, setState] = useState<{ user: User | null; loading: boolean }>({
    user: client.auth.currentUser,
    loading: client.auth.currentUser === null,
  });
  useEffect(() => observeAuth(client, (user) => setState({ user, loading: false })), [client]);
  return state;
}

/* ───────────── perfis e presença compartilhados ───────────── */

let profileStore: KeyedSubscriptionStore<UserProfile | null> | null = null;
let presenceStore: KeyedSubscriptionStore<PresenceSnapshot> | null = null;

function stores(client: NoxClient) {
  // Erros (rede, permissão) mantêm o estado "carregando" em vez de fingir que o perfil não existe.
  profileStore ??= new KeyedSubscriptionStore((uid, emit) => subscribeProfile(client, uid, emit));
  presenceStore ??= new KeyedSubscriptionStore((uid, emit) => subscribePresence(client, uid, emit));
  return { profileStore, presenceStore };
}

/** Encerra listeners compartilhados (chamar no logout). */
export function resetSharedStores() {
  profileStore?.clear();
  presenceStore?.clear();
  profileStore = null;
  presenceStore = null;
}

function useKeyed<T>(store: KeyedSubscriptionStore<T>, key: string | null | undefined): T | undefined {
  return useSyncExternalStore(
    useCallback((cb) => (key ? store.subscribe(key, cb) : () => undefined), [store, key]),
    () => (key ? store.get(key) : undefined),
  );
}

function useKeyedMany<T>(store: KeyedSubscriptionStore<T>, keys: readonly string[]): Record<string, T | undefined> {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const joined = [...new Set(keys)].sort().join('|');
  useEffect(() => {
    if (!joined) return;
    const unsubs = joined.split('|').map((k) => store.subscribe(k, bump));
    bump();
    return () => unsubs.forEach((u) => u());
  }, [store, joined]);
  const out: Record<string, T | undefined> = {};
  for (const k of keys) out[k] = store.get(k);
  return out;
}

/** `undefined` = carregando; `null` = não existe (ex.: conta removida). */
export function useProfile(client: NoxClient, uid: string | null | undefined) {
  return useKeyed(stores(client).profileStore, uid);
}

export function useProfiles(client: NoxClient, uids: readonly string[]) {
  return useKeyedMany(stores(client).profileStore, uids);
}

export function usePresence(client: NoxClient, uid: string | null | undefined) {
  return useKeyed(stores(client).presenceStore, uid);
}

export function usePresences(client: NoxClient, uids: readonly string[]) {
  return useKeyedMany(stores(client).presenceStore, uids);
}

/* ───────────── mensagens ───────────── */

export interface OutboxEntry {
  id: string;
  text: string;
  replyTo: MessageReply | null;
  status: 'sending' | 'failed';
  error?: string;
  createdAt: number;
}

export interface MessagesState {
  messages: MessageView[];
  /** Envios que falharam (com opção de reenviar) e ainda não aparecem no servidor. */
  failed: OutboxEntry[];
  loading: boolean;
  loadingOlder: boolean;
  hasOlder: boolean;
  error: Error | null;
  loadOlder: () => Promise<void>;
  send: (text: string, replyTo?: MessageReply | null) => Promise<boolean>;
  retry: (id: string) => Promise<void>;
  discard: (id: string) => void;
}

/**
 * Histórico paginado: uma janela ao vivo com as mensagens recentes e páginas
 * estáticas mais antigas carregadas sob demanda. Nunca carrega o histórico inteiro.
 */
export function useMessages(client: NoxClient, scope: MessageScope | null): MessagesState {
  const key = scope ? scopeKey(scope) : null;
  const [live, setLive] = useState<MessageView[]>([]);
  const [older, setOlder] = useState<MessageView[]>([]);
  const [outbox, setOutbox] = useState<Record<string, OutboxEntry>>({});
  const [loading, setLoading] = useState(Boolean(scope));
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const liveCursor = useRef<DocumentSnapshot | null>(null);
  const olderCursor = useRef<DocumentSnapshot | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const limiter = useMemo(() => new BurstLimiter(LIMITS.message.burst.count, LIMITS.message.burst.windowMs), [key]);

  useEffect(() => {
    setLive([]);
    setOlder([]);
    setOutbox({});
    setError(null);
    olderCursor.current = null;
    liveCursor.current = null;
    if (!scope) {
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeRecentMessages(
      client,
      scope,
      (page) => {
        setLive(page.messages);
        liveCursor.current = page.cursor;
        setHasOlder((prev) => (olderCursor.current ? prev : page.cursor !== null));
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key]);

  const loadOlder = useCallback(async () => {
    const cursor = olderCursor.current ?? liveCursor.current;
    if (!scope || !cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await fetchOlderMessages(client, scope, cursor);
      olderCursor.current = page.cursor;
      setHasOlder(page.cursor !== null);
      setOlder((prev) => [...page.messages, ...prev]);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoadingOlder(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key, loadingOlder]);

  const deliver = useCallback(
    async (entry: OutboxEntry) => {
      if (!scope) return;
      setOutbox((o) => ({ ...o, [entry.id]: { ...entry, status: 'sending', error: undefined } }));
      try {
        await sendMessage(client, scope, { id: entry.id, text: entry.text, replyTo: entry.replyTo });
        setOutbox(({ [entry.id]: _, ...rest }) => rest);
      } catch (err) {
        setOutbox((o) => ({ ...o, [entry.id]: { ...entry, status: 'failed', error: (err as Error).message } }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, key],
  );

  const send = useCallback(
    async (text: string, replyTo: MessageReply | null = null) => {
      if (!scope || !text.trim()) return false;
      if (!limiter.tryAcquire()) return false;
      const entry: OutboxEntry = { id: newMessageId(client, scope), text, replyTo, status: 'sending', createdAt: Date.now() };
      void deliver(entry);
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, key, deliver, limiter],
  );

  const retry = useCallback(
    async (id: string) => {
      const entry = outbox[id];
      if (entry) await deliver(entry);
    },
    [outbox, deliver],
  );

  const discard = useCallback((id: string) => setOutbox(({ [id]: _, ...rest }) => rest), []);

  const messages = useMemo(() => {
    const seen = new Set<string>();
    const out: MessageView[] = [];
    for (const m of [...older, ...live]) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
    return out;
  }, [older, live]);

  const failed = useMemo(() => {
    const ids = new Set(messages.map((m) => m.id));
    return Object.values(outbox).filter((e) => e.status === 'failed' && !ids.has(e.id));
  }, [outbox, messages]);

  return { messages, failed, loading, loadingOlder, hasOlder, error, loadOlder, send, retry, discard };
}
