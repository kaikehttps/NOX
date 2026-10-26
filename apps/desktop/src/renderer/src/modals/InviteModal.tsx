import { useCallback, useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import type { InviteInfo } from '@nox/firebase';
import { Modal, SignalLoader } from '../components/Overlay';
import { errorText, useUi } from '../lib/context';
import { client } from '../lib/nox';

const AGES: { label: string; seconds: number | null }[] = [
  { label: '1 hora', seconds: 3600 },
  { label: '1 dia', seconds: 86_400 },
  { label: '7 dias', seconds: 604_800 },
  { label: '30 dias', seconds: 2_592_000 },
];
const USES: { label: string; value: number | null }[] = [
  { label: '1 uso', value: 1 },
  { label: '5 usos', value: 5 },
  { label: '25 usos', value: 25 },
  { label: 'sem limite', value: null },
];

export const inviteLink = (code: string) => `nox://invite/${code}`;

export function InviteModal({ communityId, communityName, onClose }: { communityId: string; communityName: string; onClose: () => void }) {
  const ui = useUi();
  const [age, setAge] = useState<number | null>(604_800);
  const [uses, setUses] = useState<number | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [list, setList] = useState<InviteInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    client()
      .api.listInvites(communityId)
      .then((r) => setList(r.invites))
      .catch((err) => setError(errorText(err)));
  }, [communityId]);

  useEffect(refresh, [refresh]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await client().api.createInvite(communityId, { maxAgeSeconds: age, maxUses: uses });
      setCreated(r.code);
      refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = (code: string) => {
    void navigator.clipboard.writeText(`${inviteLink(code)}  (código: ${code})`);
    ui.toast('Convite copiado.');
  };

  const revoke = (code: string) =>
    client()
      .api.revokeInvite(code)
      .then(refresh)
      .catch((err) => ui.toast(errorText(err), 'error'));

  const active = (list ?? []).filter((i) => !i.revoked && (!i.expiresAt || i.expiresAt > Date.now()) && (i.maxUses === null || i.uses < i.maxUses));

  return (
    <Modal label={`convidar para ${communityName}`} onClose={onClose}>
      <div className="modal-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label className="field">
            <span className="label">expira em</span>
            <select className="input" value={String(age)} onChange={(e) => setAge(e.target.value === 'null' ? null : Number(e.target.value))}>
              {AGES.map((a) => (
                <option key={a.label} value={String(a.seconds)}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">limite</span>
            <select className="input" value={String(uses)} onChange={(e) => setUses(e.target.value === 'null' ? null : Number(e.target.value))}>
              {USES.map((u) => (
                <option key={u.label} value={String(u.value)}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="btn primary" onClick={create} disabled={busy}>
          {busy ? <SignalLoader /> : 'Gerar convite'}
        </button>
        {created && (
          <div className="terminal-lines selectable" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1 }}>
              <span className="ok">✓</span> {inviteLink(created)}
              <br />
              <span className="faint">código: </span>
              <span style={{ color: 'var(--nox-text)', letterSpacing: '0.12em' }}>{created}</span>
            </span>
            <button className="icon-btn" title="Copiar" onClick={() => copy(created)}>
              <Copy size={15} />
            </button>
          </div>
        )}
        {error && <div className="error-line">{error}</div>}

        <span className="label">convites ativos — {active.length}</span>
        {list === null ? (
          <SignalLoader />
        ) : (
          <div style={{ display: 'grid' }}>
            {active.map((i) => (
              <div key={i.code} className="friend-row" style={{ padding: '6px 4px' }}>
                <div className="info">
                  <div className="mono">{i.code}</div>
                  <div className="sub">
                    {i.uses}/{i.maxUses ?? '∞'} usos · {i.expiresAt ? `expira ${new Date(i.expiresAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : 'sem validade'}
                  </div>
                </div>
                <div className="row-actions">
                  <button className="icon-btn" title="Copiar" onClick={() => copy(i.code)}>
                    <Copy size={14} />
                  </button>
                  <button className="btn danger" onClick={() => void revoke(i.code)}>
                    Revogar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
