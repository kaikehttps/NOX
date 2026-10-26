import { useEffect, useState, type FormEvent } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { BRAND } from '@nox/shared';
import { authErrorMessage, resetPassword, signInWithEmail, signInWithGoogleIdToken, signUpWithEmail } from '@nox/firebase';
import { NoxSymbol, NoxWordmark } from '../components/Logo';
import { SignalLoader } from '../components/Overlay';
import { client, usingEmulators } from '../lib/nox';

const SEEN_KEY = 'nox.entry.seen';

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z" />
    </svg>
  );
}

export function TitleBarPlain() {
  return (
    <div className="titlebar">
      <span className="path">nox</span>
      <span className="spacer" />
    </div>
  );
}

export function Entry() {
  const firstOpen = !localStorage.getItem(SEEN_KEY);
  const [stage, setStage] = useState<'intro' | 'auth'>(firstOpen ? 'intro' : 'auth');
  const [version, setVersion] = useState('');

  useEffect(() => {
    void window.nox?.version().then(setVersion);
  }, []);

  const enter = () => {
    localStorage.setItem(SEEN_KEY, '1');
    setStage('auth');
  };

  return (
    <div className="entry">
      <TitleBarPlain />
      <div className="entry-center">{stage === 'intro' ? <Intro onEnter={enter} /> : <AuthForm />}</div>
      <div className="entry-foot">
        <span>{BRAND.taglineIntl}</span>
        <span>
          {usingEmulators ? 'EMULADORES LOCAIS · ' : ''}v{version || '0.1.0'}
        </span>
      </div>
    </div>
  );
}

function Intro({ onEnter }: { onEnter: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Enter' && onEnter();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEnter]);

  return (
    <div className="entry-card">
      <div className="entry-mark">
        <NoxSymbol className="symbol" blink />
      </div>
      <div className="terminal-lines">
        <div className="line" style={{ animationDelay: '60ms' }}>
          {BRAND.systemLabel}
        </div>
        <div className="line" style={{ animationDelay: '220ms' }}>
          <span className="ok">✓</span> {BRAND.entry.status}
        </div>
        <div className="line" style={{ animationDelay: '380ms' }}>
          <span className="accent">❯</span> <span className="cursor" style={{ color: 'var(--nox-text)' }}>{BRAND.entry.headline}</span>
        </div>
      </div>
      <button className="btn primary lg block" onClick={onEnter} autoFocus>
        {BRAND.entry.cta}
      </button>
      <p className="hint" style={{ textAlign: 'center', margin: 0 }}>
        {BRAND.tagline}
      </p>
    </div>
  );
}

type Mode = 'signin' | 'signup' | 'reset';

function AuthForm() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'google' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const google = async () => {
    setError(null);
    setBusy('google');
    try {
      if (window.nox) {
        const tokens = await window.nox.googleSignIn();
        await signInWithGoogleIdToken(client(), tokens.idToken, tokens.accessToken ?? undefined);
      } else {
        // Versão web: popup oficial do Firebase (nunca pedimos a senha do Google).
        await signInWithPopup(client().auth, new GoogleAuthProvider());
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy('email');
    try {
      if (mode === 'signin') await signInWithEmail(client(), email, password);
      else if (mode === 'signup') await signUpWithEmail(client(), email, password);
      else {
        await resetPassword(client(), email);
        setNotice('Se houver uma conta com esse e-mail, enviamos um link de redefinição.');
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const title = mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Recuperar senha';

  return (
    <div className="entry-card">
      <div className="entry-mark">
        <NoxSymbol className="symbol" />
        <NoxWordmark className="wordmark" />
      </div>

      <div className="label" style={{ textAlign: 'center' }}>
        {title}
      </div>

      {mode !== 'reset' && (
        <>
          <button className="btn lg block" onClick={google} disabled={busy !== null}>
            {busy === 'google' ? <SignalLoader label="aguardando o navegador" /> : <><GoogleGlyph /> Continuar com Google</>}
          </button>
          {busy === 'google' && window.nox && (
            <button className="link-btn" style={{ justifySelf: 'center' }} onClick={() => void window.nox?.cancelGoogleSignIn()}>
              cancelar
            </button>
          )}
          <div className="divider-text label">ou</div>
        </>
      )}

      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <label className="field">
          <span className="label">e-mail</span>
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== 'reset' && (
          <label className="field">
            <span className="label">senha</span>
            <input
              className="input"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {error && <div className="error-line">{error}</div>}
        {notice && <div className="ok-line">{notice}</div>}
        <button className="btn primary lg block" type="submit" disabled={busy !== null}>
          {busy === 'email' ? <SignalLoader /> : mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link'}
        </button>
      </form>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {mode === 'signin' ? (
          <>
            <button className="link-btn" onClick={() => setMode('signup')}>
              criar conta
            </button>
            <button className="link-btn" onClick={() => setMode('reset')}>
              esqueci a senha
            </button>
          </>
        ) : (
          <button className="link-btn" onClick={() => setMode('signin')}>
            já tenho conta
          </button>
        )}
      </div>
    </div>
  );
}
