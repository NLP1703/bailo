import { useEffect, useRef, useState } from 'react';
import { formatAmount } from './data';

/**
 * Histogramme d'une seule série (ex. encaissements par mois), SVG maison :
 *  - barres ≤ 24 px, bout arrondi 4 px, base carrée, sur une ligne de base unique ;
 *  - grille horizontale fine et discrète, graduations « propres » et compactes ;
 *  - seule la dernière période (mois courant) est étiquetée et accentuée ;
 *  - info-bulle au survol / au focus clavier sur une zone plus large que la barre.
 * Couleurs : marque (#0f766e) pour la période courante, #4f9d95 pour l'historique
 * — les deux ≥ 3:1 sur fond blanc (vérifié au validateur de palette).
 */

export interface BarDatum {
  key: string;
  label: string; // libellé court sous la barre (« oct. »)
  title: string; // libellé complet dans l'info-bulle (« Octobre 2026 »)
  value: number;
}

const ACCENT = '#0f766e';
const MUTED = '#4f9d95';
const GRID = '#e8ebef';
const HEIGHT = 220;
const PAD = { top: 26, right: 8, bottom: 28, left: 52 };

/** Maximum « propre » (1, 2, 2,5 ou 5 × 10ⁿ) au-dessus de la valeur. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * exp >= v) return m * exp;
  return 10 * exp;
}

/** Graduation compacte : 0 · 250 k · 1,5 M. */
function compact(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`;
  if (v >= 1_000) return `${(v / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} k`;
  return String(v);
}

/** Barre à bout arrondi (haut) et base carrée. */
function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export function BarChart({ data, ariaLabel }: { data: BarDatum[]; ariaLabel: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(260, Math.round(entry.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const band = innerW / Math.max(1, data.length);
  const barW = Math.min(24, band * 0.5);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const last = data.length - 1;

  const tip = hover !== null ? data[hover] : null;
  const tipX = hover !== null ? PAD.left + band * hover + band / 2 : 0;

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={ariaLabel}
        className="block overflow-visible"
        onMouseLeave={() => setHover(null)}
      >
        {/* Grille + graduations */}
        {ticks.map((tv) => (
          <g key={tv}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={Math.round(y(tv)) + 0.5}
              y2={Math.round(y(tv)) + 0.5}
              stroke={tv === 0 ? '#cbd5e1' : GRID}
              strokeWidth={1}
            />
            <text
              x={PAD.left - 10}
              y={y(tv)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-slate-400 text-[11px] tabular-nums"
            >
              {compact(tv)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const cx = PAD.left + band * i + band / 2;
          const h = (d.value / max) * innerH;
          const isLast = i === last;
          const dim = hover !== null && hover !== i;
          return (
            <g key={d.key}>
              <path
                d={barPath(cx - barW / 2, y(d.value), barW, h)}
                fill={isLast ? ACCENT : MUTED}
                opacity={dim ? 0.45 : 1}
                style={{ transition: 'opacity 120ms' }}
              />
              {/* Étiquette directe : période courante uniquement. */}
              {isLast && d.value > 0 && (
                <text
                  x={cx}
                  y={y(d.value) - 8}
                  textAnchor="middle"
                  className="fill-slate-900 text-[11px] font-semibold tabular-nums"
                >
                  {compact(d.value)}
                </text>
              )}
              <text
                x={cx}
                y={HEIGHT - 8}
                textAnchor="middle"
                className={`text-[11px] ${isLast ? 'fill-slate-900 font-semibold' : 'fill-slate-500'}`}
              >
                {d.label}
              </text>
              {/* Zone de survol : toute la bande, plus large que la barre. */}
              <rect
                x={PAD.left + band * i}
                y={PAD.top}
                width={band}
                height={innerH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${d.title} : ${formatAmount(d.value)} FCFA`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="cursor-default outline-none"
              />
            </g>
          );
        })}
      </svg>

      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-pop"
          style={{ left: tipX, top: y(tip.value) - 6 }}
        >
          <div className="font-medium text-slate-300">{tip.title}</div>
          <div className="font-semibold tabular-nums">{formatAmount(tip.value)} FCFA</div>
        </div>
      )}
    </div>
  );
}
