import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Primitives d'affichage de données « back-office » :
 *  - <Money>        montant aligné, chiffres à chasse fixe, « FCFA » discret ;
 *  - <StatusBadge>  statut unifié (même couleur, même forme partout) ;
 *  - <FilterChips>  pastilles de filtre avec compteurs ;
 *  - <DataTable>    tableau triable, en-tête collant, pagination ;
 *                   sur mobile, bascule sur un rendu en cartes.
 */

// ─── Montants ─────────────────────────────────────────────────────────────────

const MONEY_TONE = {
  default: 'text-slate-900',
  positive: 'text-emerald-700',
  negative: 'text-red-600',
  muted: 'text-slate-500',
} as const;

export function formatAmount(n: number): string {
  // Espace fine insécable comme séparateur de milliers (norme française).
  return Math.trunc(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function Money({
  value,
  tone = 'default',
  className = '',
  currency = true,
}: {
  value: number;
  tone?: keyof typeof MONEY_TONE;
  className?: string;
  currency?: boolean;
}) {
  return (
    <span className={`whitespace-nowrap font-semibold tabular-nums ${MONEY_TONE[tone]} ${className}`}>
      {formatAmount(value)}
      {currency && <span className="ml-1 text-[0.8em] font-medium text-slate-400">FCFA</span>}
    </span>
  );
}

// ─── Statuts ──────────────────────────────────────────────────────────────────

export type StatusKind =
  | 'upToDate'
  | 'advance'
  | 'dueSoon'
  | 'overdue'
  | 'reserved'
  | 'vacant'
  | 'notice'
  | 'closed';

const STATUS_STYLE: Record<StatusKind, { chip: string; dot: string }> = {
  upToDate: { chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  advance: { chip: 'bg-teal-50 text-teal-700 ring-teal-200', dot: 'bg-teal-500' },
  dueSoon: { chip: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  overdue: { chip: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500' },
  reserved: { chip: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
  vacant: { chip: 'bg-slate-50 text-slate-600 ring-slate-200', dot: 'bg-slate-400' },
  notice: { chip: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500' },
  closed: { chip: 'bg-slate-100 text-slate-500 ring-slate-200', dot: 'bg-slate-300' },
};

/** Point de couleur seul (légendes, avatars). */
export function statusDotClass(kind: StatusKind): string {
  return STATUS_STYLE[kind].dot;
}

/** Badge de statut : pastille + libellé (le sens ne repose jamais sur la seule couleur). */
export function StatusBadge({ kind, label }: { kind: StatusKind; label?: string }) {
  const { t } = useTranslation();
  const s = STATUS_STYLE[kind];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${s.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {label ?? t(`status.${kind}`)}
    </span>
  );
}

// ─── Pastilles de filtre ──────────────────────────────────────────────────────

export interface ChipOption<K extends string> {
  key: K;
  label: string;
  count?: number;
  /** Point de couleur facultatif devant le libellé. */
  dot?: string;
}

export function FilterChips<K extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ChipOption<K>[];
  value: K;
  onChange: (k: K) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2 print:hidden">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.key)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition ${
              active
                ? 'bg-brand-soft text-brand ring-brand/40'
                : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {o.dot && <span className={`h-2 w-2 rounded-full ${o.dot}`} aria-hidden="true" />}
            {o.label}
            {o.count !== undefined && (
              <span
                className={`min-w-[1.25rem] rounded-md px-1 text-center text-xs font-semibold tabular-nums ${
                  active ? 'bg-brand text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Tableau ──────────────────────────────────────────────────────────────────

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Valeur de tri ; absente = colonne non triable. */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right' | 'center';
  /** Classes de la cellule (largeur, troncature…). */
  className?: string;
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // les vides toujours en fin
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' });
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  defaultSort = null,
  mobileCard,
  empty,
  footer,
  pageSize = 25,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Rend chaque ligne cliquable vers cette URL. */
  rowHref?: (row: T) => string | undefined;
  defaultSort?: SortState;
  /** Rendu mobile (< md). Sans lui, le tableau défile horizontalement. */
  mobileCard?: (row: T) => ReactNode;
  empty?: ReactNode;
  /** Ligne de pied (totaux…), affichée sous les lignes sur ordinateur. */
  footer?: ReactNode;
  pageSize?: number;
  caption?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [sort, setSort] = useState<SortState>(defaultSort);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const out = [...rows].sort((a, b) => compare(get(a), get(b)));
    return sort.dir === 'desc' ? out.reverse() : out;
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const pageStart = current * pageSize;
  const visible = sorted.slice(pageStart, pageStart + pageSize);
  // À l'impression, toutes les lignes sortent (pas seulement la page affichée).
  const inPage = (i: number) => i >= pageStart && i < pageStart + pageSize;

  const toggleSort = (key: string) => {
    setPage(0);
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: 'asc' };
      if (s.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  if (rows.length === 0 && empty) return <>{empty}</>;

  const onRowKey = (e: KeyboardEvent, href?: string) => {
    if (href && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      navigate(href);
    }
  };

  const pager =
    pages > 1 ? (
      <div className="flex items-center justify-between gap-3 border-t border-slate-200/80 px-4 py-2.5 text-xs text-slate-500 print:hidden">
        <span className="tabular-nums">
          {t('table.range', {
            from: current * pageSize + 1,
            to: Math.min(sorted.length, (current + 1) * pageSize),
            total: sorted.length,
          })}
        </span>
        <span className="flex gap-1.5">
          <button
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
            className="rounded-md px-2.5 py-1 font-medium ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 disabled:opacity-40"
          >
            {t('table.prev')}
          </button>
          <button
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
            className="rounded-md px-2.5 py-1 font-medium ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 disabled:opacity-40"
          >
            {t('table.next')}
          </button>
        </span>
      </div>
    ) : null;

  return (
    <div className="overflow-clip rounded-xl bg-white shadow-card ring-1 ring-slate-200/70">
      {/* Mobile : cartes */}
      {mobileCard && (
        <ul className="divide-y divide-slate-100 md:hidden print:hidden">
          {visible.map((r) => (
            <li key={rowKey(r)}>{mobileCard(r)}</li>
          ))}
        </ul>
      )}

      {/* Ordinateur : tableau */}
      <div className={mobileCard ? 'hidden md:block print:!block' : 'overflow-x-auto md:overflow-visible print:overflow-visible'}>
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const align = ALIGN[c.align ?? 'left'];
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={`sticky top-16 z-10 border-b border-slate-200 bg-slate-50/95 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 backdrop-blur print:static print:px-2 print:py-1.5 ${align}`}
                  >
                    {c.sortValue ? (
                      <>
                        <button
                          onClick={() => toggleSort(c.key)}
                          className={`group inline-flex items-center gap-1 uppercase tracking-[0.06em] transition hover:text-slate-800 print:hidden ${
                            active ? 'text-slate-800' : ''
                          } ${c.align === 'right' ? 'flex-row-reverse' : ''}`}
                        >
                          {c.header}
                          <SortGlyph dir={active ? sort!.dir : null} />
                        </button>
                        {/* Texte simple sur papier : Chromium ne repeint pas les boutons
                            dans l'en-tête répété des pages suivantes. */}
                        <span className="hidden print:inline">{c.header}</span>
                      </>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((r, i) => {
              const href = rowHref?.(r);
              const shown = inPage(i);
              return (
                <tr
                  key={rowKey(r)}
                  onClick={href ? () => navigate(href) : undefined}
                  onKeyDown={href ? (e) => onRowKey(e, href) : undefined}
                  tabIndex={href && shown ? 0 : undefined}
                  role={href ? 'link' : undefined}
                  className={`${shown ? '' : 'hidden print:table-row'} ${
                    href
                      ? 'cursor-pointer transition hover:bg-slate-50 focus:bg-brand-soft/60 focus:outline-none'
                      : ''
                  }`}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-3 align-middle print:px-2 print:py-1.5 ${ALIGN[c.align ?? 'left']} ${c.className ?? ''}`}
                    >
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {footer && (
            <tfoot className="border-t border-slate-200 bg-slate-50/70">{footer}</tfoot>
          )}
        </table>
      </div>
      {pager}
    </div>
  );
}

function SortGlyph({ dir }: { dir: 'asc' | 'desc' | null }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`h-3 w-3 shrink-0 print:hidden ${dir ? 'text-brand' : 'text-slate-300 group-hover:text-slate-400'}`}
      aria-hidden="true"
    >
      <path d="M6 2.5 8.5 5h-5z" fill="currentColor" opacity={dir === 'desc' ? 0.3 : 1} />
      <path d="M6 9.5 3.5 7h5z" fill="currentColor" opacity={dir === 'asc' ? 0.3 : 1} />
    </svg>
  );
}

/** Barre d'outils au-dessus d'un tableau : recherche + filtres + compteur. */
export function TableToolbar({ children, count }: { children: ReactNode; count?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between print:hidden">
      <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center">{children}</div>
      {count !== undefined && <div className="shrink-0 text-sm text-slate-500 tabular-nums">{count}</div>}
    </div>
  );
}

/** Champ de recherche compact avec loupe, pour les barres d'outils de liste. */
export function SearchField({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`relative block w-full lg:max-w-xs ${className}`}>
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 shadow-card outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
    </label>
  );
}
