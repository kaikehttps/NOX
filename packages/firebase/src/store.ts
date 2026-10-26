type Unsub = () => void;

interface Entry<T> {
  value: T | undefined;
  listeners: Set<() => void>;
  close: Unsub | null;
  closeTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Cache de assinaturas por chave com contagem de referências.
 * Vários componentes exibindo o mesmo usuário compartilham um único listener.
 * Ao perder o último assinante, o listener fecha após um curto período de
 * carência, evitando abrir/fechar repetidamente ao navegar entre telas.
 */
export class KeyedSubscriptionStore<T> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(
    private readonly open: (key: string, emit: (value: T) => void) => Unsub,
    private readonly graceMs = 10_000,
  ) {}

  get(key: string): T | undefined {
    return this.entries.get(key)?.value;
  }

  subscribe(key: string, listener: () => void): Unsub {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { value: undefined, listeners: new Set(), close: null, closeTimer: null };
      this.entries.set(key, entry);
    }
    const e = entry;
    if (e.closeTimer) {
      clearTimeout(e.closeTimer);
      e.closeTimer = null;
    }
    e.listeners.add(listener);
    if (!e.close) {
      e.close = this.open(key, (value) => {
        e.value = value;
        for (const l of [...e.listeners]) l();
      });
    }
    return () => {
      e.listeners.delete(listener);
      if (e.listeners.size === 0 && !e.closeTimer) {
        e.closeTimer = setTimeout(() => {
          e.close?.();
          this.entries.delete(key);
        }, this.graceMs);
      }
    };
  }

  /** Fecha tudo (logout). */
  clear() {
    for (const e of this.entries.values()) {
      if (e.closeTimer) clearTimeout(e.closeTimer);
      e.close?.();
    }
    this.entries.clear();
  }
}
