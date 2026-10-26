import { useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { createProfile, isUsernameAvailable, signOut } from '@nox/firebase';
import { usernameSchema, firstIssue } from '@nox/validation';
import { NoxSymbol } from '../components/Logo';
import { SignalLoader } from '../components/Overlay';
import { client } from '../lib/nox';
import { TitleBarPlain } from './Entry';

function suggestUsername(user: User): string {
  const base = (user.displayName || user.email?.split('@')[0] || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9_.]+/g, '')
    .slice(0, 20);
  return base.length >= 3 ? base : '';
}

type Availability = 'idle' | 'checking' | 'free' | 'taken' | 'invalid';

/** Configuração inicial curta: nome de usuário e nome de exibição em uma única tela. */
export function Onboarding({ user }: { user: User }) {
  const [username, setUsername] = useState(() => suggestUsername(user));
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [availability, setAvailability] = useState<Availability>('idle');
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const parsed = usernameSchema.safeParse(username);
    if (!username) {
      setAvailability('idle');
      setHint(null);
      return;
    }
    if (!parsed.success) {
      setAvailability('invalid');
      setHint(firstIssue(parsed.error));
      return;
    }
    setAvailability('checking');
    setHint(null);
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const free = await isUsernameAvailable(client(), parsed.data);
        if (alive) setAvailability(free ? 'free' : 'taken');
      } catch {
        if (alive) setAvailability('idle');
      }
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [username]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await createProfile(client(), user.uid, {
        username,
        displayName: displayName || username,
        avatarUrl: user.photoURL,
      });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="entry">
      <TitleBarPlain />
      <div className="entry-center">
        <form className="entry-card" onSubmit={submit}>
          <div className="entry-mark">
            <NoxSymbol className="symbol" />
          </div>
          <div className="terminal-lines">
            <div className="line">
              <span className="ok">✓</span> sessão autenticada · {user.email}
            </div>
            <div className="line" style={{ animationDelay: '120ms' }}>
              <span className="accent">❯</span> configure sua identidade<span className="cursor" />
            </div>
          </div>

          <label className="field">
            <span className="label">nome de usuário</span>
            <div className="input-prefix">
              <span>@</span>
              <input
                className="input"
                autoFocus
                value={username}
                maxLength={24}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/^@/, ''))}
                placeholder="seu.nome"
              />
            </div>
            {availability === 'checking' && <span className="hint mono">verificando…</span>}
            {availability === 'free' && <span className="ok-line">disponível</span>}
            {availability === 'taken' && <span className="error-line">já está em uso</span>}
            {availability === 'invalid' && hint && <span className="error-line">{hint}</span>}
            {availability === 'idle' && <span className="hint">É como seus amigos vão te encontrar. Não pode ser alterado depois.</span>}
          </label>

          <label className="field">
            <span className="label">nome de exibição</span>
            <input className="input" value={displayName} maxLength={48} onChange={(e) => setDisplayName(e.target.value)} placeholder="Como você aparece nas conversas" />
          </label>

          {error && <div className="error-line">{error}</div>}

          <button className="btn primary lg block" type="submit" disabled={busy || availability !== 'free'}>
            {busy ? <SignalLoader /> : 'Concluir'}
          </button>
          <button type="button" className="link-btn" style={{ justifySelf: 'center' }} onClick={() => void signOut(client())}>
            sair desta conta
          </button>
        </form>
      </div>
      <div className="entry-foot">
        <span>NOX // IDENTIDADE</span>
        <span>1/1</span>
      </div>
    </div>
  );
}
