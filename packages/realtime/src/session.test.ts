import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DisconnectReason, RoomEvent, type Room } from 'livekit-client';
import { VoiceSession } from './session';

class FakeLocal {
  identity = 'me';
  name = 'Eu';
  isSpeaking = false;
  isCameraEnabled = false;
  isScreenShareEnabled = false;
  connectionQuality = 'excellent';
  audioLevel = 0;
  isMicrophoneEnabled = false;
  micCalls: boolean[] = [];
  getTrackPublication() {
    return this.isMicrophoneEnabled ? { isMuted: false, audioTrack: { restartTrack: vi.fn() } } : undefined;
  }
  async setMicrophoneEnabled(on: boolean) {
    this.micCalls.push(on);
    this.isMicrophoneEnabled = on;
  }
}

class FakeRemote {
  volume = 1;
  isSpeaking = false;
  isCameraEnabled = false;
  isScreenShareEnabled = false;
  connectionQuality = 'good';
  audioLevel = 0;
  audioTrackPublications = new Map();
  constructor(
    public identity: string,
    public name = identity,
  ) {}
  getTrackPublication() {
    return { isMuted: false };
  }
  setVolume(v: number) {
    this.volume = v;
  }
}

class FakeRoom extends EventEmitter {
  static instances: FakeRoom[] = [];
  localParticipant = new FakeLocal();
  remoteParticipants = new Map<string, FakeRemote>();
  canPlaybackAudio = true;
  connected = false;
  disconnectCalls = 0;
  failConnect = false;
  constructor() {
    super();
    FakeRoom.instances.push(this);
  }
  override on(event: string, fn: (...args: any[]) => void) {
    super.on(event, fn);
    return this;
  }
  async connect() {
    if (this.failConnect) throw new Error('falhou');
    this.connected = true;
  }
  async disconnect() {
    this.disconnectCalls++;
    this.connected = false;
  }
  async switchActiveDevice() {
    return true;
  }
  async startAudio() {}
  addRemote(id: string) {
    const p = new FakeRemote(id);
    this.remoteParticipants.set(id, p);
    this.emit(RoomEvent.ParticipantConnected, p);
    return p;
  }
}

const channel = { kind: 'channel' as const, communityId: 'c1', channelId: 'v1' };
const other = { kind: 'channel' as const, communityId: 'c1', channelId: 'v2' };

function makeSession(opts: { backoff?: number[]; failFirst?: boolean } = {}) {
  FakeRoom.instances = [];
  const fetchGrant = vi.fn(async () => ({ serverUrl: 'wss://x', token: 't' }));
  const platform = { beforeConnect: vi.fn(async () => {}), afterDisconnect: vi.fn(async () => {}) };
  const session = new VoiceSession({
    fetchGrant,
    platform,
    rejoinBackoffMs: opts.backoff ?? [10, 10],
    createRoom: () => new FakeRoom() as unknown as Room,
  });
  return { session, fetchGrant, platform, room: () => FakeRoom.instances.at(-1)! };
}

afterEach(() => vi.useRealTimers());

describe('VoiceSession', () => {
  it('entra, publica o microfone e lista participantes', async () => {
    const { session, room, platform } = makeSession();
    await session.join(channel);
    const s = session.getSnapshot();
    expect(s.state).toBe('connected');
    expect(platform.beforeConnect).toHaveBeenCalled();
    expect(room().localParticipant.micCalls).toEqual([true]);
    room().addRemote('ana');
    expect(session.getSnapshot().participants.map((p) => p.identity)).toEqual(['me', 'ana']);
  });

  it('não reconecta ao pedir a mesma sala e troca de sala liberando a anterior', async () => {
    const { session, fetchGrant } = makeSession();
    await session.join(channel);
    await session.join(channel);
    expect(fetchGrant).toHaveBeenCalledTimes(1);
    const first = FakeRoom.instances[0]!;
    await session.join(other);
    expect(first.disconnectCalls).toBe(1);
    expect(fetchGrant).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot().ref).toEqual(other);
  });

  it('sair desconecta, remove listeners e libera a sessão de áudio', async () => {
    const { session, room, platform } = makeSession();
    await session.join(channel);
    const r = room();
    await session.leave();
    expect(r.disconnectCalls).toBe(1);
    expect(r.listenerCount(RoomEvent.Disconnected)).toBe(0);
    expect(platform.afterDisconnect).toHaveBeenCalled();
    expect(session.getSnapshot().state).toBe('idle');
    expect(session.getSnapshot().participants).toEqual([]);
  });

  it('ensurdecer silencia todos e o microfone; desfazer restaura', async () => {
    const { session, room } = makeSession();
    await session.join(channel);
    const ana = room().addRemote('ana');
    await session.setDeafened(true);
    expect(ana.volume).toBe(0);
    expect(room().localParticipant.isMicrophoneEnabled).toBe(false);
    // quem entra durante o ensurdecimento também fica mudo
    const bia = room().addRemote('bia');
    expect(bia.volume).toBe(0);
    await session.setDeafened(false);
    expect(ana.volume).toBe(1);
    expect(room().localParticipant.isMicrophoneEnabled).toBe(true);
  });

  it('ensurdecer quando já estava mudo mantém mudo ao voltar', async () => {
    const { session, room } = makeSession();
    await session.join(channel);
    await session.setMuted(true);
    await session.setDeafened(true);
    await session.setDeafened(false);
    expect(session.getSnapshot().muted).toBe(true);
    expect(room().localParticipant.isMicrophoneEnabled).toBe(false);
  });

  it('volume individual é preservado e respeitado', async () => {
    const { session, room } = makeSession();
    await session.join(channel);
    const ana = room().addRemote('ana');
    session.setParticipantVolume('ana', 0.4);
    expect(ana.volume).toBe(0.4);
    session.setParticipantVolume('ana', 7);
    expect(ana.volume).toBe(1);
  });

  it('push-to-talk só transmite enquanto pressionado', async () => {
    const { session, room } = makeSession();
    await session.updateSettings({ mode: 'push-to-talk' });
    await session.join(channel);
    expect(room().localParticipant.isMicrophoneEnabled).toBe(false);
    await session.pushToTalk(true);
    expect(room().localParticipant.isMicrophoneEnabled).toBe(true);
    await session.pushToTalk(false);
    expect(room().localParticipant.isMicrophoneEnabled).toBe(false);
  });

  it('queda inesperada reentra com token novo', async () => {
    vi.useFakeTimers();
    const { session, fetchGrant } = makeSession();
    await session.join(channel);
    FakeRoom.instances[0]!.emit(RoomEvent.Disconnected, DisconnectReason.SIGNAL_CLOSE);
    expect(session.getSnapshot().state).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(20);
    expect(fetchGrant).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot().state).toBe('connected');
    expect(session.getSnapshot().reconnectAttempt).toBe(0);
  });

  it('desiste após esgotar tentativas', async () => {
    vi.useFakeTimers();
    const { session } = makeSession({ backoff: [5] });
    await session.join(channel);
    const orig = FakeRoom.prototype.connect;
    FakeRoom.prototype.connect = async function () {
      throw new Error('rede');
    };
    FakeRoom.instances[0]!.emit(RoomEvent.Disconnected, DisconnectReason.SIGNAL_CLOSE);
    await vi.advanceTimersByTimeAsync(50);
    FakeRoom.prototype.connect = orig;
    expect(session.getSnapshot().state).toBe('failed');
    expect(session.getSnapshot().error).toMatch(/perdida/);
  });

  it('não tenta reentrar quando a sessão foi aberta em outro dispositivo', async () => {
    const { session, fetchGrant } = makeSession();
    await session.join(channel);
    FakeRoom.instances[0]!.emit(RoomEvent.Disconnected, DisconnectReason.DUPLICATE_IDENTITY);
    expect(session.getSnapshot().state).toBe('disconnected');
    expect(session.getSnapshot().error).toMatch(/outro dispositivo/);
    expect(fetchGrant).toHaveBeenCalledTimes(1);
  });

  it('falha de autorização na primeira entrada vira estado failed', async () => {
    const { session, fetchGrant } = makeSession();
    fetchGrant.mockRejectedValueOnce(new Error('Você não tem permissão para isso.'));
    await session.join(channel);
    expect(session.getSnapshot().state).toBe('failed');
    expect(session.getSnapshot().error).toBe('Você não tem permissão para isso.');
  });
});
