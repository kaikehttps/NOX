import type { DesktopBridge } from '../shared/ipc';

declare global {
  interface Window {
    nox: DesktopBridge;
  }
}

export {};
