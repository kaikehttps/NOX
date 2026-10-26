import { useState, type FormEvent } from 'react';
import { LIMITS, can, type Community, type CommunityRole } from '@nox/shared';
import { Modal, SignalLoader } from '../components/Overlay';
import { errorText, useNav, useUi } from '../lib/context';
import { client } from '../lib/nox';

export function CommunitySettingsModal({ community, role, onClose }: { community: Community; role: CommunityRole; onClose: () => void }) {
  const ui = useUi();
  const { go } = useNav();
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description);
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await client().api.updateCommunity(community.id, { name, description });
      ui.toast('Espaço atualizado.');
      onClose();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await client().api.deleteCommunity(community.id);
      onClose();
      go({ kind: 'home', tab: 'online' });
      ui.toast('Espaço apagado.');
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Modal label="configurações do espaço" onClose={onClose}>
      <form onSubmit={save}>
        <div className="modal-body">
          <label className="field">
            <span className="label">nome</span>
            <input className="input" value={name} maxLength={LIMITS.community.nameMax} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">descrição</span>
            <textarea className="input" rows={3} value={description} maxLength={LIMITS.community.descriptionMax} onChange={(e) => setDescription(e.target.value)} />
          </label>
          {error && <div className="error-line">{error}</div>}
          {can(role, 'community.delete') && (
            <div className="settings-group" style={{ borderColor: 'color-mix(in srgb, var(--nox-danger) 40%, transparent)' }}>
              <span className="label danger-text">zona de perigo</span>
              <p className="muted" style={{ margin: 0 }}>
                Apagar o espaço remove canais, mensagens, membros e convites. Digite <b className="mono">{community.name}</b> para confirmar.
              </p>
              <input className="input" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
              <button type="button" className="btn danger" disabled={busy || confirmName !== community.name} onClick={remove}>
                Apagar espaço
              </button>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? <SignalLoader /> : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
