// Gera os recursos de marca a partir de packages/design-system/src/logo.ts.
// Uso: npm run brand   (Node >= 22.18 — importa TypeScript com remoção de tipos nativa)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import {
  appIconSvg,
  lockupSvg,
  symbolSvg,
  wordmarkSvg,
  SYMBOL,
} from '../packages/design-system/src/logo.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIME = '#B7FF5A';
const INK = '#050608';
const PAPER = '#F0F3F1';

const out = (...p) => path.join(root, ...p);
async function write(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
  console.log('  ✓', path.relative(root, file));
}
const png = (svg, size) => sharp(Buffer.from(svg), { density: 600 }).resize(size, size).png().toBuffer();

console.log('NOX // brand assets');

// SVGs de marca
const assets = out('packages/design-system/assets');
await write(path.join(assets, 'nox-symbol.svg'), symbolSvg({ symbol: LIME }, SYMBOL.tightViewBox));
await write(path.join(assets, 'nox-symbol-mono-light.svg'), symbolSvg({ symbol: PAPER }, SYMBOL.tightViewBox));
await write(path.join(assets, 'nox-symbol-mono-dark.svg'), symbolSvg({ symbol: INK }, SYMBOL.tightViewBox));
await write(path.join(assets, 'nox-wordmark.svg'), wordmarkSvg(PAPER));
await write(path.join(assets, 'nox-wordmark-dark.svg'), wordmarkSvg(INK));
await write(path.join(assets, 'nox-lockup.svg'), lockupSvg({ symbol: LIME, wordmark: PAPER }));
await write(path.join(assets, 'nox-lockup-mono-light.svg'), lockupSvg({ symbol: PAPER, wordmark: PAPER }));
await write(path.join(assets, 'nox-lockup-mono-dark.svg'), lockupSvg({ symbol: INK, wordmark: INK }));
await write(path.join(assets, 'nox-lockup-on-lime.svg'), lockupSvg({ symbol: INK, wordmark: INK, background: LIME }));
await write(path.join(assets, 'nox-app-icon.svg'), appIconSvg());

// Desktop (electron-builder usa build/icon.png e build/icon.ico)
const icon = appIconSvg();
await write(out('apps/desktop/build/icon.png'), await png(icon, 1024));
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
await write(out('apps/desktop/build/icon.ico'), await pngToIco(await Promise.all(icoSizes.map((s) => png(icon, s)))));
await write(out('apps/desktop/src/renderer/public/favicon.svg'), symbolSvg({ symbol: LIME }, SYMBOL.tightViewBox));
await write(out('apps/desktop/resources/tray.png'), await png(symbolSvg({ symbol: PAPER }, SYMBOL.tightViewBox), 32));

// Mobile (Expo)
await write(out('apps/mobile/assets/icon.png'), await png(icon, 1024));
// Ícone adaptativo Android: primeiro plano transparente dentro da zona segura (66%).
const adaptive = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><g transform="translate(24 24) scale(0.5)"><path fill="${LIME}" d="${SYMBOL.left}"/><path fill="${LIME}" d="${SYMBOL.signal}"/><path fill="${LIME}" d="${SYMBOL.right}"/></g></svg>`;
await write(out('apps/mobile/assets/adaptive-icon.png'), await png(adaptive, 1024));
await write(out('apps/mobile/assets/splash-icon.png'), await png(symbolSvg({ symbol: LIME }, SYMBOL.tightViewBox), 512));
// Ícone de notificação Android: branco sobre transparente.
await write(out('apps/mobile/assets/notification-icon.png'), await png(symbolSvg({ symbol: '#FFFFFF' }, SYMBOL.tightViewBox), 96));
await write(out('apps/mobile/assets/favicon.png'), await png(icon, 48));

console.log('pronto.');
