import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Versão web da mesma interface do desktop (sem Electron): `npm run dev:web`.
 * Sem janela nativa: atalhos globais, notificações do sistema e ociosidade não existem
 * (o renderer já trata `window.nox` como opcional). Login Google usa o popup do Firebase.
 */
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  envDir: __dirname,
  plugins: [
    react(),
    {
      name: 'nox-web-html',
      transformIndexHtml: (html, ctx) => {
        const dev = Boolean(ctx.server);
        const policy = [
          "default-src 'self'",
          `script-src 'self'${dev ? " 'unsafe-inline'" : ''} https://apis.google.com`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "media-src 'self' blob: mediastream:",
          "font-src 'self' data:",
          // Firebase, LiveKit (wss), API (https) e popup de login Google
          `connect-src 'self' https: wss:${dev ? ' http://127.0.0.1:* ws://127.0.0.1:*' : ''}`,
          "frame-src https://*.firebaseapp.com https://accounts.google.com",
          "object-src 'none'",
          "base-uri 'none'",
        ].join('; ');
        return html.replace('%NOX_CSP%', policy);
      },
    },
  ],
  server: { port: 5173, host: '127.0.0.1' },
  build: { outDir: resolve(__dirname, 'out/web'), emptyOutDir: true },
});
