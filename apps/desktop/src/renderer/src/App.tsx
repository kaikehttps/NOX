import { useEffect } from 'react';
import type { User } from 'firebase/auth';
import { themeVars } from '@nox/design-system';
import type { UserSettings } from '@nox/shared';
import { DEFAULT_SETTINGS, subscribeSettings } from '@nox/firebase';
import { useAuthUser, useProfile, useSubscription } from '@nox/firebase/react';
import { missingConfig, nox, voice } from './lib/nox';
import { NavProvider, SessionProvider, UiProvider } from './lib/context';
import { DataProvider } from './lib/data';
import { ContextMenu } from './components/Overlay';
import { NoxSymbol } from './components/Logo';
import { Entry, TitleBarPlain } from './screens/Entry';
import { Onboarding } from './screens/Onboarding';
import { Shell } from './shell/Shell';

function applyTheme(settings: UserSettings) {
  const root = document.documentElement;
  const vars = themeVars(settings.theme, settings.theme === 'dark' ? settings.accent : undefined);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.style.setProperty('--nox-font-scale', String(settings.fontScale));
  root.dataset.theme = settings.theme;
  root.dataset.density = settings.density;
  root.dataset.reducedMotion = String(settings.reducedMotion);
  root.dataset.platform = window.nox?.platform ?? 'web';
}

// Tema padrão aplicado antes do primeiro render: nenhuma tela pisca em branco.
applyTheme(DEFAULT_SETTINGS);

function Boot() {
  return (
    <div className="entry">
      <TitleBarPlain />
      <div className="entry-center">
        <NoxSymbol className="symbol" blink />
      </div>
      <div />
    </div>
  );
}

function ConfigMissing() {
  return (
    <div className="entry">
      <TitleBarPlain />
      <div className="entry-center">
        <div className="entry-card">
          <div className="terminal-lines">
            <div className="line">NOX // CONFIGURAÇÃO</div>
            <div className="line danger-text">✕ variáveis ausentes em apps/desktop/.env:</div>
            {missingConfig.map((k) => (
              <div key={k} className="line">
                {'  '}- {k}
              </div>
            ))}
            <div className="line">❯ copie .env.example ou defina VITE_USE_EMULATORS=true</div>
          </div>
        </div>
      </div>
      <div />
    </div>
  );
}

function SignedIn({ user }: { user: User }) {
  const c = nox!;
  const profile = useProfile(c, user.uid);
  const settings = useSubscription<UserSettings>((emit) => subscribeSettings(c, user.uid, emit), [user.uid]);

  useEffect(() => {
    if (settings.data) applyTheme(settings.data);
  }, [settings.data]);

  if (profile === undefined) return <Boot />;
  if (profile === null) return <Onboarding user={user} />;

  return (
    <SessionProvider user={user} profile={profile} settings={settings.data ?? DEFAULT_SETTINGS}>
      <NavProvider>
        <UiProvider
          renderLayer={(state, api) => (
            <>
              {state.modal ? state.modal(api.closeModal) : null}
              {state.menu ? <ContextMenu x={state.menu.x} y={state.menu.y} entries={state.menu.entries} onDismiss={api.dismissMenu} /> : null}
              <div className="toasts" role="status">
                {state.toasts.map((t) => (
                  <div key={t.id} className={`toast ${t.kind}`}>
                    {t.text}
                  </div>
                ))}
              </div>
            </>
          )}
        >
          <DataProvider>
            <Shell />
          </DataProvider>
        </UiProvider>
      </NavProvider>
    </SessionProvider>
  );
}

export function App() {
  if (!nox) return <ConfigMissing />;
  return <AuthGate />;
}

function AuthGate() {
  const { user, loading } = useAuthUser(nox!);

  // Ao sair da conta, encerra a chamada e libera o microfone.
  useEffect(() => {
    if (!user) void voice.leave();
  }, [user]);

  if (loading) return <Boot />;
  if (!user) return <Entry />;
  return <SignedIn key={user.uid} user={user} />;
}
