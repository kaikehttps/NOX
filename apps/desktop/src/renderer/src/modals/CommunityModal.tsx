import { useEffect, useState, type FormEvent } from 'react';
import { LIMITS } from '@nox/shared';
import { communityCreateSchema, inviteCodeSchema, firstIssue } from '@nox/validation';
import { previewInvite } from '@nox/firebase';
import { Modal, SignalLoader } from '../components/Overlay';
import { errorText, useNav, useUi } from '../lib/context';
import { client } from '../lib/nox';

type Preview = Awaited<ReturnType<typeof previewInvite>>;

export function CommunityModal({ onClose, initialCode }: { onClose: () => void; initialCode?: string }) {
  const [mode, setMode] = useState<'create' | 'join'>(initialCode ? 'join' : 'create');
  return (
    <Modal label={mode === 'create' ? 'novo espaço' : 'entrar com convite'} onClose={onClose}>
      <div className="modal-body" style={{ paddingBottom: 0 }}>
        <div className="segmented" style={{ justifySelf: 'start' }}>
          <button aria-pressed={mode === 'create'} onClick={() => setMode('create')}>
            criar
          </button>
          <button aria-pressed={mode === 'join'} onClick={() => setMode('join')}>
            entrar
          </button>
        </div>
      </div>
      {mode === 'create' ? <CreateForm onClose={onClose} /> : <JoinForm onClose={onClose} initialCode={initialCode} />}
    </Modal>
  );
}

function CreateForm({ onClose }: { onClose: () => void }) {
  const { go } = useNav();
  const ui = useUi();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = communityCreateSchema.safeParse({ name, description });
    if (!parsed.success) return setError(firstIssue(parsed.error));
    setBusy(true);
    try {
      const r = await client().api.createCommunity(parsed.data.name, parsed.data.description);
      onClose();
      go({ kind: 'community', communityId: r.communityId, channelId: r.defaultChannelId });
      ui.toast('Espaço criado. Convide seu grupo pelo menu do espaço.');
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="modal-body">
        <p className="muted" style={{ margin: 0 }}>
          Um espaço privado para o seu grupo, com canais de texto e voz. Só entra quem tiver convite.
        </p>
        <label className="field">
          <span className="label">nome</span>
          <input className="input" autoFocus maxLength={LIMITS.community.nameMax} value={name} onChange={(e) => setName(e.target.value)} placeholder="Base Noturna" />
        </label>
        <label className="field">
          <span className="label">descrição (opcional)</span>
          <textarea className="input" rows={2} maxLength={LIMITS.community.descriptionMax} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {error && <div className="error-line">{error}</div>}
      </div>
      <div className="modal-foot">
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn primary" disabled={busy || name.trim().length < LIMITS.community.nameMin}>
          {busy ? <SignalLoader /> : 'Criar espaço'}
        </button>
      </div>
    </form>
  );
}

function JoinForm({ onClose, initialCode }: { onClose: () => void; initialCode?: string }) {
  const { go } = useNav();
  const [code, setCode] = useState(initialCode ?? '');
  const [preview, setPreview] = useState<Preview | 'loading' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const parsed = inviteCodeSchema.safeParse(code);
    setError(null);
    if (!parsed.success) {
      setPreview(null);
      return;
    }
    setPreview('loading');
    let alive = true;
    previewInvite(client(), parsed.data)
      .then((p) => alive && setPreview(p))
      .catch(() => alive && setPreview(null));
    return () => {
      alive = false;
    };
  }, [code]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = inviteCodeSchema.safeParse(code);
    if (!parsed.success) return setError(firstIssue(parsed.error));
    setBusy(true);
    try {
      const r = await client().api.redeemInvite(parsed.data);
      onClose();
      go({ kind: 'community', communityId: r.communityId, channelId: null });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="modal-body">
        <label className="field">
          <span className="label">código ou link do convite</span>
          <input className="input mono" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="nox://invite/abc23defgh" />
        </label>
        {preview === 'loading' && <SignalLoader label="consultando convite" />}
        {preview && preview !== 'loading' && (
          <div className="terminal-lines">
            <div>
              <span className="ok">✓</span> convite válido
            </div>
            <div>
              ❯ espaço: <span style={{ color: 'var(--nox-text)' }}>{preview.communityName}</span>
            </div>
            {preview.revoked && <div className="danger-text">✕ convite revogado</div>}
          </div>
        )}
        {preview === null && inviteCodeSchema.safeParse(code).success && <div className="error-line">Convite não encontrado.</div>}
        {error && <div className="error-line">{error}</div>}
      </div>
      <div className="modal-foot">
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn primary" disabled={busy || !preview || preview === 'loading' || preview.revoked}>
          {busy ? <SignalLoader /> : 'Entrar'}
        </button>
      </div>
    </form>
  );
}
