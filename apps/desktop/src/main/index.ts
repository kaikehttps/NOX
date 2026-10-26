import { join, resolve } from 'node:path';
import {
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  app,
  globalShortcut,
  ipcMain,
  nativeImage,
  powerMonitor,
  session,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import { IPC, type GlobalShortcutAction } from '../shared/ipc';
import { cancelGoogleSignIn, googleSignIn } from './google-oauth';

const PROTOCOL = 'nox';
const BG = '#050608';
const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
const here = __dirname;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let pendingDeepLink: string | null = null;

/* ───────────── instância única e deep links ───────────── */

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// Em desenvolvimento, só registra nox:// no sistema com opt-in (evita sujar o registro a cada execução).
if (app.isPackaged) {
  app.setAsDefaultProtocolClient(PROTOCOL);
} else if (process.env.NOX_REGISTER_PROTOCOL === '1' && process.argv[1]) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [resolve(process.argv[1])]);
}

function deliverDeepLink(url: string) {
  if (!url.startsWith(`${PROTOCOL}://`)) return;
  if (win && !win.webContents.isLoading()) win.webContents.send(IPC.deepLink, url);
  else pendingDeepLink = url;
  showWindow();
}

app.on('second-instance', (_event, argv) => {
  const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
  if (url) deliverDeepLink(url);
  else showWindow();
});
app.on('open-url', (event, url) => {
  event.preventDefault();
  deliverDeepLink(url);
});

/* ───────────── segurança ───────────── */

const ALLOWED_PERMISSIONS = new Set(['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen', 'display-capture', 'speaker-selection']);

function isAppUrl(url: string): boolean {
  if (devUrl) return url.startsWith(devUrl);
  return url.startsWith('file://');
}

/** IPC só é aceito vindo do frame principal do próprio app. */
function trusted(event: IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame;
  return Boolean(frame && win && event.sender === win.webContents && isAppUrl(frame.url));
}

function isSafeExternal(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:';
  } catch {
    return false;
  }
}

function hardenSession() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(wc === win?.webContents && isAppUrl(details.requestingUrl) && ALLOWED_PERMISSIONS.has(permission));
  });
  ses.setPermissionCheckHandler((wc, permission, origin) => {
    return Boolean(wc && wc === win?.webContents && (isAppUrl(origin) || origin === 'file:///') && ALLOWED_PERMISSIONS.has(permission));
  });
}

/* ───────────── janela ───────────── */

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: 'NOX',
    backgroundColor: BG,
    icon: join(here, '../../build/icon.png'),
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 14, y: 12 } }
      : { titleBarOverlay: { color: BG, symbolColor: '#929B98', height: 36 } }),
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
    },
  });

  win.once('ready-to-show', () => win?.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternal(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());

  win.webContents.on('did-finish-load', () => {
    if (pendingDeepLink) {
      win?.webContents.send(IPC.deepLink, pendingDeepLink);
      pendingDeepLink = null;
    }
  });

  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
        win?.webContents.toggleDevTools();
      }
    });
  }

  // Fechar a janela mantém o NOX na bandeja: a chamada de voz continua.
  win.on('close', (event) => {
    if (!quitting && tray) {
      event.preventDefault();
      win?.hide();
    }
  });
  win.on('closed', () => {
    win = null;
  });

  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(join(here, '../renderer/index.html'));
}

function createTray() {
  const icon = nativeImage.createFromPath(join(here, '../../resources/tray.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('NOX');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir NOX', click: showWindow },
      { type: 'separator' },
      {
        label: 'Sair',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', showWindow);
}

/* ───────────── atalhos globais ───────────── */

const SHORTCUTS: Record<string, GlobalShortcutAction> = {
  'CommandOrControl+Shift+M': 'toggle-mute',
  'CommandOrControl+Shift+D': 'toggle-deafen',
};

function setGlobalShortcuts(enabled: boolean) {
  for (const accel of Object.keys(SHORTCUTS)) globalShortcut.unregister(accel);
  if (!enabled) return;
  for (const [accel, action] of Object.entries(SHORTCUTS)) {
    globalShortcut.register(accel, () => win?.webContents.send(IPC.shortcut, action));
  }
}

/* ───────────── ociosidade (presença "ausente") ───────────── */

function watchIdle() {
  let idle = false;
  const emit = (next: boolean) => {
    if (next === idle) return;
    idle = next;
    win?.webContents.send(IPC.idle, idle);
  };
  setInterval(() => {
    const state = powerMonitor.getSystemIdleState(5 * 60);
    emit(state === 'idle' || state === 'locked');
  }, 15_000).unref();
  powerMonitor.on('lock-screen', () => emit(true));
  powerMonitor.on('unlock-screen', () => emit(false));
}

/* ───────────── IPC ───────────── */

function registerIpc() {
  const handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>) => {
    ipcMain.handle(channel, (event, ...args) => {
      if (!trusted(event)) throw new Error('origem não autorizada');
      return fn(...(args as A));
    });
  };

  handle(IPC.version, () => app.getVersion());
  handle(IPC.googleSignIn, () =>
    googleSignIn(import.meta.env.MAIN_VITE_GOOGLE_DESKTOP_CLIENT_ID ?? '', import.meta.env.MAIN_VITE_GOOGLE_DESKTOP_CLIENT_SECRET),
  );
  handle(IPC.googleCancel, () => cancelGoogleSignIn());
  handle(IPC.openExternal, async (url: unknown) => {
    if (typeof url === 'string' && isSafeExternal(url)) await shell.openExternal(url);
  });
  handle(IPC.notify, (title: unknown, body: unknown) => {
    if (typeof title !== 'string' || typeof body !== 'string' || !Notification.isSupported()) return;
    const n = new Notification({ title: title.slice(0, 120), body: body.slice(0, 300) });
    n.on('click', showWindow);
    n.show();
  });
  handle(IPC.setBadge, (count: unknown) => {
    const n = typeof count === 'number' && count > 0 ? Math.min(999, Math.floor(count)) : 0;
    app.setBadgeCount(n);
    if (process.platform === 'win32' && win && !win.isFocused()) win.flashFrame(n > 0);
  });
  handle(IPC.shortcutsEnabled, (enabled: unknown) => setGlobalShortcuts(enabled === true));
}

/* ───────────── ciclo de vida ───────────── */

app.setAppUserModelId('app.nox.desktop');
if (process.platform !== 'darwin') Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  hardenSession();
  registerIpc();
  createWindow();
  createTray();
  watchIdle();
  setGlobalShortcuts(true);
  const initialLink = process.argv.find((a) => a.startsWith(`${PROTOCOL}://`));
  if (initialLink) pendingDeepLink = initialLink;
});

app.on('activate', () => {
  if (!win) createWindow();
  else showWindow();
});

app.on('before-quit', () => {
  quitting = true;
});

app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
