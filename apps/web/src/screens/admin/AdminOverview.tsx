import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminOverview as Overview } from '@bailo/shared';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { Card, StatTile, PageSkeleton } from '../../components/ui';
import {
  UsersIcon,
  AlertTriangleIcon,
  ClockAlertIcon,
  TagIcon,
} from '../../components/icons';

/**
 * Vue d'ensemble du module Administration — chiffres de gouvernance :
 * composition de l'équipe, actions sensibles récentes (annulations, suppressions,
 * archivages), anomalies ouvertes, plan en cours.
 *
 * LOT 0 : forme minimale, chiffres bruts. Le LOT 1 enrichira avec les
 * dernières connexions, les jauges de quota détaillées et des listes courtes
 * cliquables renvoyant vers les sous-onglets concernés.
 */
export function AdminOverview() {
  const { t } = useTranslation();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get<Overview>('/admin/overview')
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <Card>
        <p className="text-sm text-red-700">{t('admin.loadError')}</p>
      </Card>
    );
  }
  if (!data) return <PageSkeleton variant="detail" />;

  const planLabel = t(`billing.plan.${data.plan.code}`, { defaultValue: data.plan.code });

  return (
    <div className="space-y-4">
      {data.readOnly && (
        <div
          role="status"
          className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-inset ring-amber-200"
        >
          {t('billing.readOnlyBanner')}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t('admin.overview.users')}
          value={String(data.users.active)}
          icon={UsersIcon}
          tone="brand"
          hint={t('admin.overview.usersHint', { inactive: data.users.inactive })}
        />
        <StatTile
          label={t('admin.overview.anomalies')}
          value={String(data.anomaliesOpen)}
          icon={AlertTriangleIcon}
          tone={data.anomaliesOpen > 0 ? 'amber' : 'emerald'}
        />
        <StatTile
          label={t('admin.overview.sensitive7d')}
          value={String(data.sensitiveActionsLast7Days)}
          icon={ClockAlertIcon}
          tone={data.sensitiveActionsLast7Days > 0 ? 'amber' : 'slate'}
          hint={t('admin.overview.sensitive7dHint')}
        />
        <StatTile
          label={t('admin.overview.plan')}
          value={planLabel}
          icon={TagIcon}
          tone="slate"
          hint={
            data.plan.endsAt
              ? t('admin.overview.planEnds', { date: formatDate(data.plan.endsAt) })
              : undefined
          }
        />
      </div>

      <Card>
        <p className="text-sm text-slate-500">{t('admin.overview.next')}</p>
      </Card>
    </div>
  );
}
