import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from 'firebase/auth';
import { PresenceController, signOut as fbSignOut, subscribeMemberships } from '@nox/firebase';
import { resetSharedStores, useAuthUser, useProfile, useSubscription } from '@nox/firebase/react';
import type { Membership, PresenceStatus, UserProfile } from '@nox/shared';
import { googleSignOut } from '../lib/google';
import { useNox } from './NoxProvider';

type ChosenStatus = Exclude<PresenceStatus, 'offline'>;

interface Session {
  user: User | null;
  authLoading: boolean;
  /** `undefined` = carregando; `null` = conta sem perfil (onboarding). */
  profile: UserProfile | null | undefined;
  memberships: Membership[] | undefined;
  status: ChosenStatus;
  setStatus: (s: ChosenStatus) => Promise<void>;
  /** Executado antes de sair (ex.: encerrar a chamada de voz). */
  registerSignOutHook: (fn: () => Promise<void> | void) => () => void;
  signOut: () => Promise<void>;
  /** Limpa o estado local após a conta ter sido excluída no servidor. */
  finishAccountDeletion: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

const STATUS_KEY = (uid: string) => `nox:presence:${uid}`;
const CHOSEN: ChosenStatus[] = ['online', 'idle', 'dnd', 'invisible'];

export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useNox();
  const { user, loading: authLoading } = useAuthUser(client);
  const uid = user?.uid ?? null;
  const profile = useProfile(client, uid);
  const hasProfile = Boolean(profile);

  const memberships = useSubscription<Membership[]>(
    uid && hasProfile ? (emit) => subscribeMemberships(client, uid, emit) : null,
    [client, uid, hasProfile],
  ).data;

  /* ───────────── presença ───────────── */

  const [status, setStatusState] = useState<ChosenStatus>('online');
  const presence = useRef<PresenceController | null>(null);
  const chosen = useRef<ChosenStatus>('online');

  useEffect(() => {
    if (!uid || !hasProfile) return;
    let cancelled = false;
    const controller = new PresenceController(client, uid);
    presence.current = controller;
    void AsyncStorage.getItem(STATUS_KEY(uid))
      .catch(() => null)
      .then((saved) => {
        if (cancelled) return;
        const initial = CHOSEN.includes(saved as ChosenStatus) ? (saved as ChosenStatus) : 'online';
        chosen.current = initial;
        setStatusState(initial);
        const startAs = AppState.currentState === 'background' && initial === 'online' ? 'idle' : initial;
        controller.start(startAs);
      });

    // Em segundo plano: "ausente" (se estava online). Ao voltar: restaura a escolha do usuário.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && chosen.current === 'online') void controller.setStatus('idle').catch(() => undefined);
      if (state === 'active') void controller.setStatus(chosen.current).catch(() => undefined);
    });

    return () => {
      cancelled = true;
      sub.remove();
      if (presence.current === controller) presence.current = null;
      void controller.stop();
    };
  }, [client, uid, hasProfile]);

  const setStatus = useCallback(
    async (s: ChosenStatus) => {
      chosen.current = s;
      setStatusState(s);
      if (uid) void AsyncStorage.setItem(STATUS_KEY(uid), s).catch(() => undefined);
      await presence.current?.setStatus(s);
    },
    [uid],
  );

  /* ───────────── saída ───────────── */

  const hooks = useRef(new Set<() => Promise<void> | void>());
  const registerSignOutHook = useCallback((fn: () => Promise<void> | void) => {
    hooks.current.add(fn);
    return () => {
      hooks.current.delete(fn);
    };
  }, []);

  const teardown = useCallback(async (publishOffline: boolean) => {
    for (const fn of [...hooks.current]) await Promise.resolve(fn()).catch(() => undefined);
    const controller = presence.current;
    presence.current = null;
    if (publishOffline && controller) await controller.stop().catch(() => undefined);
    await googleSignOut();
  }, []);

  const signOut = useCallback(async () => {
    await teardown(true);
    await fbSignOut(client).catch(() => undefined);
    resetSharedStores();
  }, [client, teardown]);

  const finishAccountDeletion = useCallback(async () => {
    // A conta já não existe no servidor: não tenta publicar presença.
    await teardown(false);
    await fbSignOut(client).catch(() => undefined);
    resetSharedStores();
  }, [client, teardown]);

  const value = useMemo<Session>(
    () => ({ user, authLoading, profile, memberships, status, setStatus, registerSignOutHook, signOut, finishAccountDeletion }),
    [user, authLoading, profile, memberships, status, setStatus, registerSignOutHook, signOut, finishAccountDeletion],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession() fora do SessionProvider');
  return s;
}

let lastMe: { uid: string; profile: UserProfile } | null = null;

/**
 * Usuário autenticado com perfil (telas internas do app). Durante a transição de saída
 * as telas ainda montadas recebem o último valor conhecido, em vez de quebrar.
 */
export function useMe(): { uid: string; profile: UserProfile } {
  const { user, profile } = useSession();
  if (user && profile) {
    if (!lastMe || lastMe.uid !== user.uid || lastMe.profile !== profile) lastMe = { uid: user.uid, profile };
    return lastMe;
  }
  if (lastMe) return lastMe;
  throw new Error('useMe() requer sessão com perfil');
}
