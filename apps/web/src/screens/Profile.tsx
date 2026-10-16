import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { PageHeader, Card, Badge, Button } from '../components/ui';
import { MailIcon, PhoneIcon, BuildingIcon, SettingsIcon, LogOutIcon } from '../components/icons';

export function Profile() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="space-y-4">
      <PageHeader title={t('profile.title')} />

      <Card className="flex items-center gap-3">
        <span className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-brand/10 text-2xl font-bold text-brand">
          {user.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-slate-900">{user.name}</h2>
          <Badge tone="brand">{t(`profile.role.${user.role}`)}</Badge>
        </div>
      </Card>

      <Card className="divide-y divide-slate-100">
        <Row icon={<MailIcon className="h-5 w-5" />} label={t('login.email')} value={user.email ?? '—'} />
        <Row icon={<PhoneIcon className="h-5 w-5" />} label={t('login.phone')} value={user.phone} />
        <Row
          icon={<BuildingIcon className="h-5 w-5" />}
          label={t('profile.account')}
          value={user.accountName}
        />
      </Card>

      <Link
        to="/settings"
        className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 transition hover:bg-slate-50"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <SettingsIcon className="h-5 w-5" />
        </span>
        <span className="font-medium text-slate-800">{t('settings.title')}</span>
      </Link>

      <Button variant="secondary" block onClick={() => void logout()}>
        <LogOutIcon className="h-4 w-4" />
        {t('common.logout')}
      </Button>
    </div>
  );
}

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="text-slate-400">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs text-slate-400">{label}</span>
        <span className="block truncate font-medium text-slate-800">{value}</span>
      </span>
    </div>
  );
}
