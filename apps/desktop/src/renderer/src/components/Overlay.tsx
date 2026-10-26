import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { MenuEntry } from '../lib/context';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '👀', '🎮', '✅'];

export function Modal(props: { label: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`modal${props.wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={props.label}>
        <div className="modal-head">
          <span className="label">{props.label}</span>
          <button className="icon-btn" onClick={props.onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        {props.children}
        {props.footer ? <div className="modal-foot">{props.footer}</div> : null}
      </div>
    </div>
  );
}

export function ContextMenu(props: { x: number; y: number; entries: MenuEntry[]; onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: props.x, y: props.y });

  // Mantém o menu dentro da janela.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(props.x, window.innerWidth - r.width - 8),
      y: Math.min(props.y, window.innerHeight - r.height - 8),
    });
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [props.x, props.y]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) props.onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onDismiss();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('.menu-item:not(:disabled)') ?? [])];
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
        next?.focus();
      }
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', props.onDismiss);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', props.onDismiss);
    };
  }, [props]);

  return (
    <div ref={ref} className="menu" role="menu" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {props.entries.map((entry, i) => {
        if (entry === 'separator') return <div key={i} className="menu-sep" />;
        if ('reactions' in entry) {
          return (
            <div key={i} className="menu-reactions">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    entry.reactions(emoji);
                    props.onDismiss();
                  }}
                  aria-label={`Reagir com ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          );
        }
        return (
          <button
            key={i}
            role="menuitem"
            className={`menu-item${entry.danger ? ' danger' : ''}`}
            disabled={entry.disabled}
            onClick={() => {
              props.onDismiss();
              entry.onSelect();
            }}
          >
            {entry.icon}
            <span>{entry.label}</span>
            {entry.hint ? <span className="kbd">{entry.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function Empty(props: { glyph?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="glyph">{props.glyph ?? '// vazio'}</span>
      <p>{props.children}</p>
      {props.action}
    </div>
  );
}

export function SignalLoader({ label }: { label?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span className="signal-loader" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      {label ? <span className="label">{label}</span> : null}
    </span>
  );
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={props.checked} aria-label={props.label} className="switch" onClick={() => props.onChange(!props.checked)} />
  );
}
