import type { RemoteTrack } from 'livekit-client';
import type { VoicePlatform } from './session';

/**
 * Plataforma web/Electron: faixas de áudio remotas são reproduzidas por
 * elementos <audio> em um contêiner oculto. Removidos ao sair da sala.
 */
export function createWebVoicePlatform(): VoicePlatform {
  let container: HTMLDivElement | null = null;
  const ensure = () => {
    if (!container) {
      container = document.createElement('div');
      container.id = 'nox-voice-audio';
      container.style.display = 'none';
      document.body.appendChild(container);
    }
    return container;
  };
  return {
    attachAudio(track: RemoteTrack) {
      const el = track.attach();
      el.dataset.noxTrack = track.sid ?? '';
      ensure().appendChild(el);
    },
    detachAudio(track: RemoteTrack) {
      for (const el of track.detach()) el.remove();
    },
  };
}

/**
 * Teste de microfone local, sem conectar a nenhuma sala.
 * Mede o nível RMS do dispositivo escolhido com as mesmas opções de processamento da chamada.
 */
export class MicrophoneTest {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buffer: Float32Array<ArrayBuffer> | null = null;
  private monitor: HTMLAudioElement | null = null;

  async start(opts: { deviceId?: string | null; echoCancellation: boolean; noiseSuppression: boolean; autoGainControl: boolean; loopback?: boolean }) {
    await this.stop();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(opts.deviceId ? { deviceId: { exact: opts.deviceId } } : {}),
        echoCancellation: opts.echoCancellation,
        noiseSuppression: opts.noiseSuppression,
        autoGainControl: opts.autoGainControl,
      },
    });
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    source.connect(this.analyser);
    this.buffer = new Float32Array(this.analyser.fftSize);
    if (opts.loopback) {
      this.monitor = new Audio();
      this.monitor.srcObject = this.stream;
      await this.monitor.play().catch(() => undefined);
    }
  }

  /** 0–1, escala perceptual. */
  level(): number {
    if (!this.analyser || !this.buffer) return 0;
    this.analyser.getFloatTimeDomainData(this.buffer);
    let sum = 0;
    for (const v of this.buffer) sum += v * v;
    const rms = Math.sqrt(sum / this.buffer.length);
    const db = 20 * Math.log10(rms || 1e-8);
    return Math.min(1, Math.max(0, (db + 60) / 60));
  }

  async stop() {
    this.monitor?.pause();
    this.monitor = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    await this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.analyser = null;
  }
}
