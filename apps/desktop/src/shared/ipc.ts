/**
 * Contrato de IPC entre o processo principal e o renderer.
 * O renderer só acessa o que o preload expõe em `window.nox` — nunca Node.js.
 */

export interface GoogleTokens {
  idToken: string;
  accessToken: string | null;
}

export type GlobalShortcutAction = 'toggle-mute' | 'toggle-deafen';

export interface DesktopBridge {
  platform: 'win32' | 'darwin' | 'linux';
  version: () => Promise<string>;
  /** Login Google no navegador do sistema (OAuth loopback + PKCE). */
  googleSignIn: () => Promise<GoogleTokens>;
  cancelGoogleSignIn: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  notify: (title: string, body: string) => Promise<void>;
  setBadge: (count: number) => Promise<void>;
  /** Estado de ociosidade do sistema (para presença "ausente"). */
  onIdleChange: (cb: (idle: boolean) => void) => () => void;
  onShortcut: (cb: (action: GlobalShortcutAction) => void) => () => void;
  /** Links nox://invite/<código> recebidos pelo sistema operacional. */
  onDeepLink: (cb: (url: string) => void) => () => void;
  setGlobalShortcutsEnabled: (enabled: boolean) => Promise<void>;
}

export const IPC = {
  version: 'app:version',
  googleSignIn: 'auth:google',
  googleCancel: 'auth:google-cancel',
  openExternal: 'shell:open-external',
  notify: 'app:notify',
  setBadge: 'app:badge',
  idle: 'system:idle',
  shortcut: 'app:shortcut',
  deepLink: 'app:deep-link',
  shortcutsEnabled: 'app:shortcuts-enabled',
} as const;
