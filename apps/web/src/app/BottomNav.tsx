import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ComponentType } from 'react';
import { useAuth } from '../lib/auth';
import {
  DashboardIcon,
  DoorIcon,
  BanknoteIcon,
  ClockAlertIcon,
  MenuIcon,
  type IconProps,
} from '../components/icons';

/**
 * Barre d'onglets du bas, visible uniquement sur téléphone (< lg).
 *
 * Ergonomie mobile :
 *  - 5 cibles larges (≥ 56×56) alignées sur la convention iOS / Android ;
 *  - le bouton central « Encaisser » est mis en relief (geste financier le plus
 *    fréquent sur le terrain) ; il reste masqué pour un compte en lecture seule ;
 *  - « Plus » rouvre le tiroir complet (toutes les rubriques, profil, langue) ;
 *  - respecte l'inset bas (encoche / barre de gestes).
 *
 * La sidebar/drawer existante reste la source de vérité des droits : on filtre
 * discrètement les onglets selon le rôle, les items masqués sont simplement
 * remplacés par « Plus » qui mène au drawer.
 */

type Role = 'OWNER' | 'MANAGER' | 'CARETAKER';

interface TabDef {
  to: string;
  labelKey: string;
  Icon: ComponentType<IconProps>;
  roles?: Role[]; // absent = tout le monde
  writeOnly?: boolean; // masqué quand compte en lecture seule
  end?: boolean;
}

const MGMT: Role[] = ['OWNER', 'MANAGER'];

// Côté gauche du FAB
const LEFT_TABS: TabDef[] = [
  { to: '/', labelKey: 'bottomNav.home', Icon: DashboardIcon, end: true },
  { to: '/rooms', labelKey: 'bottomNav.rooms', Icon: DoorIcon },
];
// Côté droit du FAB
const RIGHT_TABS: TabDef[] = [
  { to: '/arrears', labelKey: 'bottomNav.arrears', Icon: ClockAlertIcon, roles: MGMT },
];

function allowed(tab: TabDef, role: Role | undefined, readOnly: boolean): boolean {
  if (!role) return false;
  if (tab.roles && !tab.roles.includes(role)) return false;
  if (tab.writeOnly && readOnly) return false;
  return true;
}

export function BottomNav({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  const role = user.role as Role;
  const readOnly = !!user.readOnly;

  const left = LEFT_TABS.filter((t) => allowed(t, role, readOnly));
  const right = RIGHT_TABS.filter((t) => allowed(t, role, readOnly));

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition ${
      isActive ? 'text-brand' : 'text-slate-500 hover:text-slate-800'
    }`;

  return (
    <nav
      aria-label={t('bottomNav.aria')}
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 pb-safe shadow-[0_-4px_18px_-10px_rgba(15,23,42,0.18)] lg:hidden print:hidden"
    >
      <div className="relative mx-auto flex h-[62px] max-w-xl items-stretch">
        {left.map(({ to, labelKey, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={linkCls}>
            {({ isActive }) => (
              <>
                <Icon
                  className={`h-[22px] w-[22px] ${isActive ? 'text-brand' : 'text-slate-500'}`}
                />
                <span className="truncate">{t(labelKey)}</span>
              </>
            )}
          </NavLink>
        ))}

        {/* Espace pour le FAB central */}
        {!readOnly && <div className="w-16 shrink-0" aria-hidden="true" />}

        {right.map(({ to, labelKey, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={linkCls}>
            {({ isActive }) => (
              <>
                <Icon
                  className={`h-[22px] w-[22px] ${isActive ? 'text-brand' : 'text-slate-500'}`}
                />
                <span className="truncate">{t(labelKey)}</span>
              </>
            )}
          </NavLink>
        ))}

        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label={t('bottomNav.more')}
          className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium text-slate-500 transition hover:text-slate-800"
        >
          <MenuIcon className="h-[22px] w-[22px] text-slate-500" />
          <span className="truncate">{t('bottomNav.more')}</span>
        </button>

        {/* FAB central — Encaisser */}
        {!readOnly && (
          <button
            type="button"
            onClick={() => navigate('/collect')}
            aria-label={t('bottomNav.collect')}
            className="animate-pop-tap absolute left-1/2 top-0 -translate-x-1/2 -translate-y-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-[0_8px_24px_-6px_rgba(15,118,110,0.55),0_4px_10px_-4px_rgba(15,23,42,0.25)] ring-4 ring-white transition active:scale-95"
          >
            <BanknoteIcon className="h-6 w-6" />
            <span className="sr-only">{t('bottomNav.collect')}</span>
          </button>
        )}
      </div>
    </nav>
  );
}
