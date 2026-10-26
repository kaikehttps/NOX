import { useState, type FormEvent } from 'react';
import { Hash, Volume2 } from 'lucide-react';
import { DEFAULT_CHANNEL_ACCESS, LIMITS, ROLE_LABEL, ROLES, type Category, type Channel, type ChannelAccess, type ChannelType, type CommunityRole } from '@nox/shared';
import { Modal, SignalLoader } from '../components/Overlay';
import { errorText } from '../lib/context';
import { client } from '../lib/nox';

const ACCESS_LABEL: Record<keyof ChannelAccess, string> = {
  view: 'ver o canal',
  send: 'enviar mensagens',
  attach: 'enviar arquivos',
  connect: 'conectar à voz',
};

export function ChannelModal(props: {
  communityId: string;
  categories: Category[];
  channel?: Channel;
  defaultCategoryId?: string;
  categoryMode?: boolean;
  onClose: () => void;
}) {
  const editing = Boolean(props.channel);
  const [type, setType] = useState<ChannelType>(props.channel?.type ?? 'text');
  const [name, setName] = useState(props.channel?.name ?? '');
  const [topic, setTopic] = useState(props.channel?.topic ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(props.channel?.categoryId ?? props.defaultCategoryId ?? props.categories[0]?.id ?? null);
  const [access, setAccess] = useState<ChannelAccess>(props.channel?.access ?? { ...DEFAULT_CHANNEL_ACCESS });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const api = client().api;
    try {
      if (props.categoryMode) await api.createCategory(props.communityId, name);
      else if (props.channel) await api.updateChannel(props.communityId, props.channel.id, { name, topic, categoryId, access });
      else await api.createChannel(props.communityId, { name, type, topic, categoryId, access });
      props.onClose();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const label = props.categoryMode ? 'nova categoria' : editing ? 'editar canal' : 'novo canal';
  const relevant: (keyof ChannelAccess)[] = type === 'text' ? ['view', 'send', 'attach'] : ['view', 'connect'];

  return (
    <Modal label={label} onClose={props.onClose}>
      <form onSubmit={submit}>
        <div className="modal-body">
          {!props.categoryMode && !editing && (
            <div className="segmented" style={{ justifySelf: 'start' }}>
              <button type="button" aria-pressed={type === 'text'} onClick={() => setType('text')}>
                <Hash size={12} /> texto
              </button>
              <button type="button" aria-pressed={type === 'voice'} onClick={() => setType('voice')}>
                <Volume2 size={12} /> voz
              </button>
            </div>
          )}
          <label className="field">
            <span className="label">nome</span>
            <div className="input-prefix">
              <span>{props.categoryMode ? '▸' : type === 'text' ? '#' : '◢'}</span>
              <input
                className="input"
                autoFocus
                required
                maxLength={LIMITS.channel.nameMax}
                value={name}
                onChange={(e) => setName(props.categoryMode ? e.target.value : e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                placeholder={props.categoryMode ? 'jogos' : type === 'text' ? 'geral' : 'lounge'}
              />
            </div>
          </label>
          {!props.categoryMode && (
            <>
              <label className="field">
                <span className="label">tópico (opcional)</span>
                <input className="input" maxLength={LIMITS.channel.topicMax} value={topic} onChange={(e) => setTopic(e.target.value)} />
              </label>
              {props.categories.length > 0 && (
                <label className="field">
                  <span className="label">categoria</span>
                  <select className="input" value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value || null)}>
                    <option value="">sem categoria</option>
                    {props.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="settings-group">
                <span className="label">permissões — papel mínimo</span>
                {relevant.map((op) => (
                  <label key={op} className="toggle" style={{ padding: '4px 0' }}>
                    <span>{ACCESS_LABEL[op]}</span>
                    <select className="input" style={{ width: 160 }} value={access[op]} onChange={(e) => setAccess((a) => ({ ...a, [op]: e.target.value as CommunityRole }))}>
                      {[...ROLES].reverse().map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </>
          )}
          {error && <div className="error-line">{error}</div>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={props.onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy || !name.trim()}>
            {busy ? <SignalLoader /> : editing ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
