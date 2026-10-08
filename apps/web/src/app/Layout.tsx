import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useAuth } from '../lib/auth';
import { useSyncStatus } from '../lib/sync';

const NAV = [
  { to: '/', key: 'nav.home', icon: '🏠', end: true },
  { to: '/rooms', key: 'nav.rooms', icon: '🚪', end: false },
  { to: '/collect', key: 'nav.collect', icon: '💵', end: false },
  { to: '/reminders', key: 'nav.reminders', icon: '🔔', end: false },
  { to: '/more', key: 'nav.more', icon: '⋯', end: false },
];

export function Layout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { online, pending } = useSyncStatus();

  const toggleLang = () => {
    const next = i18n.language === 'fr' ? 'en' : 'fr';
    localStorage.setItem('lang', next);
    void i18n.changeLanguage(next);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-brand px-4 py-3 text-white">
        <span className="font-semibold">{t('app.title')}</span>
        <div className="flex items-center gap-2 text-xs">
          {!online && <span className="rounded bg-amber-500 px-2 py-0.5">{t('app.offline')}</span>}
          {pending > 0 && (
            <span className="rounded bg-white/20 px-2 py-0.5">
              {t('app.pending', { count: pending })}
            </span>
          )}
          <button onClick={toggleLang} className="rounded bg-white/20 px-2 py-0.5 uppercase">
            {i18n.language}
          </button>
          <button
            onClick={() => void logout()}
            title={t('common.logout')}
            className="rounded bg-white/20 px-2 py-0.5"
          >
            {user?.name?.split(' ')[0] ?? '⎋'}
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 pb-24">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md justify-around border-t border-slate-200 bg-white py-2">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 text-xs ${isActive ? 'text-brand' : 'text-slate-500'}`
            }
          >
            <span className="text-lg">{n.icon}</span>
            {t(n.key)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
