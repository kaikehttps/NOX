import { SYMBOL, WORDMARK } from '@nox/design-system';

interface SymbolProps {
  className?: string;
  /** Pisca o bloco central como cursor (conectando / primeira abertura). */
  blink?: boolean;
  /** Nível 0–1 para usar o sinal como medidor de voz. */
  level?: number;
  color?: string;
}

export function NoxSymbol({ className, blink, level, color = 'var(--nox-accent)' }: SymbolProps) {
  const r = SYMBOL.signalRect;
  const h = level === undefined ? r.height : Math.max(6, r.height * (0.35 + 0.65 * Math.min(1, level)));
  return (
    <svg className={className} viewBox={SYMBOL.tightViewBox} aria-label="NOX" role="img">
      <path fill={color} d={SYMBOL.left} />
      <rect
        className={blink ? 'logo-signal-blink' : undefined}
        fill={color}
        x={r.x}
        y={r.y + (r.height - h) / 2}
        width={r.width}
        height={h}
      />
      <path fill={color} d={SYMBOL.right} />
    </svg>
  );
}

export function NoxWordmark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox={WORDMARK.viewBox} aria-label="NOX" role="img">
      <g fill="currentColor" fillRule="evenodd">
        {WORDMARK.paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}
