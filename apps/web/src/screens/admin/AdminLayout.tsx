import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ADMIN_SECTIONS, type AdminSection } from '@bailo/shared';
import { useAuth } from '../../lib/auth';
import { PageHeader, Card } from '../../components/ui';
import { ShieldIcon } from '../../components/icons';

/**
 * Enveloppe de l'onglet Administration : barre de sous-onglets commune à toutes
 * les sous-vues. Les pages elles-mêmes sont montées via `<Outlet />` (routes
 * imbriquées déclarées dans app.tsx).
 *
 * Visibilité :
 *  - OWNER : les sept onglets ;
 *  - MANAGER : lecture seule des onglets « Vue d'ensemble » et « Journal d'audit »
 *    (les autres sont réservés au propriétaire — géré ici dans la liste des
 *    sous-onglets, et confirmé côté API par @Roles au Lot 2+).
 *
 * Le LOT 0 pose uniquement le cadre et une vue d'ensemble minimale ; chaque
 * sous-onglet est enrichi au fil des lots.
 */

/** Onglets accessibles selon le rôle courant. */
function sectionsFor(role: 'OWNER' | 'MANAGER' | 'CARETAKER' | undefined): AdminSection[] {
  if (role === 'OWNER') return [...ADMIN_SECTIONS];
  if (role === 'MANAGER') return ['overview', 'audit'];
  return [];
}

export function AdminLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const sections = sectionsFor(user?.role);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('admin.title')}
        subtitle={t('admin.subtitle')}
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-soft px-2 py-1 text-xs font-semibold text-brand">
            <ShieldIcon className="h-3.5 w-3.5" />
            {t(`profile.role.${user?.role ?? 'OWNER'}`)}
          </span>
        }
      />

      {/* Sous-onglets — défilent horizontalement sur mobile sans retour à la ligne. */}
      <nav
        aria-label={t('admin.tabs')}
        className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 scrollbar-thin"
      >
        {sections.map((s) => (
          <NavLink
            key={s}
            to={`/admin/${s === 'overview' ? '' : s}`}
            end={s === 'overview'}
            className={({ isActive }) =>
              `shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                isActive
                  ? 'bg-brand text-white shadow-sm'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
              }`
            }
          >
            {t(`admin.tab.${s}`)}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}

/** Placeholder commun aux sous-onglets non encore implémentés (Lot 2+). */
export function AdminPlaceholder({ sectionKey }: { sectionKey: AdminSection }) {
  const { t } = useTranslation();
  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-900">{t(`admin.tab.${sectionKey}`)}</h2>
      <p className="mt-2 text-sm text-slate-500">{t('admin.placeholder')}</p>
    </Card>
  );
}
