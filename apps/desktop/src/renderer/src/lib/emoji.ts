/**
 * Conjunto inicial de emojis Unicode com palavras-chave em português para busca.
 * O seletor completo (todas as categorias Unicode, emojis personalizados, GIFs e
 * figurinhas) é parte da Fase 5; esta lista cobre o uso cotidiano sem dependências.
 */
export interface EmojiEntry {
  e: string;
  k: string;
}

export const EMOJI_CATEGORIES: { id: string; label: string; items: EmojiEntry[] }[] = [
  {
    id: 'rostos',
    label: 'rostos',
    items: [
      ['😀', 'feliz sorriso'], ['😂', 'rindo chorando kkk'], ['🤣', 'rolando rir'], ['😅', 'suor nervoso'], ['😊', 'fofo sorriso'],
      ['😍', 'apaixonado amor'], ['😘', 'beijo'], ['😎', 'oculos estilo'], ['🤔', 'pensando hmm'], ['🤨', 'desconfiado'],
      ['😐', 'neutro'], ['🙄', 'revirando olhos'], ['😴', 'sono dormindo'], ['😭', 'chorando triste'], ['😤', 'bufando'],
      ['😡', 'raiva bravo'], ['🤯', 'mente explodindo'], ['😱', 'grito susto'], ['🥶', 'frio'], ['🥵', 'calor'],
      ['🤡', 'palhaco'], ['💀', 'caveira morri'], ['👻', 'fantasma'], ['🤖', 'robo'], ['🫡', 'saudacao continencia'],
      ['🥲', 'sorriso lagrima'], ['🙃', 'de cabeca para baixo'], ['😬', 'tenso'], ['🤐', 'boca fechada segredo'], ['🥳', 'festa comemorar'],
    ].map(([e, k]) => ({ e: e!, k: k! })),
  },
  {
    id: 'gestos',
    label: 'gestos',
    items: [
      ['👍', 'joinha positivo sim'], ['👎', 'negativo nao'], ['👏', 'palmas'], ['🙌', 'maos para cima'], ['🙏', 'por favor obrigado'],
      ['🤝', 'aperto de mao acordo'], ['✌️', 'paz'], ['🤞', 'dedos cruzados sorte'], ['👊', 'soco'], ['💪', 'forca braco'],
      ['👋', 'tchau oi aceno'], ['🫶', 'coracao maos'], ['👀', 'olhos olhando'], ['🧠', 'cerebro'], ['🫠', 'derretendo'],
      ['🤙', 'tranquilo'], ['👌', 'ok'], ['🖕', 'dedo'], ['☝️', 'um momento'], ['🫵', 'voce'],
    ].map(([e, k]) => ({ e: e!, k: k! })),
  },
  {
    id: 'simbolos',
    label: 'símbolos',
    items: [
      ['❤️', 'coracao amor'], ['🖤', 'coracao preto'], ['💚', 'coracao verde'], ['💔', 'coracao partido'], ['🔥', 'fogo brabo'],
      ['✨', 'brilho'], ['⚡', 'raio energia'], ['💯', 'cem perfeito'], ['✅', 'certo feito'], ['❌', 'errado nao'],
      ['⚠️', 'aviso cuidado'], ['❓', 'pergunta'], ['❗', 'exclamacao'], ['💤', 'sono'], ['🎉', 'festa confete'],
      ['🏆', 'trofeu vitoria'], ['🎯', 'alvo'], ['🚀', 'foguete'], ['💎', 'diamante'], ['🔒', 'cadeado privado'],
    ].map(([e, k]) => ({ e: e!, k: k! })),
  },
  {
    id: 'jogos',
    label: 'jogos',
    items: [
      ['🎮', 'controle jogo game'], ['🕹️', 'joystick'], ['🎧', 'fone headset'], ['🎙️', 'microfone'], ['🖥️', 'computador pc'],
      ['⌨️', 'teclado'], ['🖱️', 'mouse'], ['🎲', 'dado'], ['♟️', 'xadrez'], ['🃏', 'carta'],
      ['⚔️', 'espadas batalha'], ['🛡️', 'escudo'], ['🏹', 'arco'], ['💣', 'bomba'], ['🔫', 'arma pistola'],
      ['👾', 'alien arcade'], ['🧩', 'quebra cabeca'], ['🏁', 'bandeira corrida'], ['🥇', 'primeiro ouro'], ['📺', 'tv stream'],
    ].map(([e, k]) => ({ e: e!, k: k! })),
  },
  {
    id: 'coisas',
    label: 'coisas',
    items: [
      ['🍕', 'pizza'], ['🍔', 'hamburguer'], ['🍟', 'batata'], ['🍺', 'cerveja'], ['☕', 'cafe'],
      ['🥤', 'refri'], ['🍿', 'pipoca filme'], ['🎵', 'musica'], ['🎬', 'filme'], ['📸', 'foto camera'],
      ['🌙', 'lua noite'], ['☀️', 'sol'], ['🌧️', 'chuva'], ['🐱', 'gato'], ['🐶', 'cachorro'],
      ['🐸', 'sapo'], ['🦆', 'pato'], ['🌵', 'cacto'], ['💻', 'notebook'], ['📌', 'fixar pin'],
    ].map(([e, k]) => ({ e: e!, k: k! })),
  },
];

const RECENT_KEY = 'nox.emoji.recent';

export function recentEmojis(): string[] {
  try {
    return (JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]).slice(0, 16);
  } catch {
    return [];
  }
}

export function pushRecentEmoji(e: string) {
  try {
    const next = [e, ...recentEmojis().filter((x) => x !== e)].slice(0, 16);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignora */
  }
}

export function searchEmojis(q: string): string[] {
  const term = q
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  if (!term) return [];
  return EMOJI_CATEGORIES.flatMap((c) => c.items)
    .filter((i) => i.k.includes(term))
    .map((i) => i.e);
}
