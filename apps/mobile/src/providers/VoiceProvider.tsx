import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { AudioSession } from '@livekit/react-native';
import { VoiceSession, type VoicePlatform, type VoiceSnapshot } from '@nox/realtime';
import { sameVoiceRoom, type VoiceRoomRef } from '@nox/shared';
import { haptic } from '../lib/haptics';
import { useNox } from './NoxProvider';
import { useSession } from './SessionProvider';

/** Áudio nativo: a sessão de áudio do sistema abre antes de conectar e fecha ao sair. */
const mobilePlatform: VoicePlatform = {
  async beforeConnect() {
    await AudioSession.startAudioSession();
  },
  async afterDisconnect() {
    await AudioSession.stopAudioSession();
  },
};

export interface VoiceTarget {
  ref: VoiceRoomRef;
  /** Nome exibido na barra de chamada e na tela de voz. */
  label: string;
  /** Linha técnica (ex.: nome do espaço). */
  context?: string;
}

interface VoiceApi {
  session: VoiceSession;
  target: VoiceTarget | null;
  join: (target: VoiceTarget) => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
}

const VoiceContext = createContext<VoiceApi | null>(null);

/** Pede microfone (e Bluetooth no Android 12+). Retorna se o microfone foi liberado. */
async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true; // iOS pergunta na primeira captura (NSMicrophoneUsageDescription)
  const { RECORD_AUDIO, BLUETOOTH_CONNECT } = PermissionsAndroid.PERMISSIONS;
  const perms = typeof Platform.Version === 'number' && Platform.Version >= 31 ? [RECORD_AUDIO, BLUETOOTH_CONNECT] : [RECORD_AUDIO];
  try {
    const res = await PermissionsAndroid.requestMultiple(perms);
    return res[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * Uma única sessão de voz para o app inteiro: a chamada sobrevive à navegação e
 * só termina com "sair" (ou no logout).
 */
export function VoiceProvider({ children, onMicDenied }: { children: ReactNode; onMicDenied?: () => void }) {
  const client = useNox();
  const { registerSignOutHook } = useSession();
  const session = useMemo(
    () => new VoiceSession({ fetchGrant: (ref) => client.api.voiceToken(ref), platform: mobilePlatform }),
    [client],
  );
  const [target, setTarget] = useState<VoiceTarget | null>(null);

  useEffect(
    () =>
      registerSignOutHook(async () => {
        setTarget(null);
        await session.leave();
      }),
    [registerSignOutHook, session],
  );

  useEffect(() => () => void session.leave(), [session]);

  const join = useCallback(
    async (t: VoiceTarget) => {
      const snap = session.getSnapshot();
      const active = snap.state === 'connecting' || snap.state === 'connected' || snap.state === 'reconnecting';
      if (active && sameVoiceRoom(snap.ref, t.ref)) return;
      haptic.medium();
      setTarget(t);
      const granted = await ensureMicPermission();
      if (!granted) {
        // Sem microfone ainda dá para ouvir: entra mudo.
        await session.setMuted(true);
        onMicDenied?.();
      }
      await session.join(t.ref);
      if (session.getSnapshot().state === 'connected') haptic.success();
    },
    [session, onMicDenied],
  );

  const leave = useCallback(async () => {
    haptic.light();
    await session.leave();
    setTarget(null);
  }, [session]);

  const toggleMute = useCallback(async () => {
    haptic.light();
    await session.toggleMute();
  }, [session]);

  const toggleDeafen = useCallback(async () => {
    haptic.light();
    await session.toggleDeafen();
  }, [session]);

  const value = useMemo<VoiceApi>(() => ({ session, target, join, leave, toggleMute, toggleDeafen }), [session, target, join, leave, toggleMute, toggleDeafen]);
  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice(): VoiceApi {
  const v = useContext(VoiceContext);
  if (!v) throw new Error('useVoice() fora do VoiceProvider');
  return v;
}

/** Estado reativo da chamada (useSyncExternalStore sobre a VoiceSession). */
export function useVoiceSnapshot(): VoiceSnapshot {
  const { session } = useVoice();
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}

export const isVoiceLive = (s: VoiceSnapshot) => s.state === 'connecting' || s.state === 'connected' || s.state === 'reconnecting';

export const VOICE_STATE_LABEL: Record<VoiceSnapshot['state'], string> = {
  idle: 'desconectado',
  connecting: 'conectando…',
  connected: 'conectado',
  reconnecting: 'reconectando…',
  disconnected: 'desconectado',
  failed: 'falhou',
};
