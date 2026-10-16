import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon, XCircleIcon, XIcon, type IconProps } from './icons';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  durationMs: number;
}

interface ToastApi {
  show: (kind: ToastKind, message: string, durationMs?: number) => void;
  success: (message: string, durationMs?: number) => void;
  error: (message: string, durationMs?: number) => void;
  info: (message: string, durationMs?: number) => void;
  warning: (message: string, durationMs?: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const KIND: Record<ToastKind, { Icon: ComponentType<IconProps>; icon: string; bar: string }> = {
  success: { Icon: CheckCircleIcon, icon: 'text-emerald-600', bar: 'bg-emerald-500' },
  error: { Icon: XCircleIcon, icon: 'text-red-600', bar: 'bg-red-500' },
  info: { Icon: InfoIcon, icon: 'text-sky-600', bar: 'bg-sky-500' },
  warning: { Icon: AlertTriangleIcon, icon: 'text-amber-600', bar: 'bg-amber-500' },
};

/**
 * Notifications discrètes (zéro dépendance), empilées en bas à droite sur
 * ordinateur et en bas de l'écran sur mobile. Au plus 4 à la fois.
 * API : useToast().success('Reçu enregistré'), useToast().error('Hors ligne')…
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const api = useMemo<ToastApi>(() => {
    const show = (kind: ToastKind, message: string, durationMs = 4000) => {
      const id = String(++idRef.current);
      setToasts((ts) => [...ts.slice(-3), { id, kind, message, durationMs }]);
    };
    return {
      show,
      success: (m, d) => show('success', m, d),
      error: (m, d) => show('error', m, d ?? 6000),
      info: (m, d) => show('info', m, d),
      warning: (m, d) => show('warning', m, d),
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6 print:hidden"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(toast.id), toast.durationMs);
    return () => clearTimeout(timer);
  }, [toast.id, toast.durationMs, onDismiss, paused]);

  const k = KIND[toast.kind];
  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="pointer-events-auto relative flex w-full max-w-sm animate-pop-in items-start gap-3 overflow-hidden rounded-xl bg-white py-3 pl-4 pr-3 shadow-pop ring-1 ring-slate-200"
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${k.bar}`} aria-hidden="true" />
      <k.Icon className={`mt-px h-5 w-5 shrink-0 ${k.icon}`} />
      <p className="flex-1 text-sm font-medium text-slate-800">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Fermer"
        className="-m-0.5 rounded-md p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast doit être utilisé à l'intérieur de <ToastProvider>");
  return ctx;
}
