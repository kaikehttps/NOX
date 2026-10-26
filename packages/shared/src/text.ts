import type { Uid } from './types';

/** Menções são armazenadas no texto como `<@uid>` e renderizadas com o nome atual do usuário. */
const MENTION_RE = /<@([A-Za-z0-9_-]{1,128})>/g;
const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]}]/gi;

export type TextToken =
  | { type: 'text'; value: string }
  | { type: 'mention'; uid: Uid }
  | { type: 'link'; href: string };

export function extractMentions(text: string): Uid[] {
  const out = new Set<Uid>();
  for (const m of text.matchAll(MENTION_RE)) if (m[1]) out.add(m[1]);
  return [...out];
}

/** Quebra o texto em tokens seguros para renderização (sem HTML). */
export function tokenize(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  const pattern = new RegExp(`${MENTION_RE.source}|${URL_RE.source}`, 'gi');
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const index = m.index ?? 0;
    if (index > last) tokens.push({ type: 'text', value: text.slice(last, index) });
    if (m[1]) tokens.push({ type: 'mention', uid: m[1] });
    else if (isSafeUrl(m[0])) tokens.push({ type: 'link', href: m[0] });
    else tokens.push({ type: 'text', value: m[0] });
    last = index + m[0].length;
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) });
  return tokens;
}

export function isSafeUrl(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function messagePreview(text: string, max = 80): string {
  const flat = text.replace(MENTION_RE, '@…').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@/, '').toLowerCase();
}

/** `14:02` — horário compacto no estilo terminal. */
export function formatClock(ms: number, locale = 'pt-BR'): string {
  return new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

export function formatDayLabel(ms: number, now = Date.now(), locale = 'pt-BR'): string {
  const d = new Date(ms);
  const today = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return 'hoje';
  if (diffDays === 1) return 'ontem';
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function isSameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** Janela deslizante simples para conter rajadas de envio no cliente. */
export class BurstLimiter {
  private hits: number[] = [];
  constructor(
    private readonly count: number,
    private readonly windowMs: number,
  ) {}

  tryAcquire(now = Date.now()): boolean {
    this.hits = this.hits.filter((t) => now - t < this.windowMs);
    if (this.hits.length >= this.count) return false;
    this.hits.push(now);
    return true;
  }
}
