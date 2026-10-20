import type {
  ButtonHTMLAttributes,
  ComponentType,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import type { IconProps } from './icons';

/**
 * Primitives d'interface partagées — le socle visuel de l'app (cartes, en-têtes,
 * tuiles d'indicateur, badges…). Objectif : une cohérence pro sur tous les écrans,
 * mobile d'abord (NF1) et lisible en plein soleil (NF13).
 */

/**
 * En-tête standard d'un écran : titre, sous-titre explicatif, actions à droite.
 * Sur mobile les actions passent sous le titre.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** @deprecated préférer `actions` — conservé pour les écrans existants. */
  action?: ReactNode;
  actions?: ReactNode;
}) {
  const right = actions ?? action;
  return (
    <div className="flex flex-col gap-3 pb-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {right && <div className="flex shrink-0 flex-wrap items-center gap-2 print:hidden">{right}</div>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-white p-4 shadow-card ring-1 ring-slate-200/70 ${className}`}>
      {children}
    </div>
  );
}

const TONES = {
  brand: 'bg-brand/10 text-brand',
  emerald: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  slate: 'bg-slate-100 text-slate-600',
} as const;
export type Tone = keyof typeof TONES;

/**
 * Tuile d'indicateur : libellé, valeur, et en option une évolution (delta),
 * un sous-texte et une jauge. Le delta porte flèche + signe + texte : son sens
 * ne repose jamais sur la seule couleur.
 */
export function StatTile({
  label,
  value,
  icon: Icon,
  tone = 'brand',
  hint,
  delta,
  meter,
}: {
  label: string;
  value: string;
  icon?: ComponentType<IconProps>;
  tone?: Tone;
  hint?: ReactNode;
  /** Évolution en % ; `good` indique si la hausse est une bonne nouvelle. */
  delta?: { pct: number; label: string; good?: 'up' | 'down' } | null;
  /** Jauge 0–100 sous la valeur. */
  meter?: number;
}) {
  const deltaGood = delta ? (delta.good === 'down' ? delta.pct <= 0 : delta.pct >= 0) : true;
  return (
    <div className="flex flex-col rounded-xl bg-white p-4 shadow-card ring-1 ring-slate-200/70">
      <div className="flex items-center gap-2">
        {Icon && (
          <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}>
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="text-xs font-medium text-slate-500">{label}</div>
      </div>
      <div className="mt-2 text-xl font-semibold text-slate-900 sm:text-[22px]">{value}</div>
      {meter !== undefined && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${Math.min(100, Math.max(0, meter))}%` }}
          />
        </div>
      )}
      {(delta || hint) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
          {delta && (
            <span
              className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold ${
                deltaGood ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {delta.pct >= 0 ? '▲' : '▼'} {delta.pct >= 0 ? '+' : '−'}
              {Math.abs(delta.pct)} %
            </span>
          )}
          {delta && <span>{delta.label}</span>}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </div>
  );
}

export function ProgressBar({ value, tone = 'brand' }: { value: number; tone?: Tone }) {
  const bar =
    tone === 'emerald'
      ? 'bg-emerald-500'
      : tone === 'amber'
        ? 'bg-amber-500'
        : tone === 'red'
          ? 'bg-red-500'
          : 'bg-brand';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className={`h-full rounded-full transition-all ${bar}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  );
}

/**
 * État vide : une icône, un titre facultatif, une phrase utile et, si possible,
 * l'action qui permet d'en sortir (« Enregistrer une entrée »…).
 */
export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
}: {
  icon?: ComponentType<IconProps>;
  title?: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-6 py-12 text-center shadow-card ring-1 ring-slate-200/70">
      {Icon && (
        <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 ring-1 ring-slate-200">
          <Icon className="h-6 w-6 text-slate-400" />
        </span>
      )}
      {title && <p className="text-sm font-semibold text-slate-900">{title}</p>}
      <p className="max-w-sm text-sm text-slate-500">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ─── Chargement ───────────────────────────────────────────────────────────────

/** Bloc gris animé, à la forme du contenu attendu. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} aria-hidden="true" />;
}

/**
 * Squelette d'écran complet, à la place d'un « Chargement… » textuel :
 *  - `detail` : en-tête + bandeau + cartes (fiches locataire, chambre, cité) ;
 *  - `list`   : en-tête + barre d'outils + lignes de tableau ;
 *  - `rows`   : uniquement des lignes (sous une barre d'outils déjà affichée).
 */
export function PageSkeleton({ variant = 'detail' }: { variant?: 'detail' | 'list' | 'rows' }) {
  const rows = (
    <div className="overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-slate-200/70">
      <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3">
        <Skeleton className="h-3 w-1/3" />
      </div>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-3.5 last:border-0">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="hidden h-3.5 w-24 sm:block" />
          <Skeleton className="h-3.5 w-20" />
        </div>
      ))}
    </div>
  );
  if (variant === 'rows') return <div aria-busy="true">{rows}</div>;
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement…</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {variant === 'list' ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-72 max-w-full" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
          {rows}
        </>
      ) : (
        <>
          <Skeleton className="h-24 w-full rounded-xl" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </>
      )}
    </div>
  );
}

/** Menu déroulant stylé, cohérent avec les champs de saisie. */
export function Select({
  value,
  onChange,
  children,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30 ${className}`}
    >
      {children}
    </select>
  );
}

// ─── Formulaires ──────────────────────────────────────────────────────────────

/** Style commun aux champs de saisie (inputs, selects, textarea natifs). */
export const fieldCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/30';

export function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1 block text-sm font-medium text-slate-700">{children}</span>;
}

/** Message d'erreur inline (vide = rien). */
export function ErrorText({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
      {message}
    </p>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldCls} ${className}`} {...props} />;
}

export function TextArea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${fieldCls} ${className}`} {...props} />;
}

export function NativeSelect({
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${fieldCls} font-medium ${className}`} {...props}>
      {children}
    </select>
  );
}

const BTN_VARIANT = {
  primary: 'bg-brand text-white hover:bg-brand-dark focus:ring-brand/40',
  secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200 focus:ring-slate-300',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-300',
  info: 'bg-sky-500 text-white hover:bg-sky-600 focus:ring-sky-300',
  ghost: 'text-brand hover:bg-brand/10 focus:ring-brand/30',
} as const;
const BTN_SIZE = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5',
} as const;

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  busy = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BTN_VARIANT;
  size?: keyof typeof BTN_SIZE;
  block?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold shadow-sm transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${BTN_VARIANT[variant]} ${BTN_SIZE[size]} ${block ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {busy && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

/**
 * Bouton d'action flottant mobile — bulle fixe en bas à droite, pour l'action
 * principale d'un écran (Nouveau locataire, Nouveau contrat…). Masqué sur
 * ordinateur, où le même CTA est placé dans l'en-tête de l'écran. Décalage
 * calculé pour passer au-dessus de la bottom-nav et de l'inset bas (encoche).
 *
 * Pour un lien de navigation, l'appelant utilise `onClick={() => navigate(...)}`
 * — garde l'intégration avec react-router sans ajouter de dépendance ici.
 */
export function Fab({
  icon: Icon,
  label,
  onClick,
  tone = 'brand',
  className = '',
}: {
  icon: ComponentType<IconProps>;
  label: string;
  onClick: () => void;
  tone?: 'brand' | 'emerald';
  className?: string;
}) {
  const toneCls = tone === 'emerald' ? 'bg-emerald-600' : 'bg-brand';
  const cls = `lg:hidden fixed right-4 z-20 flex h-14 items-center gap-2 rounded-full ${toneCls} pl-4 pr-5 text-sm font-semibold text-white shadow-[0_12px_28px_-8px_rgba(15,118,110,0.5),0_6px_12px_-6px_rgba(15,23,42,0.2)] ring-4 ring-white transition active:scale-95 ${className}`;
  const style = { bottom: 'calc(var(--bottom-nav-h) + var(--safe-bottom) + 12px)' };
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cls} style={style}>
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </button>
  );
}
