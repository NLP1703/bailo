import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AdminOverview as Overview } from '@bailo/shared';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { Card, StatTile, PageSkeleton, Badge, ProgressBar } from '../../components/ui';
import {
  UsersIcon,
  AlertTriangleIcon,
  ClockAlertIcon,
  TagIcon,
  BuildingIcon,
  DoorIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  type IconProps,
} from '../../components/icons';
import type { ComponentType } from 'react';

/**
 * Vue d'ensemble du module Administration (LOT 1).
 *
 * Trois blocs :
 *  1. 4 tuiles de synthèse (utilisateurs actifs, anomalies, actions sensibles 7 j, plan).
 *  2. 3 jauges de quota (sites / unités / utilisateurs) avec libellé « illimité »
 *     quand le plan ne cap pas, et liens vers « Abonnement ».
 *  3. 3 listes courtes (5 lignes max) : dernières connexions, actions sensibles,
 *     anomalies ouvertes, avec un lien « Tout voir » vers le sous-onglet dédié.
 */
export function AdminOverview() {
  const { t } = useTranslation();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get<Overview>('/admin/overview').then(setData).catch(() => setError(true));
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
    <div className="space-y-5">
      {data.readOnly && (
        <div
          role="status"
          className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-inset ring-amber-200"
        >
          {t('billing.readOnlyBanner')}
        </div>
      )}

      {/* 1. Tuiles de synthèse */}
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

      {/* 2. Jauges de quota */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">{t('admin.overview.quotas')}</h2>
          <Link
            to="/admin/subscription"
            className="text-xs font-semibold text-brand hover:text-brand-dark"
          >
            {t('admin.overview.manageSubscription')} →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <QuotaGauge
            label={t('admin.overview.quotaSites')}
            icon={BuildingIcon}
            used={data.quotas.sites.used}
            limit={data.quotas.sites.limit}
            pct={data.quotas.sites.pct}
          />
          <QuotaGauge
            label={t('admin.overview.quotaUnits')}
            icon={DoorIcon}
            used={data.quotas.units.used}
            limit={data.quotas.units.limit}
            pct={data.quotas.units.pct}
          />
          <QuotaGauge
            label={t('admin.overview.quotaUsers')}
            icon={UsersIcon}
            used={data.quotas.users.used}
            limit={data.quotas.users.limit}
            pct={data.quotas.users.pct}
          />
        </div>
      </Card>

      {/* 3. Trois listes courtes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Dernières connexions */}
        <ShortList title={t('admin.overview.recentLogins')} to="/admin/team" seeAll={t('admin.overview.seeTeam')}>
          {data.recentLogins.length === 0 ? (
            <EmptyRow message={t('admin.overview.noLogins')} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentLogins.map((u) => (
                <li key={u.userId} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                    {u.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{u.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {t(`profile.role.${u.role}`)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums text-slate-500">
                    {u.lastLoginAt ? formatRelative(u.lastLoginAt, t) : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ShortList>

        {/* Actions sensibles */}
        <ShortList title={t('admin.overview.sensitive7d')} to="/admin/audit" seeAll={t('admin.overview.seeAudit')}>
          {data.recentSensitiveActions.length === 0 ? (
            <EmptyRow
              icon={CheckCircleIcon}
              message={t('admin.overview.noSensitive')}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentSensitiveActions.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <Badge tone={a.action === 'VOID' || a.action === 'DELETE' ? 'red' : 'amber'}>
                    {a.isRoleChange ? t('admin.overview.roleChange') : a.action}
                  </Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-slate-900">
                      {a.entity}
                      <span className="ml-1 font-mono text-xs text-slate-400">
                        #{a.entityId.slice(0, 8)}
                      </span>
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {a.actorName ?? '—'} · {formatRelative(a.createdAt, t)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ShortList>

        {/* Anomalies */}
        <ShortList title={t('admin.overview.openAnomalies')} to="/admin/data" seeAll={t('admin.overview.seeAnomalies')}>
          {data.openAnomalies.length === 0 ? (
            <EmptyRow icon={CheckCircleIcon} message={t('admin.overview.noAnomalies')} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.openAnomalies.map((a) => (
                <li key={a.id} className="flex items-start gap-3 py-2.5 text-sm">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                      a.severity >= 3 ? 'bg-red-500' : a.severity === 2 ? 'bg-amber-500' : 'bg-slate-400'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{a.kind}</span>
                    <span className="block truncate text-xs text-slate-500">{a.message}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ShortList>
      </div>
    </div>
  );
}

/** Jauge de quota (barre + fraction + libellé « illimité » le cas échéant). */
function QuotaGauge({
  label,
  icon: Icon,
  used,
  limit,
  pct,
}: {
  label: string;
  icon: ComponentType<IconProps>;
  used: number;
  limit: number | null;
  pct: number | null;
}) {
  const { t } = useTranslation();
  const tone = pct === null ? 'brand' : pct >= 100 ? 'red' : pct >= 85 ? 'amber' : 'brand';
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-4 w-4 text-slate-400" />
        {label}
      </div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-bold tabular-nums text-slate-900">
          {used}
          <span className="font-normal text-slate-400"> / {limit ?? t('admin.overview.unlimited')}</span>
        </span>
        {pct !== null && (
          <span className="text-xs tabular-nums text-slate-500">{pct} %</span>
        )}
      </div>
      {pct !== null && (
        <div className="mt-2">
          <ProgressBar value={pct} tone={tone} />
        </div>
      )}
    </div>
  );
}

/** Carte « liste courte » avec titre et lien « Tout voir » vers un sous-onglet. */
function ShortList({
  title,
  to,
  seeAll,
  children,
}: {
  title: string;
  to: string;
  seeAll: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <Link
          to={to}
          className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand hover:text-brand-dark"
        >
          {seeAll}
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>
      {children}
    </Card>
  );
}

function EmptyRow({
  icon: Icon,
  message,
}: {
  icon?: ComponentType<IconProps>;
  message: string;
}) {
  // Variante compacte d'EmptyState : les listes courtes ne doivent pas occuper
  // plus d'espace que leurs 5 lignes maximum.
  return (
    <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
      {Icon && <Icon className="h-4 w-4 text-slate-400" />}
      <span>{message}</span>
    </div>
  );
}

/** Date relative compacte (« il y a 3 min », « 2 h », « 4 j »). */
function formatRelative(iso: string, t: (k: string, o?: Record<string, unknown>) => string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return t('admin.overview.now');
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} j`;
  return formatDate(iso);
}
