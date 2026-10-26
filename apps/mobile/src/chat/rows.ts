import type { MessageView } from '@nox/firebase';
import type { OutboxEntry } from '@nox/firebase/react';
import { formatDayLabel, isSameDay } from '@nox/shared';

export type ChatRow =
  | { kind: 'msg'; key: string; message: MessageView; grouped: boolean }
  | { kind: 'day'; key: string; label: string }
  | { kind: 'failed'; key: string; entry: OutboxEntry };

/** Mensagens consecutivas do mesmo autor dentro desta janela são agrupadas. */
const GROUP_WINDOW_MS = 5 * 60_000;

/**
 * Monta as linhas do chat em ordem cronológica (separadores de dia, agrupamento)
 * e devolve invertidas — a FlatList invertida mostra a mais nova embaixo.
 */
export function buildRows(messages: MessageView[], failed: OutboxEntry[], now = Date.now()): ChatRow[] {
  const rows: ChatRow[] = [];
  let prev: { authorId: string; t: number } | null = null;
  for (const m of messages) {
    const t = m.createdAt ?? now;
    if (!prev || !isSameDay(prev.t, t)) {
      rows.push({ kind: 'day', key: `day:${new Date(t).toDateString()}`, label: formatDayLabel(t, now) });
      prev = null;
    }
    const grouped = Boolean(prev && prev.authorId === m.authorId && t - prev.t < GROUP_WINDOW_MS && !m.replyTo);
    rows.push({ kind: 'msg', key: m.id, message: m, grouped });
    prev = { authorId: m.authorId, t };
  }
  for (const e of [...failed].sort((a, b) => a.createdAt - b.createdAt)) rows.push({ kind: 'failed', key: `failed:${e.id}`, entry: e });
  return rows.reverse();
}
