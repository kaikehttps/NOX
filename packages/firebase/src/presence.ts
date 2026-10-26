import { onDisconnect, onValue, ref, serverTimestamp, set, type Unsubscribe } from 'firebase/database';
import type { PresenceStatus } from '@nox/shared';
import type { NoxClient } from './client';

type PublicState = Exclude<PresenceStatus, 'invisible'>;

/** "Invisível" publica offline para os outros, mantendo o usuário conectado. */
const publicState = (s: PresenceStatus): PublicState => (s === 'invisible' ? 'offline' : s);

/**
 * Presença via Realtime Database com onDisconnect: o servidor marca o usuário
 * como offline quando a conexão cai, sem heartbeats nem gravações periódicas.
 * Só há escrita quando o estado muda ou a conexão é restabelecida.
 */
export class PresenceController {
  private desired: PresenceStatus = 'online';
  private connected = false;
  private unsub: Unsubscribe | null = null;

  constructor(
    private readonly client: NoxClient,
    private readonly uid: string,
  ) {}

  private get statusRef() {
    return ref(this.client.rtdb, `status/${this.uid}`);
  }

  start(initial: PresenceStatus = 'online') {
    this.desired = initial;
    this.unsub = onValue(ref(this.client.rtdb, '.info/connected'), async (snap) => {
      this.connected = snap.val() === true;
      if (!this.connected) return;
      // Registra o "testamento" antes de anunciar presença, para nunca ficar online preso.
      await onDisconnect(this.statusRef).set({ state: 'offline', lastChanged: serverTimestamp() });
      await this.publish();
    });
  }

  async setStatus(status: PresenceStatus) {
    if (status === this.desired) return;
    this.desired = status;
    if (this.connected) await this.publish();
  }

  get status() {
    return this.desired;
  }

  private publish() {
    return set(this.statusRef, { state: publicState(this.desired), lastChanged: serverTimestamp() });
  }

  /** Chamar no logout: publica offline e cancela o listener de conexão. */
  async stop() {
    this.unsub?.();
    this.unsub = null;
    if (this.connected) {
      await set(this.statusRef, { state: 'offline', lastChanged: serverTimestamp() }).catch(() => undefined);
      await onDisconnect(this.statusRef).cancel().catch(() => undefined);
    }
  }
}

export interface PresenceSnapshot {
  state: PublicState;
  lastChanged: number | null;
}

export function subscribePresence(c: NoxClient, uid: string, cb: (p: PresenceSnapshot) => void): Unsubscribe {
  return onValue(ref(c.rtdb, `status/${uid}`), (s) => {
    const v = s.val() as { state?: PublicState; lastChanged?: number } | null;
    cb({ state: v?.state ?? 'offline', lastChanged: v?.lastChanged ?? null });
  });
}
