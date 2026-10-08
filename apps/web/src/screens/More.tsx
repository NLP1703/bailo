import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';

export function More() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isManagerOrOwner = user?.role === 'OWNER' || user?.role === 'MANAGER';

  const items = [
    { to: '/tenants', label: t('tenants.title'), icon: '👤', show: isManagerOrOwner },
    { to: '/new-entry', label: t('newEntry.title'), icon: '➕', show: isManagerOrOwner },
    { to: '/expenses', label: t('expenses.title'), icon: '🧾', show: isManagerOrOwner },
    { to: '/cash', label: t('cash.title'), icon: '💰', show: true },
    { to: '/arrears', label: t('arrears.title'), icon: '⏰', show: isManagerOrOwner },
    { to: '/templates', label: t('templates.title'), icon: '✉️', show: user?.role === 'OWNER' },
    { to: '/settings', label: t('settings.title'), icon: '⚙️', show: user?.role === 'OWNER' },
  ].filter((i) => i.show);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t('more.title')}</h1>
      <ul className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm">
        {items.map((i) => (
          <li key={i.to}>
            <Link to={i.to} className="flex items-center gap-3 p-4">
              <span className="text-xl">{i.icon}</span>
              <span>{i.label}</span>
              <span className="ml-auto text-slate-400">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
