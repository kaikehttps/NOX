import { useEffect, useRef, useState } from 'react';
import { ACCENT_PRESETS } from '@nox/design-system';
import { LIMITS } from '@nox/shared';
import { signOut, updateProfile } from '@nox/firebase';
import { resetSharedStores } from '@nox/firebase/react';
import { listAudioDevices } from '@nox/realtime';
import { MicrophoneTest } from '@nox/realtime/web';
import { Avatar } from '../components/Avatar';
import { Modal, SignalLoader, Switch } from '../components/Overlay';
import { errorText, useSession, useUi, useVoice } from '../lib/context';
import { client, voice } from '../lib/nox';
import { PTT_KEY_STORAGE, pttKey } from '../shell/Voice';

type Tab = 'perfil' | 'voz' | 'aparencia' | 'privacidade' | 'conta';

const TABS: { id: Tab; label: string }[] = [
  { id: 'perfil', label: 'perfil' },
  { id: 'voz', label: 'voz e áudio' },
  { id: 'aparencia', label: 'aparência' },
  { id: 'privacidade', label: 'privacidade' },
  { id: 'conta', label: 'conta' },
];

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('perfil');
  return (
    <Modal label="configurações" onClose={onClose} wide>
      <div className="settings">
        <nav className="settings-nav">
          {TABS.map((t) => (
            <button key={t.id} className={`nav-item${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="settings-pane">
          {tab === 'perfil' && <ProfilePane />}
          {tab === 'voz' && <VoicePane />}
          {tab === 'aparencia' && <AppearancePane />}
          {tab === 'privacidade' && <PrivacyPane />}
          {tab === 'conta' && <AccountPane onClose={onClose} />}
        </div>
      </div>
    </Modal>
  );
}

function ProfilePane() {
  const { profile, uid } = useSession();
  const ui = useUi();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [busy, setBusy] = useState(false);
  const dirty = displayName !== profile.displayName || bio !== profile.bio;

  const save = async () => {
    setBusy(true);
    try {
      await updateProfile(client(), uid, { displayName: displayName.trim(), bio });
      ui.toast('Perfil salvo.');
    } catch (err) {
      ui.toast(errorText(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h3>Perfil</h3>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <Avatar profile={{ ...profile, displayName }} size={64} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 'var(--nox-fs-title)' }}>{displayName || '…'}</div>
          <div className="mono faint">@{profile.username}</div>
        </div>
      </div>
      <label className="field">
        <span className="label">nome de exibição</span>
        <input className="input" value={displayName} maxLength={LIMITS.displayName.max} onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">sobre</span>
        <textarea className="input" rows={3} value={bio} maxLength={LIMITS.bio.max} onChange={(e) => setBio(e.target.value)} />
        <span className="hint">
          {bio.length}/{LIMITS.bio.max}
        </span>
      </label>
      <p className="hint" style={{ margin: 0 }}>
        Envio de avatar personalizado chega com o suporte a anexos (Fase 2). Contas Google usam a foto do Google.
      </p>
      <div>
        <button className="btn primary" disabled={!dirty || busy || !displayName.trim()} onClick={save}>
          {busy ? <SignalLoader /> : 'Salvar perfil'}
        </button>
      </div>
    </>
  );
}

function VoicePane() {
  const v = useVoice();
  const s = v.settings;
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [key, setKey] = useState(pttKey());
  const test = useRef<MicrophoneTest | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setInputs(await listAudioDevices('audioinput', false));
        setOutputs(await listAudioDevices('audiooutput', false));
      } catch {
        /* sem permissão ainda */
      }
    };
    void load();
    navigator.mediaDevices.addEventListener('devicechange', load);
    return () => navigator.mediaDevices.removeEventListener('devicechange', load);
  }, [testing]);

  // Teste de microfone com as mesmas opções de processamento da chamada.
  useEffect(() => {
    if (!testing) return;
    const t = new MicrophoneTest();
    test.current = t;
    let raf = 0;
    t.start({ deviceId: s.inputDeviceId, echoCancellation: s.echoCancellation, noiseSuppression: s.noiseSuppression, autoGainControl: s.autoGainControl })
      .then(() => {
        const loop = () => {
          setLevel(t.level());
          raf = requestAnimationFrame(loop);
        };
        loop();
      })
      .catch((err) => {
        setTestError((err as Error).name === 'NotAllowedError' ? 'Permissão de microfone negada.' : 'Não foi possível abrir o microfone.');
        setTesting(false);
      });
    return () => {
      cancelAnimationFrame(raf);
      void t.stop();
      setLevel(0);
    };
  }, [testing, s.inputDeviceId, s.echoCancellation, s.noiseSuppression, s.autoGainControl]);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code !== 'Escape') {
        localStorage.setItem(PTT_KEY_STORAGE, e.code);
        setKey(e.code);
      }
      setCapturing(false);
    };
    window.addEventListener('keydown', onKey, { capture: true, once: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [capturing]);

  return (
    <>
      <h3>Voz e áudio</h3>
      <div className="settings-group">
        <label className="field">
          <span className="label">microfone</span>
          <select className="input" value={s.inputDeviceId ?? ''} onChange={(e) => void voice.updateSettings({ inputDeviceId: e.target.value || null })}>
            <option value="">padrão do sistema</option>
            {inputs.filter((d) => d.deviceId && d.deviceId !== 'default').map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'microfone'}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">saída de áudio</span>
          <select className="input" value={s.outputDeviceId ?? ''} onChange={(e) => void voice.updateSettings({ outputDeviceId: e.target.value || null })}>
            <option value="">padrão do sistema</option>
            {outputs.filter((d) => d.deviceId && d.deviceId !== 'default').map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'saída'}
              </option>
            ))}
          </select>
        </label>
        {inputs.every((d) => !d.label) && <span className="hint">Os nomes dos dispositivos aparecem após conceder acesso ao microfone (faça o teste abaixo).</span>}
      </div>

      <div className="settings-group">
        <span className="label">teste de microfone</span>
        <div className="mic-meter" aria-label="nível do microfone">
          <i style={{ width: `${Math.round(level * 100)}%` }} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn" onClick={() => setTesting((t) => !t)}>
            {testing ? 'Parar teste' : 'Testar microfone'}
          </button>
          <span className="hint">Fale normalmente: a barra deve se mover. Nada é gravado ou enviado.</span>
        </div>
        {testError && <div className="error-line">{testError}</div>}
      </div>

      <div className="settings-group">
        <span className="label">processamento (WebRTC)</span>
        <div className="toggle">
          <span>Cancelamento de eco</span>
          <Switch label="Cancelamento de eco" checked={s.echoCancellation} onChange={(x) => void voice.updateSettings({ echoCancellation: x })} />
        </div>
        <div className="toggle">
          <span>Redução de ruído</span>
          <Switch label="Redução de ruído" checked={s.noiseSuppression} onChange={(x) => void voice.updateSettings({ noiseSuppression: x })} />
        </div>
        <div className="toggle" style={{ borderBottom: 0 }}>
          <span>Ganho automático</span>
          <Switch label="Ganho automático" checked={s.autoGainControl} onChange={(x) => void voice.updateSettings({ autoGainControl: x })} />
        </div>
      </div>

      <div className="settings-group">
        <span className="label">modo de entrada</span>
        <div className="segmented" style={{ justifySelf: 'start' }}>
          <button aria-pressed={s.mode === 'voice-activity'} onClick={() => void voice.updateSettings({ mode: 'voice-activity' })}>
            detecção de voz
          </button>
          <button aria-pressed={s.mode === 'push-to-talk'} onClick={() => void voice.updateSettings({ mode: 'push-to-talk' })}>
            push-to-talk
          </button>
        </div>
        {s.mode === 'push-to-talk' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="muted">Tecla:</span>
            <button className="btn" onClick={() => setCapturing(true)}>
              {capturing ? 'pressione uma tecla…' : <span className="mono">{key}</span>}
            </button>
            <span className="hint">Funciona com a janela do NOX em foco.</span>
          </div>
        )}
        <span className="hint">Atalhos globais: Ctrl+Shift+M (microfone) · Ctrl+Shift+D (áudio).</span>
      </div>
    </>
  );
}

function AppearancePane() {
  const { settings, updateSettings } = useSession();
  return (
    <>
      <h3>Aparência</h3>
      <div className="settings-group">
        <span className="label">tema</span>
        <div className="segmented" style={{ justifySelf: 'start' }}>
          <button aria-pressed={settings.theme === 'dark'} onClick={() => updateSettings({ theme: 'dark' })}>
            escuro
          </button>
          <button aria-pressed={settings.theme === 'light'} onClick={() => updateSettings({ theme: 'light' })}>
            claro
          </button>
        </div>
      </div>
      <div className="settings-group">
        <span className="label">cor de destaque {settings.theme === 'light' && '(apenas no tema escuro)'}</span>
        <div className="swatches">
          {ACCENT_PRESETS.map((c) => (
            <button key={c} className="swatch" style={{ background: c }} aria-pressed={settings.accent === c} aria-label={c} onClick={() => updateSettings({ accent: c })} />
          ))}
        </div>
      </div>
      <div className="settings-group">
        <span className="label">tamanho do texto — {Math.round(settings.fontScale * 100)}%</span>
        <input type="range" min={0.85} max={1.3} step={0.05} value={settings.fontScale} onChange={(e) => updateSettings({ fontScale: Number(e.target.value) })} />
      </div>
      <div className="settings-group">
        <span className="label">densidade</span>
        <div className="segmented" style={{ justifySelf: 'start' }}>
          <button aria-pressed={settings.density === 'cozy'} onClick={() => updateSettings({ density: 'cozy' })}>
            confortável
          </button>
          <button aria-pressed={settings.density === 'compact'} onClick={() => updateSettings({ density: 'compact' })}>
            compacta
          </button>
        </div>
        <div className="toggle" style={{ borderBottom: 0 }}>
          <span>Reduzir animações</span>
          <Switch label="Reduzir animações" checked={settings.reducedMotion} onChange={(x) => updateSettings({ reducedMotion: x })} />
        </div>
      </div>
    </>
  );
}

function PrivacyPane() {
  const { settings, updateSettings } = useSession();
  const [shortcuts, setShortcuts] = useState(() => localStorage.getItem('nox.shortcuts.global') !== 'false');
  return (
    <>
      <h3>Privacidade</h3>
      <div className="settings-group">
        <div className="toggle">
          <span>
            Receber solicitações de amizade
            <span className="hint" style={{ display: 'block' }}>
              Desligado, ninguém consegue te adicionar (quem tentar não é avisado).
            </span>
          </span>
          <Switch label="Receber solicitações" checked={settings.allowFriendRequests} onChange={(x) => updateSettings({ allowFriendRequests: x })} />
        </div>
        <div className="toggle" style={{ borderBottom: 0 }}>
          <span>
            Atalhos globais de voz
            <span className="hint" style={{ display: 'block' }}>
              Ctrl+Shift+M e Ctrl+Shift+D funcionando com o NOX em segundo plano.
            </span>
          </span>
          <Switch
            label="Atalhos globais"
            checked={shortcuts}
            onChange={(x) => {
              setShortcuts(x);
              localStorage.setItem('nox.shortcuts.global', String(x));
              void window.nox?.setGlobalShortcutsEnabled(x);
            }}
          />
        </div>
      </div>
      <div className="settings-group">
        <span className="label">o que o nox usa</span>
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Microfone: somente durante chamadas e no teste acima. Silenciado, o dispositivo não transmite.</li>
          <li>Áudio das chamadas trafega pelo LiveKit (WebRTC, criptografado em trânsito). Não é gravado.</li>
          <li>Mensagens ficam no Firebase (Google Cloud), acessíveis apenas aos participantes.</li>
          <li>Status “invisível” aparece como offline para todos.</li>
        </ul>
      </div>
    </>
  );
}

function AccountPane({ onClose }: { onClose: () => void }) {
  const { user, profile } = useSession();
  const ui = useUi();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logout = async () => {
    onClose();
    await voice.leave();
    resetSharedStores();
    await signOut(client());
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await voice.leave();
      await client().api.deleteAccount();
      resetSharedStores();
      await signOut(client()).catch(() => undefined);
      ui.toast('Conta excluída.');
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <>
      <h3>Conta</h3>
      <div className="settings-group">
        <span className="label">e-mail</span>
        <span className="mono">{user.email ?? '—'}</span>
        <span className="label">login</span>
        <span className="mono">{user.providerData.map((p) => (p.providerId === 'google.com' ? 'google' : 'e-mail e senha')).join(', ')}</span>
        <div>
          <button className="btn" onClick={() => void logout()}>
            Sair da conta
          </button>
        </div>
      </div>
      <div className="settings-group" style={{ borderColor: 'color-mix(in srgb, var(--nox-danger) 40%, transparent)' }}>
        <span className="label danger-text">excluir conta</span>
        <p className="muted" style={{ margin: 0 }}>
          Remove perfil, amizades, participação em comunidades e espaços que só você usa. Mensagens enviadas continuam visíveis para os outros
          participantes como “conta removida”. Digite <b className="mono">@{profile.username}</b> para confirmar.
        </p>
        <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error && <div className="error-line">{error}</div>}
        <div>
          <button className="btn danger" disabled={busy || confirm !== `@${profile.username}`} onClick={remove}>
            {busy ? <SignalLoader /> : 'Excluir conta permanentemente'}
          </button>
        </div>
      </div>
    </>
  );
}
