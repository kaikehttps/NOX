import { tooMany } from './errors';

/**
 * Limitador por janela deslizante em memória, por instância do Cloud Run.
 * É uma primeira barreira contra abuso (convites, solicitações, tokens). Com
 * várias instâncias o limite efetivo se multiplica; se isso virar problema,
 * mover o estado para Memorystore/Redis ou Firestore com TTL.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  check(key: string, max: number, windowMs: number): void {
    const t = this.now();
    const list = (this.hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (list.length >= max) {
      this.hits.set(key, list);
      throw tooMany();
    }
    list.push(t);
    this.hits.set(key, list);
    if (this.hits.size > 50_000) this.sweep(t, windowMs);
  }

  private sweep(t: number, windowMs: number) {
    for (const [k, v] of this.hits) if (v.every((x) => t - x >= windowMs)) this.hits.delete(k);
  }
}
