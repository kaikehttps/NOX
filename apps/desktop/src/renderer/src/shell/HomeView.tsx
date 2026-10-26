import { useMemo, useState, type FormEvent } from 'react';
import { Ban, Check, MessageSquare, MoreVertical, Phone, X } from 'lucide-react';
import { BRAND, dmConversationId, type UserProfile } from '@nox/shared';
import { usernameSchema, firstIssue } from '@nox/validation';
import { usePresences, useProfiles } from '@nox/firebase/react';
import { Avatar } from '../components/Avatar';
import { Empty, Modal, SignalLoader } from '../components/Overlay';
import { errorText, useNav, useSession, useUi, type HomeTab } from '../lib/context';
import { useData } from '../lib/data';
import { client, voice } from '../lib/nox';
import { STATUS_LABEL } from './MePanel';

type Ui = ReturnType<typeof useUi>;

export function confirmUnfriend(ui: Ui, p: UserProfile) {
  ui.openModal((close) => (
    <Modal
      label="desfazer amizade"
      onClose={close}
      footer={
        <>
          <button className="btn ghost" onClick={close}>
            Cancelar
          </button>
          <button
            className="btn danger"
            onClick={() => {
              close();
              client()
                .api.removeFriend(p.uid)
                .then(() => ui.toast(`${p.displayName} removido dos amigos.`))
                .catch((err) => ui.toast(errorText(err), 'error'));
            }}
          >
            Desfazer
          </button>
        </>
      }
    >
      <div className="modal-body">
        <p style={{ margin: 0 }}>
          Desfazer a amizade com <b>{p.displayName}</b>? O histórico da conversa continua disponível, mas novas mensagens ficam bloqueadas até
          vocês voltarem a ser amigos.
        </p>
      </div>
    </Modal>
  ));
}

export function confirmBlock(ui: Ui, p: UserProfile) {
  ui.openModal((close) => (
    <Modal
      label="bloquear"
      onClose={close}
      footer={
        <>
          <button className="btn ghost" onClick={close}>
            Cancelar
          </button>
          <button
            className="btn danger"
            onClick={() => {
              close();
              client()
                .api.block(p.uid)
                .then(() => ui.toast(`${p.displayName} foi bloqueado.`))
                .catch((err) => ui.toast(errorText(err), 'error'));
            }}
          >
            Bloquear
          </button>
        </>
      }
    >
      <div className="modal-body">
        <p style={{ margin: 0 }}>
          Bloquear <b>{p.displayName}</b> remove a amizade, cancela solicitações e impede novas mensagens e chamadas entre vocês. A pessoa não é
          avisada.
        </p>
      </div>
    </Modal>
  ));
}

function AddFriend() {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = usernameSchema.safeParse(value);
    if (!parsed.success) return setFeedback({ ok: false, text: firstIssue(parsed.error) });
    setBusy(true);
    setFeedback(null);
    try {
      const r = await client().api.sendFriendRequest(parsed.data);
      setFeedback({ ok: true, text: r.status === 'accepted' ? `Vocês agora são amigos.` : `Solicitação enviada para @${parsed.data}.` });
      setValue('');
    } catch (err) {
      setFeedback({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="add-friend">
        <div className="input-prefix">
          <span>@</span>
          <input className="input" placeholder="nome.de.usuario" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Nome de usuário do amigo" />
        </div>
        <button className="btn primary" disabled={busy || !value.trim()}>
          {busy ? <SignalLoader /> : 'Adicionar'}
        </button>
      </div>
      {feedback && <div className={feedback.ok ? 'ok-line' : 'error-line'} style={{ marginTop: -10, marginBottom: 14 }}>{feedback.text}</div>}
    </form>
  );
}

export function HomeView({ tab }: { tab: HomeTab }) {
  const { uid, profile } = useSession();
  const { go } = useNav();
  const ui = useUi();
  const { friends, incoming, outgoing, blocks, conversations } = useData();
  const c = client();

  const allIds = useMemo(
    () => [...new Set([...friends.map((f) => f.uid), ...incoming.map((r) => r.from), ...outgoing.map((r) => r.to), ...blocks.map((b) => b.uid)])],
    [friends, incoming, outgoing, blocks],
  );
  const profiles = useProfiles(c, allIds);
  const presence = usePresences(
    c,
    friends.map((f) => f.uid),
  );

  const online = friends.filter((f) => (presence[f.uid]?.state ?? 'offline') !== 'offline');
  const list = tab === 'online' ? online : friends;
  const sorted = [...list].sort((a, b) => (profiles[a.uid]?.displayName ?? '').localeCompare(profiles[b.uid]?.displayName ?? ''));
  const recent = conversations.filter((cv) => cv.lastMessagePreview).length;

  const call = async (friendUid: string) => {
    const conversationId = dmConversationId(uid, friendUid);
    go({ kind: 'conversation', conversationId });
    try {
      await voice.join({ kind: 'conversation', conversationId });
    } catch (err) {
      ui.toast(errorText(err), 'error');
    }
  };

  const friendMenu = (e: React.MouseEvent, p: UserProfile | null | undefined) => {
    e.preventDefault();
    if (!p) return;
    ui.openMenu({ x: e.clientX, y: e.clientY }, [
      { label: 'Mensagem', onSelect: () => go({ kind: 'conversation', conversationId: dmConversationId(uid, p.uid) }) },
      { label: 'Chamar', onSelect: () => void call(p.uid) },
      { label: 'Copiar nome de usuário', onSelect: () => void navigator.clipboard.writeText(`@${p.username}`) },
      'separator',
      { label: 'Desfazer amizade', danger: true, onSelect: () => confirmUnfriend(ui, p) },
      { label: 'Bloquear', danger: true, onSelect: () => confirmBlock(ui, p) },
    ]);
  };

  const act = (fn: () => Promise<unknown>, ok?: string) =>
    fn()
      .then(() => ok && ui.toast(ok))
      .catch((err) => ui.toast(errorText(err), 'error'));

  return (
    <main className="main">
      <div className="main-head">
        <span className="glyph">◎</span>
        <span className="name">Amigos</span>
        <div className="tabs" role="tablist" style={{ marginLeft: 12 }}>
          {(
            [
              ['online', 'online'],
              ['all', 'todos'],
              ['pending', 'solicitações'],
              ['blocked', 'bloqueados'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="tab" className="tab" aria-selected={tab === id} onClick={() => go({ kind: 'home', tab: id })}>
              {label}
              {id === 'pending' && incoming.length > 0 && <span className="count-badge">{incoming.length}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="home">
        <div className="home-welcome">
          <div>
            <div className="label">❯ sessão ativa</div>
            <h1>Bem-vindo de volta, {profile.displayName.split(' ')[0]}.</h1>
          </div>
          <div className="stat-row">
            <div className="stat">
              <div className="label">online</div>
              <div className={`v${online.length ? ' live' : ''}`}>{String(online.length).padStart(2, '0')}</div>
            </div>
            <div className="stat">
              <div className="label">conversas</div>
              <div className="v">{String(recent).padStart(2, '0')}</div>
            </div>
            <div className="stat">
              <div className="label">pendentes</div>
              <div className={`v${incoming.length ? ' live' : ''}`}>{String(incoming.length).padStart(2, '0')}</div>
            </div>
          </div>
        </div>

        <AddFriend />

        {(tab === 'online' || tab === 'all') && (
          <>
            <div className="label" style={{ marginBottom: 6 }}>
              {tab === 'online' ? `online — ${online.length}` : `todos — ${friends.length}`}
            </div>
            {sorted.length === 0 ? (
              <Empty glyph={friends.length === 0 ? '// frequência vazia' : '// silêncio'}>
                {friends.length === 0 ? BRAND.empty.friends : 'Ninguém online agora. Mande uma mensagem e chame o pessoal.'}
              </Empty>
            ) : (
              sorted.map((f) => {
                const p = profiles[f.uid];
                const st = presence[f.uid]?.state ?? 'offline';
                return (
                  <div key={f.uid} className="friend-row" onContextMenu={(e) => friendMenu(e, p)}>
                    <Avatar profile={p} size={36} presence={st} fallbackSeed={f.uid} />
                    <div className="info">
                      <div className="name truncate">{p?.displayName ?? '…'}</div>
                      <div className="sub">
                        @{p?.username} · {STATUS_LABEL[st]}
                      </div>
                    </div>
                    <div className="row-actions">
                      <button className="icon-btn" title="Mensagem" onClick={() => go({ kind: 'conversation', conversationId: f.conversationId })}>
                        <MessageSquare size={15} />
                      </button>
                      <button className="icon-btn" title={client().hasServer ? 'Chamar' : 'Voz ainda indisponível'} disabled={!client().hasServer} onClick={() => void call(f.uid)}>
                        <Phone size={15} />
                      </button>
                      <button className="icon-btn" title="Mais" onClick={(e) => friendMenu(e, p)}>
                        <MoreVertical size={15} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {tab === 'pending' && (
          <>
            <div className="label" style={{ marginBottom: 6 }}>
              recebidas — {incoming.length}
            </div>
            {incoming.length === 0 && <p className="hint">{BRAND.empty.requests}</p>}
            {incoming.map((r) => {
              const p = profiles[r.from];
              return (
                <div key={r.id} className="friend-row">
                  <Avatar profile={p} size={36} fallbackSeed={r.from} />
                  <div className="info">
                    <div className="name truncate">{p?.displayName ?? '…'}</div>
                    <div className="sub">@{p?.username} · quer ser seu amigo</div>
                  </div>
                  <div className="row-actions">
                    <button className="icon-btn active" title="Aceitar" onClick={() => act(() => c.api.acceptFriendRequest(r.id), 'Amizade aceita.')}>
                      <Check size={15} />
                    </button>
                    <button className="icon-btn" title="Recusar" onClick={() => act(() => c.api.deleteFriendRequest(r.id))}>
                      <X size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="label" style={{ margin: '20px 0 6px' }}>
              enviadas — {outgoing.length}
            </div>
            {outgoing.map((r) => {
              const p = profiles[r.to];
              return (
                <div key={r.id} className="friend-row">
                  <Avatar profile={p} size={36} fallbackSeed={r.to} />
                  <div className="info">
                    <div className="name truncate">{p?.displayName ?? '…'}</div>
                    <div className="sub">@{p?.username} · aguardando resposta</div>
                  </div>
                  <div className="row-actions">
                    <button className="btn ghost" onClick={() => act(() => c.api.deleteFriendRequest(r.id), 'Solicitação cancelada.')}>
                      Cancelar
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {tab === 'blocked' && (
          <>
            <div className="label" style={{ marginBottom: 6 }}>
              bloqueados — {blocks.length}
            </div>
            {blocks.length === 0 && <p className="hint">Ninguém bloqueado.</p>}
            {blocks.map((b) => {
              const p = profiles[b.uid];
              return (
                <div key={b.uid} className="friend-row">
                  <Avatar profile={p} size={36} fallbackSeed={b.uid} />
                  <div className="info">
                    <div className="name truncate">{p?.displayName ?? (p === null ? 'conta removida' : '…')}</div>
                    <div className="sub">
                      <Ban size={10} /> bloqueado
                    </div>
                  </div>
                  <div className="row-actions">
                    <button className="btn" onClick={() => act(() => c.api.unblock(b.uid), 'Desbloqueado.')}>
                      Desbloquear
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </main>
  );
}

