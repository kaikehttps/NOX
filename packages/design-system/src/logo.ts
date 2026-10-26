/**
 * Geometria da marca NOX.
 *
 * Símbolo: duas metades em "L" escalonadas, com simetria rotacional de 180°,
 * formam um N. O espaço negativo entre elas desenha uma passagem em degraus
 * (o portal) e o bloco central flutuante é o sinal: lido ao mesmo tempo como
 * cursor de terminal e como barra de frequência. Os chanfros superior-esquerdo e
 * inferior-direito se repetem no wordmark.
 *
 * O bloco central (`SYMBOL.signal`) é animável: na interface ele pisca como cursor
 * durante a conexão e oscila como medidor de voz.
 */

export const SYMBOL = {
  viewBox: '0 0 96 96',
  /** Recorte justo, sem margem, para uso inline na interface. */
  tightViewBox: '13 13 70 70',
  left: 'M15 25 25 15H40V47H29V81H15Z',
  signal: 'M44 31H52V65H44Z',
  right: 'M81 71 71 81H56V49H67V15H81Z',
  /** Retângulo do sinal, para animações que alteram altura. */
  signalRect: { x: 44, y: 31, width: 8, height: 34 },
} as const;

export const SYMBOL_PATHS = [SYMBOL.left, SYMBOL.signal, SYMBOL.right] as const;

/** Wordmark desenhado em grade: altura 32, haste 7, chanfro 6, largura 28, espaçamento 16. */
const H = 32;
const S = 7;
const C = 6;
const W = 28;
const T = 16;

const letterN = (x: number) =>
  `M${x} ${H}V${C}L${x + C} 0H${x + S + 2}L${x + W - S} ${H - 12}V0H${x + W}V${H - C}L${x + W - C} ${H}H${x + W - S - 2}L${x + S} 12V${H}Z`;

const letterO = (x: number) =>
  `M${x + C} 0H${x + W}V${H - C}L${x + W - C} ${H}H${x}V${C}Z M${x + S} ${S}V${H - S}H${x + W - S}V${S}Z`;

const letterX = (x: number) => {
  const m = x + W / 2;
  const d = 4.2;
  return `M${x} 0H${x + S + 1}L${m} ${H / 2 - d}L${x + W - S - 1} 0H${x + W}L${m + d + 1.5} ${H / 2}L${x + W} ${H}H${x + W - S - 1}L${m} ${H / 2 + d}L${x + S + 1} ${H}H${x}L${m - d - 1.5} ${H / 2}Z`;
};

export const WORDMARK = {
  width: 3 * W + 2 * T,
  height: H,
  viewBox: `0 0 ${3 * W + 2 * T} ${H}`,
  paths: [letterN(0), letterO(W + T), letterX(2 * (W + T))],
  /** O "O" contém contraforma: renderize com fill-rule evenodd. */
  fillRule: 'evenodd' as const,
} as const;

/** Lockup horizontal: símbolo + wordmark alinhados pelo centro óptico. */
export const LOCKUP = {
  viewBox: '13 13 222 70',
  wordmarkTransform: { x: 104, y: 31, scale: 1.06 },
} as const;

export interface SvgColors {
  symbol: string;
  signal?: string;
  wordmark: string;
  background?: string;
}

const bgRect = (vb: string, fill?: string) => {
  if (!fill) return '';
  const [x, y, w, h] = vb.split(' ');
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
};

export function symbolSvg(c: Pick<SvgColors, 'symbol' | 'signal' | 'background'>, viewBox: string = SYMBOL.viewBox): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${bgRect(viewBox, c.background)}<path fill="${c.symbol}" d="${SYMBOL.left}"/><path fill="${c.signal ?? c.symbol}" d="${SYMBOL.signal}"/><path fill="${c.symbol}" d="${SYMBOL.right}"/></svg>`;
}

export function wordmarkSvg(fill: string, background?: string): string {
  const vb = WORDMARK.viewBox;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${bgRect(vb, background)}<g fill="${fill}" fill-rule="evenodd">${WORDMARK.paths.map((d) => `<path d="${d}"/>`).join('')}</g></svg>`;
}

export function lockupSvg(c: SvgColors): string {
  // Com fundo, o lockup ganha margem; sem fundo, recorte justo para uso inline.
  const vb = c.background ? '1 1 246 94' : LOCKUP.viewBox;
  const t = LOCKUP.wordmarkTransform;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${bgRect(vb, c.background)}<path fill="${c.symbol}" d="${SYMBOL.left}"/><path fill="${c.signal ?? c.symbol}" d="${SYMBOL.signal}"/><path fill="${c.symbol}" d="${SYMBOL.right}"/><g fill="${c.wordmark}" fill-rule="evenodd" transform="translate(${t.x} ${t.y}) scale(${t.scale})">${WORDMARK.paths.map((d) => `<path d="${d}"/>`).join('')}</g></svg>`;
}

/** Ícone de aplicativo: símbolo sobre placa quase preta com borda fina. */
export function appIconSvg(accent = '#B7FF5A', plate = '#050608', stroke = '#242A31'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${plate}"/><rect x="0.75" y="0.75" width="94.5" height="94.5" fill="none" stroke="${stroke}" stroke-width="1.5"/><g transform="translate(14.4 14.4) scale(0.7)"><path fill="${accent}" d="${SYMBOL.left}"/><path fill="${accent}" d="${SYMBOL.signal}"/><path fill="${accent}" d="${SYMBOL.right}"/></g></svg>`;
}
