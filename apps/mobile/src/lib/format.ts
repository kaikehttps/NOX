import { formatClock, isSameDay } from '@nox/shared';

/** Horário compacto para listas: "14:02", "ontem", "12/10". */
export function shortTime(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return '';
  if (isSameDay(ms, now)) return formatClock(ms);
  if (isSameDay(ms, now - 86_400_000)) return 'ontem';
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return d.getFullYear() === new Date(now).getFullYear() ? `${dd}/${mm}` : `${dd}/${mm}/${String(d.getFullYear()).slice(2)}`;
}

/** "03:07" ou "1:02:09" para a duração da chamada. */
export function duration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Nome exibível de um perfil que pode estar carregando (`undefined`) ou removido (`null`). */
export function nameOf(profile: { displayName: string } | null | undefined, fallback = '…'): string {
  if (profile === null) return 'conta removida';
  return profile?.displayName || fallback;
}
