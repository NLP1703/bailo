import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PLAN_LIMITS,
  PLAN_ORDER,
  type BillingSummary,
  type PlanFeatures,
  type SubscriptionPlan,
} from '@bailo/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHeader, Card, Button, Badge, PageSkeleton } from '../components/ui';
import { CheckIcon } from '../components/icons';
import { formatAmount } from '../components/data';
import { useConfirm } from '../components/Confirm';
import { useToast } from '../components/Toast';

/**
 * Écran dédié aux offres Bailo, accessible depuis la sidebar (NF13 : plus
 * d'une étape de clic pour voir ce qu'on paie et changer d'offre).
 * Réservé aux propriétaires — c'est eux qui payent l'abonnement.
 */
const FEATURE_KEYS: (keyof PlanFeatures)[] = [
  'whatsapp',
  'sms',
  'allReminderStages',
  'penaltiesAuto',
  'advancedReports',
  'noWatermark',
  'multiAccount',
  'apiAccess',
  'whiteLabel',
];

function fmtPrice(fcfa: number): string {
  return fcfa > 0 ? formatAmount(fcfa) : '';
}

export function Plans() {
  const { t } = useTranslation();
  const { user, refreshMe } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [busy, setBusy] = useState<SubscriptionPlan | null>(null);
  const isOwner = user?.role === 'OWNER';

  const load = () =>
    api
      .get<BillingSummary>('/account/billing')
      .then(setBilling)
      .catch(() => setBilling(null));

  useEffect(() => {
    if (isOwner) void load();
  }, [isOwner]);

  const changePlan = async (plan: SubscriptionPlan) => {
    if (!billing) return;
    const target = PLAN_LIMITS[plan];
    const name = t(`billing.plan.${plan}`);
    // Prévenir si l'usage actuel dépasse les limites de l'offre visée (descente d'offre).
    const over: string[] = [];
    if (target.maxSites !== null && billing.usage.sites > target.maxSites)
      over.push(t('plans.overSites', { used: billing.usage.sites, max: target.maxSites }));
    if (target.maxUnits !== null && billing.usage.units > target.maxUnits)
      over.push(t('plans.overUnits', { used: billing.usage.units, max: target.maxUnits }));
    if (target.maxUsers !== null && billing.usage.users > target.maxUsers)
      over.push(t('plans.overUsers', { used: billing.usage.users, max: target.maxUsers }));

    const price =
      target.pricePerMonth > 0
        ? t('plans.confirmPrice', { price: fmtPrice(target.pricePerMonth) })
        : t('billing.free');
    const ok = await confirm({
      title: t('plans.confirmTitle', { name }),
      message: [price, ...(over.length ? ['', t('plans.overWarn'), ...over.map((o) => `• ${o}`)] : [])].join('\n'),
      confirmLabel: t('plans.confirmOk', { name }),
      tone: over.length ? 'danger' : 'default',
    });
    if (!ok) return;

    setBusy(plan);
    try {
      await api.patch('/account/plan', { plan });
      // Le changement d'offre peut lever/poser la lecture seule : on met à jour la
      // session et le récapitulatif, sans recharger la page.
      await Promise.all([refreshMe(), load()]);
      toast.success(t('plans.changed', { name }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('confirm.genericError'));
    } finally {
      setBusy(null);
    }
  };

  if (!isOwner) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('plans.title')} subtitle={t('pageSub.plans')} />
        <Card>
          <p className="text-sm text-slate-600">{t('plans.forbidden')}</p>
        </Card>
      </div>
    );
  }

  if (!billing) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('plans.title')} subtitle={t('pageSub.plans')} />
        <PageSkeleton variant="rows" />
      </div>
    );
  }

  const planKey = (p: SubscriptionPlan) => `billing.plan.${p}` as const;

  return (
    <div className="space-y-4">
      <PageHeader title={t('plans.title')} subtitle={t('pageSub.plans')} />

      {/* En-tête : offre active, consommation, échéance */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-900">{t('billing.title')}</span>
          <Badge tone={billing.readOnly ? 'red' : 'brand'}>{t(planKey(billing.plan))}</Badge>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-lg bg-slate-50 p-2.5">
            <div className="text-xs text-slate-400">{t('billing.sites')}</div>
            <div className="font-semibold text-slate-800">
              {billing.usage.sites}
              {billing.limits.maxSites !== null ? ` / ${billing.limits.maxSites}` : ' / ∞'}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-2.5">
            <div className="text-xs text-slate-400">{t('billing.units')}</div>
            <div className="font-semibold text-slate-800">
              {billing.usage.units}
              {billing.limits.maxUnits !== null ? ` / ${billing.limits.maxUnits}` : ' / ∞'}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-2.5">
            <div className="text-xs text-slate-400">{t('billing.usersCount')}</div>
            <div className="font-semibold text-slate-800">
              {billing.usage.users}
              {billing.limits.maxUsers !== null ? ` / ${billing.limits.maxUsers}` : ' / ∞'}
            </div>
          </div>
        </div>
        {billing.subscriptionEndAt && (
          <p className="text-xs text-slate-500">
            {t('billing.until', {
              date: new Date(billing.subscriptionEndAt).toLocaleDateString(),
            })}
          </p>
        )}
        {billing.readOnly && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
            {t('billing.readOnlyBanner')}
          </p>
        )}
      </Card>

      {/* Catalogue des 4 offres */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {PLAN_ORDER.map((p) => {
          const l = PLAN_LIMITS[p];
          const active = billing.plan === p;
          const price = fmtPrice(l.pricePerMonth);
          const yearly = fmtPrice(l.pricePerYear);
          const activeFeatures = FEATURE_KEYS.filter((k) => Boolean(l.features[k]));
          return (
            <div
              key={p}
              className={`flex flex-col gap-3 rounded-xl p-4 ring-1 transition ${
                active
                  ? 'bg-brand/5 ring-brand/40 shadow-sm'
                  : 'bg-white ring-slate-100 hover:ring-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">{t(planKey(p))}</div>
                  <div className="mt-1 text-sm">
                    {l.pricePerMonth > 0 ? (
                      <>
                        <span className="text-lg font-bold text-slate-900">{price}</span>
                        <span className="text-xs text-slate-500">
                          {' '}
                          FCFA / {t('billing.month')}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm font-semibold text-emerald-600">
                        {t('billing.free')}
                      </span>
                    )}
                  </div>
                  {yearly && (
                    <div className="text-xs text-slate-400">
                      {t('billing.orYear', { price: yearly })}
                    </div>
                  )}
                </div>
                {active && <Badge tone="brand">{t('billing.current')}</Badge>}
              </div>

              <ul className="space-y-1 text-xs text-slate-600">
                <li>
                  <CheckIcon className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />
                  {t('billing.quota.sites', {
                    n: l.maxSites === null ? '∞' : String(l.maxSites),
                  })}
                </li>
                <li>
                  <CheckIcon className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />
                  {t('billing.quota.units', {
                    n: l.maxUnits === null ? '∞' : String(l.maxUnits),
                  })}
                </li>
                <li>
                  <CheckIcon className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />
                  {t('billing.quota.users', {
                    n: l.maxUsers === null ? '∞' : String(l.maxUsers),
                  })}
                </li>
                <li>
                  <CheckIcon className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />
                  {t('billing.quota.history', {
                    n:
                      l.features.historyMonths === null
                        ? t('billing.unlimited')
                        : t('billing.months', { n: l.features.historyMonths }),
                  })}
                </li>
                {activeFeatures.map((k) => (
                  <li key={k}>
                    <CheckIcon className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />
                    {t(`billing.feat.${k}`)}
                  </li>
                ))}
              </ul>

              <Button
                variant={active ? 'secondary' : 'primary'}
                size="sm"
                disabled={active}
                busy={busy === p}
                onClick={() => void changePlan(p)}
              >
                {active ? t('billing.current') : t('billing.choose')}
              </Button>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-400">{t('billing.paymentNote')}</p>
    </div>
  );
}
