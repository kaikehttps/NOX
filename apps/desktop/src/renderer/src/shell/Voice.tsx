import { memo, useEffect, useMemo, useRef } from 'react';
import { Headphones, HeadphoneOff, Mic, MicOff, PhoneOff, Volume2, WifiOff } from 'lucide-react';
import type { Channel, Community, Conversation, VoiceRoomRef, VoiceState } from '@nox/shared';
import { sameVoiceRoom } from '@nox/shared';
import type { VoiceParticipant, VoiceSnapshot } from '@nox/realtime';
import { subscribeChannels, subscribeCommunity, subscribeConversation } from '@nox/firebase';
import { useProfiles, useSubscription } from '@nox/firebase/react';
import { Avatar } from '../components/Avatar';
import { SignalLoader } from '../components/Overlay';
import { errorText, useNav, useSession, useUi, useVoice } from '../lib/context';
import { client, voice } from '../lib/nox';
import { conversationTitle } from './HomeSidebar';

export const STATE_LABEL: Record<VoiceSnapshot['state'], string> = {
  idle: 'desconectado',
  connecting: 'conectando',
  connected: 'voz conectada',
  reconnecting: 'reconectando',
  disconnected: 'desconectado',
  failed: 'falha na conexão',
};

const QUALITY_BARS: Record<VoiceParticipant['quality'], number> = { excellent: 3, good: 2, poor: 1, lost: 0, unknown: 0 };

/* ───────────── atalhos ───────────── */

export const PTT_KEY_STORAGE = 'nox.ptt.key';
export const pttKey = () => localStorage.getItem(PTT_KEY_STORAGE) || 'Backquote';

export function useVoiceShortcuts() {
  useEffect(() => {
    void window.nox?.setGlobalShortcutsEnabled(localStorage.getItem('nox.shortcuts.global') !== 'false');
    const offGlobal = window.nox?.onShortcut((action) => {
      if (action === 'toggle-mute') void voice.toggleMute();
      if (action === 'toggle-deafen') void voice.toggleDeafen();
    });
    const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
    const down = (e: KeyboardEvent) => {
      if (e.code !== pttKey() || e.repeat || editable(e.target)) return;
      if (voice.getSnapshot().settings.mode !== 'push-to-talk') return;
      e.preventDefault();
      void voice.pushToTalk(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === pttKey()) void voice.pushToTalk(false);
    };
    // Soltar a tecla fora da janela não pode deixar o microfone aberto.
    const blur = () => void voice.pushToTalk(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      offGlobal?.();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
}

/* ───────────── medidor de nível (sem re-render por quadro) ───────────── */

export const LevelBars = memo(function LevelBars({ identity, bars = 4 }: { identity: string; bars?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 66) return; // ~15 fps é suficiente para um medidor
      last = t;
      const level = voice.getAudioLevel(identity);
      const el = ref.current;
      if (!el) return;
      el.childNodes.forEach((node, i) => {
        const threshold = (i + 1) / (bars + 1);
        const on = level * 1.4 >= threshold * 0.6;
        (node as HTMLElement).style.height = on ? `${30 + 70 * Math.min(1, level * 1.6 - i * 0.12)}%` : '18%';
        (node as HTMLElement).style.opacity = on ? '1' : '0.3';
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [identity, bars]);
  return (
    <span ref={ref} className="level-bars" aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <i key={i} style={{ height: '18%' }} />
      ))}
    </span>
  );
});

/* ───────────── nome do local da chamada ───────────── */

function useVoiceLocation(ref: VoiceRoomRef | null): string {
  const { uid } = useSession();
  const community = useSubscription<Community | null>(
    ref?.kind === 'channel' ? (emit) => subscribeCommunity(client(), ref.communityId, emit) : null,
    [ref?.kind === 'channel' ? ref.communityId : null],
  );
  const channels = useSubscription<Channel[]>(
    ref?.kind === 'channel' ? (emit) => subscribeChannels(client(), ref.communityId, emit) : null,
    [ref?.kind === 'channel' ? ref.communityId : null],
  );
  const conv = useSubscription<Conversation | null>(
    ref?.kind === 'conversation' ? (emit) => subscribeConversation(client(), ref.conversationId, emit) : null,
    [ref?.kind === 'conversation' ? ref.conversationId : null],
  );
  const profiles = useProfiles(client(), conv.data?.memberIds ?? []);
  if (!ref) return '';
  if (ref.kind === 'channel') {
    const ch = channels.data?.find((c) => c.id === ref.channelId);
    return `${community.data?.name ?? '…'} / ${ch?.name ?? '…'}`;
  }
  return conv.data ? conversationTitle(conv.data, uid, profiles) : '…';
}

/* ───────────── dock persistente ───────────── */

export function VoiceDock() {
  const v = useVoice();
  const { go } = useNav();
  const where = useVoiceLocation(v.ref);
  if (v.state === 'idle') return null;

  const openRoom = () => {
    if (!v.ref) return;
    if (v.ref.kind === 'channel') go({ kind: 'community', communityId: v.ref.communityId, channelId: v.ref.channelId });
    else go({ kind: 'conversation', conversationId: v.ref.conversationId });
  };

  return (
    <div className="voice-dock" aria-live="polite">
      <div className={`status ${v.state}`}>
        {v.state === 'connecting' || v.state === 'reconnecting' ? <SignalLoader /> : v.state === 'connected' ? <span>●</span> : <WifiOff size={13} />}
        <span>{STATE_LABEL[v.state]}</span>
        {v.state === 'reconnecting' && v.reconnectAttempt > 0 && <span className="faint">#{v.reconnectAttempt}</span>}
      </div>
      <button className="where truncate" onClick={openRoom} title="Ir para a sala">
        {where}
      </button>
      {v.error && <div className="error-line">{v.error}</div>}
      {v.audioBlocked && (
        <button className="btn block" onClick={() => void voice.resumeAudio()}>
          <Volume2 size={14} /> Ativar áudio
        </button>
      )}
      <div className="controls">
        {v.state === 'failed' || v.state === 'disconnected' ? (
          <>
            {v.ref && (
              <button className="btn block" onClick={() => v.ref && void voice.join(v.ref)}>
                Tentar novamente
              </button>
            )}
            <button className="icon-btn leave" title="Fechar" onClick={() => void voice.leave()}>
              <PhoneOff size={15} />
            </button>
          </>
        ) : (
          <>
            <button className={`icon-btn${v.muted ? ' alert' : ''}`} onClick={() => void voice.toggleMute()} title="Microfone" aria-pressed={v.muted}>
              {v.muted ? <MicOff size={15} /> : <Mic size={15} />}
            </button>
            <button className={`icon-btn${v.deafened ? ' alert' : ''}`} onClick={() => void voice.toggleDeafen()} title="Áudio" aria-pressed={v.deafened}>
              {v.deafened ? <HeadphoneOff size={15} /> : <Headphones size={15} />}
            </button>
            <button className="icon-btn leave" onClick={() => void voice.leave()} title="Sair da chamada">
              <PhoneOff size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────── palco da sala ───────────── */

function Tile({ p, onMenu }: { p: VoiceParticipant; onMenu: (e: React.MouseEvent, p: VoiceParticipant) => void }) {
  const profiles = useProfiles(client(), [p.identity]);
  const profile = profiles[p.identity];
  const q = QUALITY_BARS[p.quality];
  return (
    <div className={`tile${p.isSpeaking && p.micEnabled ? ' speaking' : ''}`} onContextMenu={(e) => onMenu(e, p)}>
      <span className="tile-quality" title={`conexão: ${p.quality}`}>
        <span className="level-bars" style={{ height: 10 }}>
          {[1, 2, 3].map((i) => (
            <i key={i} style={{ height: `${i * 33}%`, opacity: i <= q ? 1 : 0.2, background: q <= 1 ? 'var(--nox-warning)' : undefined }} />
          ))}
        </span>
      </span>
      <Avatar profile={profile ?? { uid: p.identity, displayName: p.name, avatarUrl: null }} size={64} speaking={p.isSpeaking && p.micEnabled} />
      <span className="tile-flags">{!p.micEnabled && <MicOff size={14} />}</span>
      <span className="tile-name">
        {p.micEnabled && <LevelBars identity={p.identity} bars={3} />}
        <span className="truncate">{profile?.displayName ?? p.name}</span>
        {p.isLocal && <span className="label">você</span>}
        {!p.isLocal && p.volume < 1 && <span className="label">{Math.round(p.volume * 100)}%</span>}
      </span>
    </div>
  );
}

export function VoiceStage(props: { roomRef: VoiceRoomRef; title: string; occupants: VoiceState[]; canConnect: boolean }) {
  const v = useVoice();
  const ui = useUi();
  const sameRoom = sameVoiceRoom(v.ref, props.roomRef);
  const here = sameRoom && (v.state === 'connecting' || v.state === 'connected' || v.state === 'reconnecting');
  const lastError = sameRoom && (v.state === 'failed' || v.state === 'disconnected') ? v.error : null;
  const occupantIds = useMemo(() => props.occupants.map((o) => o.uid), [props.occupants]);
  const occupantProfiles = useProfiles(client(), occupantIds);

  const join = async () => {
    try {
      await voice.join(props.roomRef);
      const s = voice.getSnapshot();
      if (s.state === 'failed' && s.error) ui.toast(s.error, 'error');
    } catch (err) {
      ui.toast(errorText(err), 'error');
    }
  };

  const participantMenu = (e: React.MouseEvent, p: VoiceParticipant) => {
    e.preventDefault();
    if (p.isLocal) return;
    ui.openMenu({ x: e.clientX, y: e.clientY }, [
      ...[1, 0.75, 0.5, 0.25, 0].map((vol) => ({
        label: vol === 0 ? 'Silenciar para mim' : `Volume ${vol * 100}%`,
        hint: Math.abs(p.volume - vol) < 0.01 ? 'atual' : undefined,
        onSelect: () => voice.setParticipantVolume(p.identity, vol),
      })),
    ]);
  };

  if (!here) {
    return (
      <div className="voice-stage">
        <div className="stage-head">
          <span className="label">sala de voz</span>
          <span className="chip">{props.occupants.length} conectados</span>
        </div>
        <div className="stage-join">
          <h2 style={{ margin: 0 }}>{props.title}</h2>
          {props.occupants.length > 0 ? (
            <div style={{ display: 'flex', gap: 6 }}>
              {props.occupants.slice(0, 8).map((o) => (
                <Avatar key={o.uid} profile={occupantProfiles[o.uid]} size={36} fallbackSeed={o.uid} />
              ))}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Ninguém na sala ainda. Entre e chame o grupo.
            </p>
          )}
          {lastError && <div className="error-line">{lastError}</div>}
          <button className="btn primary lg" disabled={!props.canConnect} onClick={join}>
            <Headphones size={16} /> {lastError ? 'Tentar novamente' : 'Entrar na sala'}
          </button>
          {!props.canConnect && <span className="hint">Você não tem permissão para conectar neste canal.</span>}
        </div>
        <div />
      </div>
    );
  }

  return (
    <div className="voice-stage">
      <div className="stage-head">
        <span className={`chip ${v.state === 'connected' ? 'live' : v.state === 'failed' ? 'bad' : 'warn'}`}>{STATE_LABEL[v.state]}</span>
        <span className="label">{v.participants.length} na sala</span>
        {v.settings.mode === 'push-to-talk' && (
          <span className={`chip${v.pttActive ? ' live' : ''}`}>
            push-to-talk · <span className="kbd">{pttKey().replace('Key', '')}</span>
          </span>
        )}
      </div>
      {v.state === 'connecting' ? (
        <div className="stage-join">
          <SignalLoader label="estabelecendo conexão" />
        </div>
      ) : (
        <div className="tiles">
          {v.participants.map((p) => (
            <Tile key={p.identity} p={p} onMenu={participantMenu} />
          ))}
        </div>
      )}
      <div className="stage-controls">
        {v.audioBlocked && (
          <button className="btn" onClick={() => void voice.resumeAudio()}>
            <Volume2 size={15} /> Ativar áudio
          </button>
        )}
        <button className={`btn${v.muted ? ' danger' : ''}`} onClick={() => void voice.toggleMute()} title="Microfone (Ctrl+Shift+M)">
          {v.muted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        <button className={`btn${v.deafened ? ' danger' : ''}`} onClick={() => void voice.toggleDeafen()} title="Áudio (Ctrl+Shift+D)">
          {v.deafened ? <HeadphoneOff size={16} /> : <Headphones size={16} />}
        </button>
        <button className="btn danger" onClick={() => void voice.leave()}>
          <PhoneOff size={16} /> Sair
        </button>
      </div>
    </div>
  );
}
