import type { VoiceRoomRef } from '@nox/shared';

export type VoiceConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  /** Queda de rede: o SDK ou a sessão estão tentando restabelecer. */
  | 'reconnecting'
  | 'disconnected'
  | 'failed';

export type ConnectionQualityLabel = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

export interface VoiceParticipant {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  quality: ConnectionQualityLabel;
  /** Volume local aplicado a este participante (0–1). Apenas remotos. */
  volume: number;
}

export type VoiceInputMode = 'voice-activity' | 'push-to-talk';

export interface VoiceSettings {
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  mode: VoiceInputMode;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  inputDeviceId: null,
  outputDeviceId: null,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  mode: 'voice-activity',
};

export interface VoiceSnapshot {
  state: VoiceConnectionState;
  ref: VoiceRoomRef | null;
  participants: VoiceParticipant[];
  /** Microfone transmitindo agora. */
  micEnabled: boolean;
  /** Intenção do usuário de ficar mudo (independente de PTT). */
  muted: boolean;
  deafened: boolean;
  /** Tecla de push-to-talk pressionada. */
  pttActive: boolean;
  settings: VoiceSettings;
  /** O navegador bloqueou a reprodução automática; requer gesto do usuário. */
  audioBlocked: boolean;
  reconnectAttempt: number;
  error: string | null;
  connectedAt: number | null;
}

export interface VoiceGrant {
  serverUrl: string;
  token: string;
}
