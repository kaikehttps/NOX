import { useEffect, useMemo, useRef, useState } from 'react';
import { EMOJI_CATEGORIES, pushRecentEmoji, recentEmojis, searchEmojis } from '../lib/emoji';

export function EmojiPicker(props: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const recent = useMemo(recentEmojis, []);
  const [cat, setCat] = useState(recent.length ? 'recentes' : EMOJI_CATEGORIES[0]!.id);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && props.onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [props]);

  const items = query
    ? searchEmojis(query)
    : cat === 'recentes'
      ? recent
      : (EMOJI_CATEGORIES.find((c) => c.id === cat)?.items.map((i) => i.e) ?? []);

  const pick = (e: string) => {
    pushRecentEmoji(e);
    props.onPick(e);
  };

  return (
    <div ref={ref} className="emoji-picker" role="dialog" aria-label="Emojis">
      <div className="search">
        <input className="input" autoFocus placeholder="buscar emoji…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="cats">
        {recent.length > 0 && (
          <button aria-pressed={cat === 'recentes' && !query} onClick={() => setCat('recentes')}>
            recentes
          </button>
        )}
        {EMOJI_CATEGORIES.map((c) => (
          <button key={c.id} aria-pressed={cat === c.id && !query} onClick={() => setCat(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="grid">
        {items.map((e) => (
          <button key={e} onClick={() => pick(e)} aria-label={e}>
            {e}
          </button>
        ))}
        {items.length === 0 && <span className="hint" style={{ gridColumn: '1 / -1', padding: 8 }}>nenhum resultado</span>}
      </div>
    </div>
  );
}
