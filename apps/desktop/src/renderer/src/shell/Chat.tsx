import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AlertTriangle, Clock, Copy, CornerUpLeft, Pencil, Pin, PinOff, Smile, SmilePlus, Trash2, X } from 'lucide-react';
import {
  LIMITS,
  formatClock,
  formatDayLabel,
  isSameDay,
  messagePreview,
  tokenize,
  type MessageReply,
  type MessageScope,
  type UserProfile,
} from '@nox/shared';
import { deleteMessage, editMessage, setPinned, toggleReaction, type MessageView } from '@nox/firebase';
import { useMessages, useProfiles, type OutboxEntry } from '@nox/firebase/react';
import { Avatar } from '../components/Avatar';
import { EmojiPicker } from '../components/EmojiPicker';
import { Empty, Modal, SignalLoader } from '../components/Overlay';
import { errorText, useSession, useUi, type MenuEntry } from '../lib/context';
import { client } from '../lib/nox';

const GROUP_WINDOW_MS = 5 * 60_000;

export interface ChatProps {
  scope: MessageScope;
  /** Nome exibido no placeholder: "#geral" ou "Ana". */
  target: string;
  intro: ReactNode;
  /** Motivo pelo qual não é possível enviar (canal somente leitura, conversa bloqueada). */
  lockedReason?: string | null;
  canModerate: boolean;
  /** Pessoas que podem ser mencionadas com @. */
  mentionables: UserProfile[];
  onActivity?: () => void;
}

/* ───────────── texto com links e menções ───────────── */

function RichText({ text, profiles, me }: { text: string; profiles: Record<string, UserProfile | null | undefined>; me: string }) {
  return (
    <>
      {tokenize(text).map((t, i) => {
        if (t.type === 'text') return <span key={i}>{t.value}</span>;
        if (t.type === 'mention') {
          const p = profiles[t.uid];
          return (
            <span key={i} className="mention" style={t.uid === me ? { fontWeight: 600 } : undefined}>
              @{p?.displayName ?? (p === null ? 'conta removida' : '…')}
            </span>
          );
        }
        return (
          <a
            key={i}
            href={t.href}
            onClick={(e) => {
              e.preventDefault();
              void window.nox?.openExternal(t.href);
            }}
            title={t.href}
          >
            {t.href}
          </a>
        );
      })}
    </>
  );
}

/* ───────────── linha de mensagem ───────────── */

interface RowProps {
  m: MessageView;
  head: boolean;
  me: string;
  profiles: Record<string, UserProfile | null | undefined>;
  editing: boolean;
  menuOpen: boolean;
  onMenu: (e: React.MouseEvent, m: MessageView) => void;
  onReply: (m: MessageView) => void;
  onReact: (m: MessageView, emoji: string, active: boolean) => void;
  onEditDone: () => void;
  scope: MessageScope;
}

const MessageRow = memo(function MessageRow(props: RowProps) {
  const { m, head, me, profiles } = props;
  const author = profiles[m.authorId];
  const mentioned = m.mentions.includes(me);
  const reactions = Object.entries(m.reactions).filter(([, users]) => Object.keys(users).length > 0);
  const ts = m.createdAt ?? Date.now();

  return (
    <div
      className={`msg${head ? ' head' : ''}${m.pending ? ' pending' : ''}${mentioned ? ' mentioned' : ''}${props.menuOpen ? ' menu-open' : ''}`}
      onContextMenu={(e) => props.onMenu(e, m)}
    >
      {m.replyTo && (
        <div className="reply-ref truncate">
          <span className="accent">@{profiles[m.replyTo.authorId]?.displayName ?? '…'}</span>
          <span className="truncate">{m.replyTo.preview}</span>
        </div>
      )}
      {head ? <Avatar profile={author} size={36} fallbackSeed={m.authorId} /> : <span className="gutter">{formatClock(ts)}</span>}
      <div style={{ minWidth: 0 }}>
        {head && (
          <div className="head-line">
            <span className="author">{author?.displayName ?? (author === null ? 'conta removida' : '…')}</span>
            <span className="time">{formatClock(ts)}</span>
            {m.pinned && <Pin size={11} className="faint" aria-label="fixada" />}
            {m.pending && <Clock size={11} className="faint" aria-label="enviando" />}
          </div>
        )}
        {props.editing ? (
          <EditBox scope={props.scope} m={m} onDone={props.onEditDone} />
        ) : (
          <div className="text">
            <RichText text={m.text} profiles={profiles} me={me} />
            {m.editedAt && <span className="edited">(editada)</span>}
            {!head && m.pending && <Clock size={11} className="faint" style={{ marginLeft: 6 }} aria-label="enviando" />}
          </div>
        )}
        {reactions.length > 0 && (
          <div className="reactions">
            {reactions.map(([emoji, users]) => {
              const mine = Boolean(users[me]);
              return (
                <button
                  key={emoji}
                  className={`reaction${mine ? ' mine' : ''}`}
                  onClick={() => props.onReact(m, emoji, !mine)}
                  title={Object.keys(users)
                    .map((u) => profiles[u]?.displayName ?? '…')
                    .join(', ')}
                >
                  <span>{emoji}</span>
                  <span className="n">{Object.keys(users).length}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="hover-actions">
        <button className="icon-btn" title="Reagir" onClick={(e) => props.onMenu(e, m)}>
          <SmilePlus size={15} />
        </button>
        <button className="icon-btn" title="Responder" onClick={() => props.onReply(m)}>
          <CornerUpLeft size={15} />
        </button>
      </div>
    </div>
  );
});

function EditBox({ scope, m, onDone }: { scope: MessageScope; m: MessageView; onDone: () => void }) {
  const [text, setText] = useState(m.text);
  const ui = useUi();
  const save = async () => {
    if (text.trim() === m.text.trim()) return onDone();
    try {
      await editMessage(client(), scope, m.id, text);
      onDone();
    } catch (err) {
      ui.toast(errorText(err), 'error');
    }
  };
  return (
    <div className="edit-box">
      <textarea
        className="input"
        autoFocus
        rows={Math.min(8, text.split('\n').length + 1)}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onDone();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void save();
          }
        }}
      />
      <span className="hint">
        <span className="kbd">esc</span> cancelar · <span className="kbd">enter</span> salvar
      </span>
    </div>
  );
}

function FailedRow({ entry, onRetry, onDiscard }: { entry: OutboxEntry; onRetry: () => void; onDiscard: () => void }) {
  return (
    <div className="msg-failed">
      <AlertTriangle size={14} className="danger-text" />
      <span className="truncate muted" style={{ flex: 1 }}>
        “{messagePreview(entry.text, 60)}” não foi enviada{entry.error ? `: ${entry.error}` : ''}
      </span>
      <button className="btn" onClick={onRetry}>
        Reenviar
      </button>
      <button className="btn ghost" onClick={onDiscard}>
        Descartar
      </button>
    </div>
  );
}

/* ───────────── conversa ───────────── */

export function Chat(props: ChatProps) {
  const { uid } = useSession();
  const ui = useUi();
  const c = client();
  const state = useMessages(c, props.scope);
  const [replyTo, setReplyTo] = useState<MessageReply | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const ids = useMemo(() => {
    const s = new Set<string>();
    for (const m of state.messages) {
      s.add(m.authorId);
      m.mentions.forEach((u) => s.add(u));
      if (m.replyTo) s.add(m.replyTo.authorId);
      Object.values(m.reactions).forEach((users) => Object.keys(users).forEach((u) => s.add(u)));
    }
    return [...s];
  }, [state.messages]);
  const profiles = useProfiles(c, ids);

  // Mensagens novas marcam a conversa como lida (se a janela estiver em foco).
  const lastId = state.messages.at(-1)?.id;
  useEffect(() => {
    if (lastId && document.hasFocus()) props.onActivity?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId]);

  // Carrega histórico anterior ao aproximar do topo.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !state.hasOlder) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void state.loadOlder(), { rootMargin: '400px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [state.hasOlder, state.loadOlder]);

  const react = useCallback(
    (m: MessageView, emoji: string, active: boolean) => {
      toggleReaction(c, props.scope, m.id, emoji, active).catch((err) => ui.toast(errorText(err), 'error'));
    },
    [c, props.scope, ui],
  );

  const reply = useCallback((m: MessageView) => {
    setReplyTo({ id: m.id, authorId: m.authorId, preview: messagePreview(m.text, 120) });
  }, []);

  const confirmDelete = useCallback(
    (m: MessageView) => {
      ui.openModal((close) => (
        <Modal
          label="apagar mensagem"
          onClose={close}
          footer={
            <>
              <button className="btn ghost" onClick={close}>
                Cancelar
              </button>
              <button
                className="btn danger"
                autoFocus
                onClick={() => {
                  close();
                  deleteMessage(c, props.scope, m.id).catch((err) => ui.toast(errorText(err), 'error'));
                }}
              >
                Apagar
              </button>
            </>
          }
        >
          <div className="modal-body">
            <p style={{ margin: 0 }}>Esta mensagem será apagada para todos.</p>
            <div className="terminal-lines selectable">{messagePreview(m.text, 200)}</div>
          </div>
        </Modal>
      ));
    },
    [c, props.scope, ui],
  );

  const openMenu = useCallback(
    (e: React.MouseEvent, m: MessageView) => {
      e.preventDefault();
      const mine = m.authorId === uid;
      const entries: MenuEntry[] = [
        { reactions: (emoji) => react(m, emoji, !m.reactions[emoji]?.[uid]) },
        { label: 'Responder', icon: <CornerUpLeft size={14} />, onSelect: () => reply(m) },
        { label: 'Copiar texto', icon: <Copy size={14} />, onSelect: () => void navigator.clipboard.writeText(m.text) },
      ];
      if (mine && !props.lockedReason) entries.push({ label: 'Editar', icon: <Pencil size={14} />, onSelect: () => setEditingId(m.id) });
      if (props.canModerate || props.scope.kind === 'conversation') {
        entries.push({
          label: m.pinned ? 'Desafixar' : 'Fixar',
          icon: m.pinned ? <PinOff size={14} /> : <Pin size={14} />,
          onSelect: () => setPinned(c, props.scope, m.id, !m.pinned).catch((err) => ui.toast(errorText(err), 'error')),
        });
      }
      if (mine || (props.canModerate && props.scope.kind === 'channel')) {
        entries.push('separator', { label: 'Apagar', icon: <Trash2 size={14} />, danger: true, onSelect: () => confirmDelete(m) });
      }
      setMenuFor(m.id);
      ui.openMenu({ x: e.clientX, y: e.clientY }, entries, () => setMenuFor(null));
    },
    [uid, react, reply, props.lockedReason, props.canModerate, props.scope, c, ui, confirmDelete],
  );

  const lastOwn = useMemo(() => [...state.messages].reverse().find((m) => m.authorId === uid && !m.pending), [state.messages, uid]);

  const rows: ReactNode[] = [];
  let prev: MessageView | undefined;
  for (const m of state.messages) {
    const t = m.createdAt ?? Date.now();
    const pt = prev?.createdAt ?? 0;
    if (!prev || !isSameDay(pt, t)) {
      rows.push(
        <div key={`d-${m.id}`} className="day-sep">
          <span className="label">{formatDayLabel(t)}</span>
        </div>,
      );
    }
    const head = !prev || prev.authorId !== m.authorId || t - pt > GROUP_WINDOW_MS || Boolean(m.replyTo) || !isSameDay(pt, t);
    rows.push(
      <MessageRow
        key={m.id}
        m={m}
        head={head}
        me={uid}
        profiles={profiles}
        editing={editingId === m.id}
        menuOpen={menuFor === m.id}
        onMenu={openMenu}
        onReply={reply}
        onReact={react}
        onEditDone={() => setEditingId(null)}
        scope={props.scope}
      />,
    );
    prev = m;
  }

  return (
    <div className="main-body">
      <div className="messages">
        <div className="messages-inner">
          {state.hasOlder ? (
            <div ref={sentinel} className="load-older">
              {state.loadingOlder ? <SignalLoader label="carregando histórico" /> : <button className="btn ghost" onClick={() => void state.loadOlder()}>carregar anteriores</button>}
            </div>
          ) : (
            !state.loading && props.intro
          )}
          {state.loading ? (
            <div className="empty">
              <SignalLoader label="sincronizando" />
            </div>
          ) : state.error ? (
            <Empty glyph="// erro">{errorText(state.error)}</Empty>
          ) : null}
          {rows}
          {state.failed.map((f) => (
            <FailedRow key={f.id} entry={f} onRetry={() => void state.retry(f.id)} onDiscard={() => state.discard(f.id)} />
          ))}
        </div>
      </div>
      {props.lockedReason ? (
        <div className="composer-wrap">
          <div className="composer-locked">{props.lockedReason}</div>
        </div>
      ) : (
        <Composer
          target={props.target}
          replyTo={replyTo}
          replyName={replyTo ? (profiles[replyTo.authorId]?.displayName ?? '…') : ''}
          onCancelReply={() => setReplyTo(null)}
          mentionables={props.mentionables}
          onEditLast={() => lastOwn && setEditingId(lastOwn.id)}
          onSend={async (text) => {
            const ok = await state.send(text, replyTo);
            if (!ok) ui.toast('Calma: muitas mensagens em sequência.', 'error');
            else setReplyTo(null);
            return ok;
          }}
        />
      )}
    </div>
  );
}

/* ───────────── compositor ───────────── */

const MENTION_QUERY = /(^|\s)@([a-z0-9_.]{0,24})$/i;

function Composer(props: {
  target: string;
  replyTo: MessageReply | null;
  replyName: string;
  onCancelReply: () => void;
  mentionables: UserProfile[];
  onEditLast: () => void;
  onSend: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const [picker, setPicker] = useState(false);
  const [mentionIdx, setMentionIdx] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (props.replyTo) ref.current?.focus();
  }, [props.replyTo]);

  // Ajusta a altura ao conteúdo.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const query = MENTION_QUERY.exec(text.slice(0, ref.current?.selectionStart ?? text.length))?.[2];
  const suggestions =
    query === undefined
      ? []
      : props.mentionables
          .filter((p) => p.username.startsWith(query.toLowerCase()) || p.displayName.toLowerCase().startsWith(query.toLowerCase()))
          .slice(0, 6);

  const insertMention = (p: UserProfile) => {
    setText((t) => t.replace(MENTION_QUERY, `$1@${p.username} `));
    setMentionIdx(0);
    ref.current?.focus();
  };

  /** @usuario → <@uid> para que menções sobrevivam a trocas de nome de exibição. */
  const encode = (raw: string) => {
    const byName = new Map(props.mentionables.map((p) => [p.username, p.uid]));
    return raw.replace(/(^|\s)@([a-z0-9_.]{3,24})\b/g, (all, pre: string, name: string) => {
      const id = byName.get(name.toLowerCase());
      return id ? `${pre}<@${id}>` : all;
    });
  };

  const send = async () => {
    const value = text.trim();
    if (!value) return;
    if (await props.onSend(encode(value))) setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIdx((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        insertMention(suggestions[Math.min(mentionIdx, suggestions.length - 1)]!);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    } else if (e.key === 'Escape' && props.replyTo) {
      props.onCancelReply();
    } else if (e.key === 'ArrowUp' && text === '') {
      e.preventDefault();
      props.onEditLast();
    }
  };

  const remaining = LIMITS.message.textMax - text.length;

  return (
    <div className="composer-wrap">
      {suggestions.length > 0 && (
        <div className="menu" style={{ position: 'absolute', bottom: '100%', left: 16, marginBottom: 6 }}>
          {suggestions.map((p, i) => (
            <button
              key={p.uid}
              className="menu-item"
              style={i === mentionIdx ? { background: 'var(--nox-accent-tint)', color: 'var(--nox-accent)' } : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(p);
              }}
            >
              <Avatar profile={p} size={20} />
              <span>{p.displayName}</span>
              <span className="kbd">@{p.username}</span>
            </button>
          ))}
        </div>
      )}
      {props.replyTo && (
        <div className="composer-reply">
          <CornerUpLeft size={13} />
          <span className="truncate" style={{ flex: 1 }}>
            respondendo <b className="accent">@{props.replyName}</b> · {props.replyTo.preview}
          </span>
          <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={props.onCancelReply} aria-label="Cancelar resposta">
            <X size={13} />
          </button>
        </div>
      )}
      <div className="composer">
        <span className="prompt" aria-hidden>
          ❯
        </span>
        <textarea
          ref={ref}
          rows={1}
          value={text}
          maxLength={LIMITS.message.textMax}
          placeholder={`Mensagem para ${props.target}`}
          onChange={(e) => {
            setText(e.target.value);
            setMentionIdx(0);
          }}
          onKeyDown={onKeyDown}
          aria-label={`Mensagem para ${props.target}`}
        />
        <div style={{ position: 'relative' }}>
          <button className={`icon-btn${picker ? ' active' : ''}`} onClick={() => setPicker((p) => !p)} title="Emojis" aria-label="Emojis">
            <Smile size={17} />
          </button>
          {picker && (
            <EmojiPicker
              onClose={() => setPicker(false)}
              onPick={(emoji) => {
                setText((t) => t + emoji);
                ref.current?.focus();
              }}
            />
          )}
        </div>
      </div>
      <div className="composer-foot">
        <span>
          <span className="kbd">enter</span> enviar · <span className="kbd">shift+enter</span> nova linha · <span className="kbd">↑</span> editar última
        </span>
        {remaining < 500 && <span className={remaining < 100 ? 'danger-text' : ''}>{remaining}</span>}
      </div>
    </div>
  );
}
