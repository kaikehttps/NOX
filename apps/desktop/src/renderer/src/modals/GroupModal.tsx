import { useState } from 'react';
import { LIMITS } from '@nox/shared';
import { useProfiles } from '@nox/firebase/react';
import { Avatar } from '../components/Avatar';
import { Empty, Modal, SignalLoader } from '../components/Overlay';
import { errorText, useNav } from '../lib/context';
import { useData } from '../lib/data';
import { client } from '../lib/nox';

export function GroupModal({ onClose }: { onClose: () => void }) {
  const { friends } = useData();
  const { go } = useNav();
  const profiles = useProfiles(
    client(),
    friends.map((f) => f.uid),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (uid: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(uid)) next.delete(uid);
      else if (next.size < LIMITS.group.membersMax - 1) next.add(uid);
      return next;
    });

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await client().api.createGroup([...selected], name.trim() || null);
      onClose();
      go({ kind: 'conversation', conversationId: r.conversationId });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      label="novo grupo"
      onClose={onClose}
      footer={
        <>
          <span className="hint" style={{ marginRight: 'auto' }}>
            {selected.size} selecionados
          </span>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy || selected.size < 2} onClick={create}>
            {busy ? <SignalLoader /> : 'Criar grupo'}
          </button>
        </>
      }
    >
      <div className="modal-body">
        <label className="field">
          <span className="label">nome do grupo (opcional)</span>
          <input className="input" value={name} maxLength={LIMITS.group.nameMax} onChange={(e) => setName(e.target.value)} />
        </label>
        <span className="label">escolha pelo menos 2 amigos</span>
        {friends.length === 0 ? (
          <Empty>Adicione amigos antes de criar um grupo.</Empty>
        ) : (
          <div style={{ display: 'grid', maxHeight: 280, overflow: 'auto' }}>
            {friends.map((f) => (
              <label key={f.uid} className="member-row" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.has(f.uid)} onChange={() => toggle(f.uid)} style={{ accentColor: 'var(--nox-accent)' }} />
                <Avatar profile={profiles[f.uid]} size={26} fallbackSeed={f.uid} />
                <span className="truncate">{profiles[f.uid]?.displayName ?? '…'}</span>
              </label>
            ))}
          </div>
        )}
        {error && <div className="error-line">{error}</div>}
      </div>
    </Modal>
  );
}
