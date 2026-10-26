import {
  ConnectionQuality,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  type AudioCaptureOptions,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RoomOptions,
} from 'livekit-client';
import { sameVoiceRoom, type VoiceRoomRef } from '@nox/shared';
import {
  DEFAULT_VOICE_SETTINGS,
  type ConnectionQualityLabel,
  type VoiceConnectionState,
  type VoiceGrant,
  type VoiceParticipant,
  type VoiceSettings,
  type VoiceSnapshot,
} from './types';

export interface VoicePlatform {
  /** Mobile: inicia a sessão de áudio nativa (AudioSession.startAudioSession). */
  beforeConnect?(): Promise<void>;
  afterDisconnect?(): Promise<void>;
  /** Web/Electron: anexa faixas de áudio remotas a elementos <audio>. No mobile o áudio toca nativamente. */
  attachAudio?(track: RemoteTrack): void;
  detachAudio?(track: RemoteTrack): void;
}

export interface VoiceSessionOptions {
  fetchGrant: (ref: VoiceRoomRef) => Promise<VoiceGrant>;
  platform?: VoicePlatform;
  settings?: Partial<VoiceSettings>;
  /** Injetável para testes. */
  createRoom?: (options: RoomOptions) => Room;
  /** Atrasos entre tentativas de reentrada após quedas não iniciadas pelo usuário. */
  rejoinBackoffMs?: readonly number[];
}

const QUALITY: Record<string, ConnectionQualityLabel> = {
  [ConnectionQuality.Excellent]: 'excellent',
  [ConnectionQuality.Good]: 'good',
  [ConnectionQuality.Poor]: 'poor',
  [ConnectionQuality.Lost]: 'lost',
};

/** Quedas definitivas: não adianta tentar de novo automaticamente. */
const TERMINAL: Partial<Record<DisconnectReason, string>> = {
  [DisconnectReason.CLIENT_INITIATED]: '',
  [DisconnectReason.DUPLICATE_IDENTITY]: 'Você entrou nesta sala por outro dispositivo.',
  [DisconnectReason.PARTICIPANT_REMOVED]: 'Você foi removido da sala.',
  [DisconnectReason.ROOM_DELETED]: 'A sala foi encerrada.',
  [DisconnectReason.ROOM_CLOSED]: 'A sala foi encerrada.',
};

export function friendlyMediaError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Permissão de microfone negada. Libere o acesso nas configurações do sistema.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'Nenhum microfone encontrado.';
  if (name === 'NotReadableError') return 'O microfone está em uso por outro aplicativo.';
  if (name === 'OverconstrainedError') return 'O dispositivo selecionado não está disponível.';
  const message = (err as Error)?.message;
  return message ? `Falha de mídia: ${message}` : 'Falha ao acessar o microfone.';
}

/**
 * Sessão de voz do NOX sobre LiveKit. Uma instância por aplicativo: a chamada
 * sobrevive à navegação entre telas e só termina com `leave()`.
 */
export class VoiceSession {
  private room: Room | null = null;
  private attempt = 0;
  private wantConnected = false;
  private rejoinTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly volumes = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private readonly createRoom: (o: RoomOptions) => Room;
  private readonly backoff: readonly number[];
  private micBeforeDeafen = true;
  private snapshot: VoiceSnapshot;

  constructor(private readonly opts: VoiceSessionOptions) {
    this.createRoom = opts.createRoom ?? ((o) => new Room(o));
    this.backoff = opts.rejoinBackoffMs ?? [1000, 2000, 4000, 8000, 15000];
    this.snapshot = {
      state: 'idle',
      ref: null,
      participants: [],
      micEnabled: false,
      muted: false,
      deafened: false,
      pttActive: false,
      settings: { ...DEFAULT_VOICE_SETTINGS, ...opts.settings },
      audioBlocked: false,
      reconnectAttempt: 0,
      error: null,
      connectedAt: null,
    };
  }

  /* ───────────── assinatura (compatível com useSyncExternalStore) ───────────── */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): VoiceSnapshot => this.snapshot;

  private update(patch: Partial<VoiceSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of [...this.listeners]) l();
  }

  private refreshParticipants() {
    const room = this.room;
    if (!room) return this.update({ participants: [], micEnabled: false });
    const local = room.localParticipant;
    const list: VoiceParticipant[] = [this.view(local, true), ...[...room.remoteParticipants.values()].map((p) => this.view(p, false))];
    this.update({ participants: list, micEnabled: local.isMicrophoneEnabled });
  }

  private view(p: Participant, isLocal: boolean): VoiceParticipant {
    const mic = p.getTrackPublication(Track.Source.Microphone);
    return {
      identity: p.identity,
      name: p.name || p.identity,
      isLocal,
      isSpeaking: p.isSpeaking,
      micEnabled: Boolean(mic && !mic.isMuted),
      cameraEnabled: p.isCameraEnabled,
      screenSharing: p.isScreenShareEnabled,
      quality: QUALITY[p.connectionQuality] ?? 'unknown',
      volume: this.volumes.get(p.identity) ?? 1,
    };
  }

  /* ───────────── conexão ───────────── */

  private captureOptions(): AudioCaptureOptions {
    const s = this.snapshot.settings;
    return {
      echoCancellation: s.echoCancellation,
      noiseSuppression: s.noiseSuppression,
      autoGainControl: s.autoGainControl,
      ...(s.inputDeviceId ? { deviceId: s.inputDeviceId } : {}),
    };
  }

  private roomOptions(): RoomOptions {
    return {
      adaptiveStream: true,
      dynacast: true,
      disconnectOnPageLeave: true,
      audioCaptureDefaults: this.captureOptions(),
      ...(this.snapshot.settings.outputDeviceId ? { audioOutput: { deviceId: this.snapshot.settings.outputDeviceId } } : {}),
      publishDefaults: {
        // Voz: 64 kbps Opus, DTX economiza banda em silêncio, RED protege contra perda de pacotes.
        audioPreset: { maxBitrate: 64_000 },
        dtx: true,
        red: true,
      },
    };
  }

  /** Mic deve transmitir agora? Depende de mudo, ensurdecido e modo de entrada. */
  private shouldTransmit(): boolean {
    const s = this.snapshot;
    if (s.muted || s.deafened) return false;
    return s.settings.mode === 'voice-activity' || s.pttActive;
  }

  async join(ref: VoiceRoomRef): Promise<void> {
    const active: VoiceConnectionState[] = ['connecting', 'connected', 'reconnecting'];
    if (sameVoiceRoom(this.snapshot.ref, ref) && active.includes(this.snapshot.state)) return;
    if (this.room || this.rejoinTimer) await this.teardown();
    this.wantConnected = true;
    this.update({ ref, state: 'connecting', error: null, reconnectAttempt: 0, participants: [] });
    await this.connect(ref);
  }

  private async connect(ref: VoiceRoomRef): Promise<void> {
    const attempt = ++this.attempt;
    try {
      await this.opts.platform?.beforeConnect?.();
      const grant = await this.opts.fetchGrant(ref);
      if (attempt !== this.attempt) return;

      const room = this.createRoom(this.roomOptions());
      this.room = room;
      this.bind(room);
      await room.connect(grant.serverUrl, grant.token, { autoSubscribe: true });
      if (attempt !== this.attempt) {
        await room.disconnect(true);
        return;
      }
      this.update({ state: 'connected', reconnectAttempt: 0, connectedAt: Date.now(), audioBlocked: !room.canPlaybackAudio });
      this.applyVolumes();
      this.refreshParticipants();
      // Só captura o microfone quando for transmitir: entrar mudo não abre o dispositivo.
      if (this.shouldTransmit()) await this.syncMic();
    } catch (err) {
      if (attempt !== this.attempt) return;
      const room = this.room;
      this.room = null;
      room?.removeAllListeners();
      await room?.disconnect(true).catch(() => undefined);
      if (this.snapshot.reconnectAttempt > 0) return this.scheduleRejoin();
      this.wantConnected = false;
      this.update({ state: 'failed', error: (err as Error)?.message || 'Não foi possível conectar à sala de voz.', participants: [] });
    }
  }

  private bind(room: Room) {
    const refresh = () => this.refreshParticipants();
    room
      .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        this.applyVolume(p);
        refresh();
      })
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.ActiveSpeakersChanged, refresh)
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.LocalTrackPublished, refresh)
      .on(RoomEvent.LocalTrackUnpublished, refresh)
      .on(RoomEvent.ConnectionQualityChanged, refresh)
      .on(RoomEvent.ParticipantNameChanged, refresh)
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) {
          this.opts.platform?.attachAudio?.(track);
          this.applyVolume(participant);
        }
        refresh();
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) this.opts.platform?.detachAudio?.(track);
        refresh();
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => this.update({ audioBlocked: !room.canPlaybackAudio }))
      .on(RoomEvent.MediaDevicesError, (err: Error) => this.update({ error: friendlyMediaError(err) }))
      .on(RoomEvent.Reconnecting, () => this.update({ state: 'reconnecting' }))
      .on(RoomEvent.SignalReconnecting, () => this.update({ state: 'reconnecting' }))
      .on(RoomEvent.Reconnected, () => {
        this.update({ state: 'connected', error: null, reconnectAttempt: 0 });
        refresh();
      })
      .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => this.onDisconnected(room, reason));
  }

  private onDisconnected(room: Room, reason?: DisconnectReason) {
    if (room !== this.room) return;
    room.removeAllListeners();
    this.room = null;
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.audioTrackPublications.values()) if (pub.track) this.opts.platform?.detachAudio?.(pub.track);
    }
    const terminal = reason !== undefined ? TERMINAL[reason] : undefined;
    if (!this.wantConnected || terminal !== undefined) {
      this.wantConnected = false;
      void this.opts.platform?.afterDisconnect?.();
      this.update({ state: 'disconnected', error: terminal || null, participants: [], micEnabled: false, connectedAt: null });
      return;
    }
    // Queda inesperada (rede, servidor): o SDK já esgotou o resume/ICE restart; reentramos com token novo.
    this.scheduleRejoin();
  }

  private scheduleRejoin() {
    const n = this.snapshot.reconnectAttempt;
    const ref = this.snapshot.ref;
    if (!this.wantConnected || !ref || n >= this.backoff.length) {
      this.wantConnected = false;
      void this.opts.platform?.afterDisconnect?.();
      this.update({ state: 'failed', error: 'Conexão de voz perdida. Tente entrar novamente.', participants: [], micEnabled: false });
      return;
    }
    this.update({ state: 'reconnecting', reconnectAttempt: n + 1, participants: [] });
    this.rejoinTimer = setTimeout(() => {
      this.rejoinTimer = null;
      if (this.wantConnected) void this.connect(ref);
    }, this.backoff[n]);
  }

  /** Sai da sala e libera microfone, câmera e elementos de áudio. */
  async leave(): Promise<void> {
    await this.teardown();
    this.update({
      state: 'idle',
      ref: null,
      participants: [],
      micEnabled: false,
      pttActive: false,
      reconnectAttempt: 0,
      error: null,
      connectedAt: null,
      audioBlocked: false,
    });
  }

  private async teardown() {
    this.wantConnected = false;
    this.attempt++;
    if (this.rejoinTimer) clearTimeout(this.rejoinTimer);
    this.rejoinTimer = null;
    const room = this.room;
    this.room = null;
    if (room) {
      room.removeAllListeners();
      for (const p of room.remoteParticipants.values()) {
        for (const pub of p.audioTrackPublications.values()) if (pub.track) this.opts.platform?.detachAudio?.(pub.track);
      }
      await room.disconnect(true).catch(() => undefined);
    }
    await this.opts.platform?.afterDisconnect?.().catch(() => undefined);
  }

  /* ───────────── controles ───────────── */

  private async syncMic() {
    const room = this.room;
    if (!room || this.snapshot.state !== 'connected') return;
    const enable = this.shouldTransmit();
    if (room.localParticipant.isMicrophoneEnabled === enable) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(enable, this.captureOptions());
      this.update({ error: null });
    } catch (err) {
      this.update({ error: friendlyMediaError(err), muted: true });
    }
    this.refreshParticipants();
  }

  async setMuted(muted: boolean) {
    if (!muted && this.snapshot.deafened) this.setDeafenedState(false);
    this.update({ muted });
    await this.syncMic();
  }

  toggleMute = () => this.setMuted(!this.snapshot.muted);

  private setDeafenedState(deafened: boolean) {
    this.update({ deafened });
    this.applyVolumes();
  }

  /** Ensurdecer silencia todos e também o próprio microfone; ao voltar, restaura o estado anterior. */
  async setDeafened(deafened: boolean) {
    if (deafened === this.snapshot.deafened) return;
    if (deafened) {
      this.micBeforeDeafen = !this.snapshot.muted;
      this.setDeafenedState(true);
      this.update({ muted: true });
    } else {
      this.setDeafenedState(false);
      this.update({ muted: !this.micBeforeDeafen });
    }
    await this.syncMic();
  }

  toggleDeafen = () => this.setDeafened(!this.snapshot.deafened);

  async pushToTalk(active: boolean) {
    if (this.snapshot.settings.mode !== 'push-to-talk' || active === this.snapshot.pttActive) return;
    this.update({ pttActive: active });
    await this.syncMic();
  }

  private applyVolume(p: RemoteParticipant) {
    p.setVolume(this.snapshot.deafened ? 0 : (this.volumes.get(p.identity) ?? 1));
  }

  private applyVolumes() {
    if (!this.room) return;
    for (const p of this.room.remoteParticipants.values()) this.applyVolume(p);
  }

  setParticipantVolume(identity: string, volume: number) {
    this.volumes.set(identity, Math.min(1, Math.max(0, volume)));
    const p = this.room?.remoteParticipants.get(identity);
    if (p) this.applyVolume(p);
    this.refreshParticipants();
  }

  async updateSettings(patch: Partial<VoiceSettings>) {
    const prev = this.snapshot.settings;
    const next = { ...prev, ...patch };
    this.update({ settings: next, ...(patch.mode && patch.mode !== prev.mode ? { pttActive: false } : {}) });
    const room = this.room;
    if (!room) return;
    try {
      if (patch.inputDeviceId !== undefined && patch.inputDeviceId !== prev.inputDeviceId && next.inputDeviceId) {
        await room.switchActiveDevice('audioinput', next.inputDeviceId);
      }
      if (patch.outputDeviceId !== undefined && patch.outputDeviceId !== prev.outputDeviceId && next.outputDeviceId) {
        await room.switchActiveDevice('audiooutput', next.outputDeviceId);
      }
      const processingChanged =
        next.echoCancellation !== prev.echoCancellation ||
        next.noiseSuppression !== prev.noiseSuppression ||
        next.autoGainControl !== prev.autoGainControl;
      const mic = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack;
      if (processingChanged && mic) await mic.restartTrack(this.captureOptions());
      await this.syncMic();
    } catch (err) {
      this.update({ error: friendlyMediaError(err) });
    }
  }

  /** Destrava a reprodução quando o navegador bloqueou autoplay (exige gesto do usuário). */
  async resumeAudio() {
    await this.room?.startAudio();
    this.update({ audioBlocked: !(this.room?.canPlaybackAudio ?? true) });
  }

  /** Nível de áudio instantâneo (0–1) para medidores. Consulte por requestAnimationFrame apenas enquanto visível. */
  getAudioLevel(identity: string): number {
    const room = this.room;
    if (!room) return 0;
    if (room.localParticipant.identity === identity) return room.localParticipant.audioLevel;
    return room.remoteParticipants.get(identity)?.audioLevel ?? 0;
  }

  /** Acesso ao Room para recursos avançados (vídeo, tela). */
  get currentRoom(): Room | null {
    return this.room;
  }
}

export async function listAudioDevices(kind: 'audioinput' | 'audiooutput', requestPermissions = false): Promise<MediaDeviceInfo[]> {
  return Room.getLocalDevices(kind, requestPermissions);
}
