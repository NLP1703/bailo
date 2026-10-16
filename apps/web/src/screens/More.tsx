import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import {
  UsersIcon,
  UserPlusIcon,
  WalletIcon,
  ClockAlertIcon,
  MailIcon,
  SettingsIcon,
  ChevronRightIcon,
  type IconProps,
} from '../components/icons';

export function More() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isManagerOrOwner = user?.role === 'OWNER' || user?.role === 'MANAGER';

  const items: { to: string; label: string; Icon: ComponentType<IconProps>; show: boolean }[] = [
    { to: '/tenants', label: t('tenants.title'), Icon: UsersIcon, show: isManagerOrOwner },
    { to: '/new-entry', label: t('newEntry.title'), Icon: UserPlusIcon, show: isManagerOrOwner },
    { to: '/cash', label: t('cash.title'), Icon: WalletIcon, show: true },
    { to: '/arrears', label: t('arrears.title'), Icon: ClockAlertIcon, show: isManagerOrOwner },
    { to: '/templates', label: t('templates.title'), Icon: MailIcon, show: user?.role === 'OWNER' },
    { to: '/settings', label: t('settings.title'), Icon: SettingsIcon, show: true },
  ].filter((i) => i.show);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">{t('more.title')}</h1>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-100">
        {items.map(({ to, label, Icon }) => (
          <li key={to}>
            <Link to={to} className="flex items-center gap-3 p-4 transition hover:bg-slate-50">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <Icon className="h-5 w-5" />
              </span>
              <span className="font-medium text-slate-800">{label}</span>
              <ChevronRightIcon className="ml-auto h-5 w-5 text-slate-300" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
