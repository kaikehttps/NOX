import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';
import type { PresenceStatus, UserProfile, UserSettings } from '@nox/shared';
import { PresenceController, saveSettings } from '@nox/firebase';
import { client, voice } from './nox';

/* ───────────── sessão ───────────── */

export interface Session {
  user: User;
  uid: string;
  profile: UserProfile;
  settings: UserSettings;
  updateSettings: (patch: Partial<UserSettings>) => void;
  status: PresenceStatus;
  setStatus: (s: PresenceStatus) => void;
}

const SessionCtx = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionCtx);
  if (!s) throw new Error('useSession fora do SessionProvider');
  return s;
}

const STATUS_KEY = 'nox.presence.status';

export function SessionProvider(props: { user: User; profile: UserProfile; settings: UserSettings; children: ReactNode }) {
  const { user, profile, settings } = props;
  const [status, setStatusState] = useState<PresenceStatus>(() => (localStorage.getItem(STATUS_KEY) as PresenceStatus) || 'online');
  const presence = useRef<PresenceController | null>(null);

  useEffect(() => {
    const p = new PresenceController(client(), user.uid);
    presence.current = p;
    p.start(status);
    // Ociosidade do sistema → "ausente", sem sobrescrever "ocupado"/"invisível".
    const off = window.nox?.onIdleChange((idle) => {
      const chosen = (localStorage.getItem(STATUS_KEY) as PresenceStatus) || 'online';
      if (chosen !== 'online') return;
      void p.setStatus(idle ? 'idle' : 'online');
    });
    return () => {
      off?.();
      void p.stop();
      presence.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid]);

  const setStatus = useCallback((s: PresenceStatus) => {
    localStorage.setItem(STATUS_KEY, s);
    setStatusState(s);
    void presence.current?.setStatus(s);
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<UserSettings>) => {
      void saveSettings(client(), user.uid, patch);
    },
    [user.uid],
  );

  const value = useMemo<Session>(
    () => ({ user, uid: user.uid, profile, settings, updateSettings, status, setStatus }),
    [user, profile, settings, updateSettings, status, setStatus],
  );
  return <SessionCtx.Provider value={value}>{props.children}</SessionCtx.Provider>;
}

/* ───────────── navegação ───────────── */

export type HomeTab = 'online' | 'all' | 'pending' | 'blocked';

export type View =
  | { kind: 'home'; tab: HomeTab }
  | { kind: 'conversation'; conversationId: string }
  | { kind: 'community'; communityId: string; channelId: string | null };

interface Nav {
  view: View;
  go: (v: View) => void;
}

const NavCtx = createContext<Nav | null>(null);

export function useNav(): Nav {
  const n = useContext(NavCtx);
  if (!n) throw new Error('useNav fora do NavProvider');
  return n;
}

const LAST_CHANNEL_KEY = 'nox.lastChannel';

export function lastChannelFor(communityId: string): string | null {
  try {
    return (JSON.parse(localStorage.getItem(LAST_CHANNEL_KEY) ?? '{}') as Record<string, string>)[communityId] ?? null;
  } catch {
    return null;
  }
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>({ kind: 'home', tab: 'online' });
  const go = useCallback((v: View) => {
    if (v.kind === 'community' && v.channelId) {
      try {
        const map = JSON.parse(localStorage.getItem(LAST_CHANNEL_KEY) ?? '{}') as Record<string, string>;
        map[v.communityId] = v.channelId;
        localStorage.setItem(LAST_CHANNEL_KEY, JSON.stringify(map));
      } catch {
        /* ignora */
      }
    }
    setView(v);
  }, []);
  const value = useMemo(() => ({ view, go }), [view, go]);
  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

/* ───────────── interface: toasts, modais, menus ───────────── */

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
  onSelect: () => void;
}

export type MenuEntry = MenuItem | 'separator' | { reactions: (emoji: string) => void };

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

interface Ui {
  toast: (text: string, kind?: 'info' | 'error') => void;
  openModal: (render: (close: () => void) => ReactNode) => void;
  closeModal: () => void;
  openMenu: (at: { x: number; y: number }, entries: MenuEntry[], onClose?: () => void) => void;
}

const UiCtx = createContext<Ui | null>(null);

export function useUi(): Ui {
  const u = useContext(UiCtx);
  if (!u) throw new Error('useUi fora do UiProvider');
  return u;
}

interface UiState {
  toasts: Toast[];
  modal: ((close: () => void) => ReactNode) | null;
  menu: { x: number; y: number; entries: MenuEntry[]; onClose?: () => void } | null;
}

export function UiProvider({ children, renderLayer }: { children: ReactNode; renderLayer: (s: UiState, api: Ui & { dismissMenu: () => void }) => ReactNode }) {
  const [state, setState] = useState<UiState>({ toasts: [], modal: null, menu: null });
  const seq = useRef(0);

  const toast = useCallback((text: string, kind: 'info' | 'error' = 'info') => {
    const id = ++seq.current;
    setState((s) => ({ ...s, toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
    setTimeout(() => setState((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 6000 : 3500);
  }, []);
  const openModal = useCallback((render: UiState['modal']) => setState((s) => ({ ...s, modal: render, menu: null })), []);
  const closeModal = useCallback(() => setState((s) => ({ ...s, modal: null })), []);
  const openMenu = useCallback(
    (at: { x: number; y: number }, entries: MenuEntry[], onClose?: () => void) =>
      setState((s) => {
        s.menu?.onClose?.();
        return { ...s, menu: { ...at, entries, ...(onClose ? { onClose } : {}) } };
      }),
    [],
  );
  const dismissMenu = useCallback(
    () =>
      setState((s) => {
        s.menu?.onClose?.();
        return { ...s, menu: null };
      }),
    [],
  );

  const api = useMemo(() => ({ toast, openModal, closeModal, openMenu }), [toast, openModal, closeModal, openMenu]);
  return (
    <UiCtx.Provider value={api}>
      {children}
      {renderLayer(state, { ...api, dismissMenu })}
    </UiCtx.Provider>
  );
}

/* ───────────── voz ───────────── */

export function useVoice() {
  return useSyncExternalStore(voice.subscribe, voice.getSnapshot);
}

/** Mensagem legível para qualquer erro vindo da API ou do Firebase. */
export function errorText(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    const code = (err as { code?: string }).code;
    if (code === 'permission-denied') return 'Você não tem permissão para isso.';
    if (code === 'unavailable') return 'Sem conexão. Tentaremos de novo automaticamente.';
    return err.message;
  }
  return 'Algo deu errado.';
}
