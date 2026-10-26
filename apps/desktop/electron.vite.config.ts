import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { defineConfig as defineElectronConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

/**
 * Content Security Policy do renderer. Scripts só do próprio app; conexões apenas
 * por HTTPS/WSS (Firebase, LiveKit, API) e, em desenvolvimento, aos emuladores locais.
 */
function csp(): Plugin {
  return {
    name: 'nox-csp',
    transformIndexHtml(html, ctx) {
      const dev = Boolean(ctx.server);
      const policy = [
        "default-src 'self'",
        `script-src 'self'${dev ? " 'unsafe-inline'" : ''}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "media-src 'self' blob: mediastream:",
        "font-src 'self' data:",
        `connect-src 'self' https: wss:${dev ? ' http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:*' : ' http://127.0.0.1:* ws://127.0.0.1:*'}`,
        "object-src 'none'",
        "base-uri 'none'",
        "frame-src 'none'",
        "form-action 'none'",
      ].join('; ');
      return html.replace('%NOX_CSP%', policy);
    },
  };
}

export default defineElectronConfig({
  main: {
    build: {
      rollupOptions: {
        // CommonJS: garante que `electron` resolva para o módulo interno, não para o pacote npm.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        // Preloads com sandbox precisam ser CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: defineConfig({
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), csp()],
    build: {
      // Bundle menor = inicialização mais rápida (Firebase e LiveKit são grandes).
      minify: true,
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  }),
});
