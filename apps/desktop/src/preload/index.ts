import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type DesktopBridge, type GlobalShortcutAction } from '../shared/ipc';

function listen<T>(channel: string, cb: (value: T) => void) {
  const handler = (_e: IpcRendererEvent, value: T) => cb(value);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

// Superfície mínima e tipada. Nenhum acesso direto a ipcRenderer ou Node.js é exposto.
const bridge: DesktopBridge = {
  platform: process.platform as DesktopBridge['platform'],
  version: () => ipcRenderer.invoke(IPC.version),
  googleSignIn: () => ipcRenderer.invoke(IPC.googleSignIn),
  cancelGoogleSignIn: () => ipcRenderer.invoke(IPC.googleCancel),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  notify: (title, body) => ipcRenderer.invoke(IPC.notify, title, body),
  setBadge: (count) => ipcRenderer.invoke(IPC.setBadge, count),
  onIdleChange: (cb) => listen<boolean>(IPC.idle, cb),
  onShortcut: (cb) => listen<GlobalShortcutAction>(IPC.shortcut, cb),
  onDeepLink: (cb) => listen<string>(IPC.deepLink, cb),
  setGlobalShortcutsEnabled: (enabled) => ipcRenderer.invoke(IPC.shortcutsEnabled, enabled),
};

contextBridge.exposeInMainWorld('nox', bridge);
