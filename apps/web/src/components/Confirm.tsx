import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangleIcon, InfoIcon } from './icons';

/**
 * Fenêtre de confirmation de l'application, à la place des `window.confirm()`
 * du navigateur. Usage :
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title, message, tone: 'danger' }))) return;
 *
 * Pour une action irréversible et lourde, `requireText` oblige à recopier un
 * mot avant de pouvoir valider.
 */
export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` = action destructive (bouton rouge, focus initial sur Annuler). */
  tone?: 'danger' | 'default';
  /** Mot à saisir à l'identique pour activer la validation. */
  requireText?: string;
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...o, resolve });
      }),
    [],
  );

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <ConfirmDialog options={pending} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm doit être utilisé à l’intérieur de <ConfirmProvider>');
  return ctx;
}

function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: (ok: boolean) => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');
  const danger = options.tone === 'danger';
  const canConfirm = !options.requireText || typed.trim() === options.requireText;

  // Focus initial (Annuler pour une action destructive), défilement bloqué,
  // et retour du focus à l'élément d'origine à la fermeture.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (options.requireText ? inputRef : danger ? cancelRef : confirmRef).current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, [danger, options.requireText]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose(false);
      return;
    }
    // Piège à focus : Tab reste dans la fenêtre.
    if (e.key === 'Tab' && panelRef.current) {
      const nodes = panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input');
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  // Mobile : feuille collée en bas, slide-up, bords supérieurs arrondis + poignée.
  // Desktop (≥ sm) : dialog centré classique.
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 animate-fade-in bg-slate-900/50" onClick={() => onClose(false)} aria-hidden="true" />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={options.message ? descId : undefined}
        className="relative w-full max-w-md animate-slide-up rounded-t-2xl bg-white px-5 pb-5 pt-3 pb-safe shadow-pop ring-1 ring-slate-200 sm:animate-pop-in sm:rounded-2xl sm:p-6 sm:pb-6"
      >
        {/* Poignée de glissement (purement visuelle, bottom sheet uniquement) */}
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 sm:hidden" />

        <div className="flex gap-4">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              danger ? 'bg-red-50 text-red-600' : 'bg-brand-soft text-brand'
            }`}
          >
            {danger ? <AlertTriangleIcon className="h-5 w-5" /> : <InfoIcon className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              {options.title}
            </h2>
            {options.message && (
              <div id={descId} className="mt-1.5 whitespace-pre-line text-sm text-slate-600">
                {options.message}
              </div>
            )}
            {options.requireText && (
              <label className="mt-4 block">
                <span className="mb-1.5 block text-xs font-medium text-slate-600">
                  {t('confirm.typeToConfirm', { word: options.requireText })}
                </span>
                <input
                  ref={inputRef}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canConfirm) onClose(true);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 font-mono text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200"
                />
              </label>
            )}
          </div>
        </div>

        {/* Actions : empilées pleine largeur mobile (gros tap target), alignées à
            droite desktop. `flex-col-reverse` place l'action principale en bas
            de la pile — la plus accessible au pouce sur téléphone. */}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            onClick={() => onClose(false)}
            className="h-12 rounded-lg px-5 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 sm:h-10"
          >
            {options.cancelLabel ?? t('common.cancel')}
          </button>
          <button
            ref={confirmRef}
            disabled={!canConfirm}
            onClick={() => onClose(true)}
            className={`h-12 rounded-lg px-5 text-sm font-semibold text-white shadow-sm transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 ${
              danger
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-300'
                : 'bg-brand hover:bg-brand-dark focus:ring-brand/40'
            }`}
          >
            {options.confirmLabel ?? t('confirm.ok')}
          </button>
        </div>
      </div>
    </div>
  );
}
