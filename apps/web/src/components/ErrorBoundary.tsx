import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureError } from '../lib/monitoring';

interface Props {
  children: ReactNode;
  /** Composant de repli optionnel ; un écran par défaut est fourni. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Error Boundary global : attrape toute erreur non catchée dans l'arbre React,
 * affiche un écran de repli et offre un bouton pour recharger la page.
 * L'erreur est aussi envoyée au monitoring (Sentry, si un DSN est configuré).
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
    captureError(error, { componentStack: info.componentStack });
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  private readonly reload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);

    return (
      <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
        <div className="max-w-md w-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 text-xl">
              !
            </div>
            <div className="flex-1">
              <h1 className="text-lg font-semibold text-slate-900">Une erreur est survenue</h1>
              <p className="mt-1 text-sm text-slate-600">
                L'application a rencontré un problème inattendu. Vos données ne sont pas perdues
                — essayez de recharger la page.
              </p>
              {import.meta.env.DEV && (
                <pre className="mt-3 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
                  {this.state.error.message}
                </pre>
              )}
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <button
              onClick={this.reset}
              className="flex-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              Réessayer
            </button>
            <button
              onClick={this.reload}
              className="flex-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
            >
              Recharger
            </button>
          </div>
        </div>
      </div>
    );
  }
}
