import { Headphones, HeadphoneOff, Mic, MicOff, Settings } from 'lucide-react';
import type { PresenceStatus } from '@nox/shared';
import { Avatar } from '../components/Avatar';
import { useSession, useUi, useVoice } from '../lib/context';
import { voice } from '../lib/nox';
import { SettingsModal } from '../modals/SettingsModal';

export const STATUS_LABEL: Record<PresenceStatus, string> = {
  online: 'online',
  idle: 'ausente',
  dnd: 'ocupado',
  invisible: 'invisível',
  offline: 'offline',
};

const STATUS_ORDER: PresenceStatus[] = ['online', 'idle', 'dnd', 'invisible'];

export function MePanel() {
  const { profile, status, setStatus } = useSession();
  const ui = useUi();
  const v = useVoice();
  const dot = status === 'invisible' ? 'offline' : status === 'offline' ? 'offline' : status;

  return (
    <div className="me-panel">
      <Avatar profile={profile} size={32} presence={dot} />
      <button
        className="who"
        title="Alterar status"
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          ui.openMenu(
            { x: r.left, y: r.top - 8 - 4 * 34 },
            STATUS_ORDER.map((s) => ({
              label: STATUS_LABEL[s],
              icon: <span className={`status-dot ${s === 'invisible' ? 'offline' : s}`} style={{ position: 'static', border: 0 }} />,
              hint: s === status ? 'atual' : undefined,
              onSelect: () => setStatus(s),
            })),
          );
        }}
      >
        <div className="name truncate">{profile.displayName}</div>
        <div className="handle truncate">
          @{profile.username} · {STATUS_LABEL[status]}
        </div>
      </button>
      <button
        className={`icon-btn${v.muted ? ' alert' : ''}`}
        title={v.muted ? 'Ativar microfone (Ctrl+Shift+M)' : 'Silenciar microfone (Ctrl+Shift+M)'}
        aria-pressed={v.muted}
        onClick={() => void voice.toggleMute()}
      >
        {v.muted ? <MicOff size={16} /> : <Mic size={16} />}
      </button>
      <button
        className={`icon-btn${v.deafened ? ' alert' : ''}`}
        title={v.deafened ? 'Ativar áudio (Ctrl+Shift+D)' : 'Desativar áudio (Ctrl+Shift+D)'}
        aria-pressed={v.deafened}
        onClick={() => void voice.toggleDeafen()}
      >
        {v.deafened ? <HeadphoneOff size={16} /> : <Headphones size={16} />}
      </button>
      <button className="icon-btn" title="Configurações" onClick={() => ui.openModal((close) => <SettingsModal onClose={close} />)}>
        <Settings size={16} />
      </button>
    </div>
  );
}
