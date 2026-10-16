import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { BuildingIcon } from '../../components/icons';

// Icônes de formulaire réexportées pour les écrans d'auth (source unique : components/icons).
export {
  MailIcon,
  PhoneIcon,
  LockIcon,
  UserIcon,
  BuildingIcon,
  KeyIcon,
} from '../../components/icons';

/** Coquille visuelle commune aux écrans de connexion / inscription. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand via-brand to-brand-dark px-4 py-10">
      {/* Décor : halos lumineux en arrière-plan */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-white/10 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-white">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur">
            <BuildingIcon className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Bailo</h1>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-2xl shadow-black/20 sm:p-8">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <p className="mb-6 mt-1 text-sm text-slate-500">{subtitle}</p>
          {children}
        </div>

        <p className="mt-6 text-center text-sm text-white/90">{footer}</p>
      </div>
    </div>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon: ReactNode;
}

/** Champ de saisie étiqueté avec icône en tête. */
export function Field({ label, icon, id, className = '', ...props }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
          {icon}
        </span>
        <input
          id={id}
          className={`w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/30 ${className}`}
          {...props}
        />
      </div>
    </div>
  );
}

/** Bouton d'action principal (pleine largeur). */
export function PrimaryButton({
  children,
  busy,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      type="submit"
      disabled={busy}
      {...props}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-2.5 font-semibold text-white shadow-sm transition hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-60"
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

/** Bandeau d'erreur discret. */
export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
      {message}
    </p>
  );
}
