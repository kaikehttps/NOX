/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  readonly MAIN_VITE_GOOGLE_DESKTOP_CLIENT_ID?: string;
  readonly MAIN_VITE_GOOGLE_DESKTOP_CLIENT_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
