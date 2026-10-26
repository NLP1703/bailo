import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './i18n';
import './index.css';
import { AuthProvider } from './lib/auth';
import { initTheme } from './lib/theme';
import { captureUtm } from './lib/utm';
import { initMonitoring } from './lib/monitoring';
import { App } from './app/app';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/Confirm';

// Thème appliqué AVANT le premier render pour éviter le flash blanc en dark mode.
initTheme();
// Capture d'éventuels paramètres UTM à l'arrivée (puis nettoyage de l'URL).
captureUtm();
// Monitoring des erreurs (Sentry) — inactif sans VITE_SENTRY_DSN.
initMonitoring();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
