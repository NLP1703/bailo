import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { visibleSections } from './navigation';
import { BuildingIcon, SidebarIcon, XIcon } from '../components/icons';

/**
 * Contenu de la navigation latérale. Le même composant sert :
 *  - à la sidebar fixe sur ordinateur (repliable en mode icônes) ;
 *  - au tiroir coulissant sur mobile.
 */
export function SidebarContent({
  collapsed = false,
  onToggleCollapse,
  onNavigate,
  onClose,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const sections = visibleSections(user);

  return (
    <div className="flex h-full flex-col">
      {/* Marque */}
      <div
        className={`flex h-16 shrink-0 items-center border-b border-slate-200/80 ${
          collapsed ? 'justify-center px-2' : 'justify-between px-4'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white shadow-sm">
            <BuildingIcon className="h-5 w-5" />
          </span>
          {!collapsed && (
            <span className="min-w-0 leading-tight">
              <span className="block text-[15px] font-semibold tracking-tight text-slate-900">
                {t('app.title')}
              </span>
              <span className="block truncate text-[11px] font-medium text-slate-400">
                {t('nav.tagline')}
              </span>
            </span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <XIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Rubriques */}
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4" aria-label={t('nav.menu')}>
        {sections.map((section, idx) => (
          <div key={section.key} className={idx > 0 ? 'mt-6' : ''}>
            {collapsed ? (
              idx > 0 && <div className="mx-2 mb-3 border-t border-slate-200/80" />
            ) : (
              <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                {t(section.labelKey)}
              </div>
            )}
            <ul className="space-y-0.5">
              {section.items.map(({ to, labelKey, Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={onNavigate}
                    title={collapsed ? t(labelKey) : undefined}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition ${
                        collapsed ? 'justify-center px-2' : 'px-3'
                      } ${
                        isActive
                          ? 'bg-brand-soft text-brand'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand"
                          />
                        )}
                        <Icon
                          className={`h-[18px] w-[18px] shrink-0 ${
                            isActive ? 'text-brand' : 'text-slate-400 group-hover:text-slate-600'
                          }`}
                        />
                        {!collapsed && <span className="truncate">{t(labelKey)}</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Pied : compte + repli */}
      <div className="shrink-0 border-t border-slate-200/80 p-3">
        {user && !collapsed && (
          <div className="mb-2 flex items-center gap-3 rounded-lg px-2 py-1.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
              {user.accountName.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-xs font-semibold text-slate-700">
                {user.accountName}
              </span>
              <span className="block truncate text-[11px] text-slate-400">
                {t('billing.plan.' + user.plan)}
              </span>
            </span>
          </div>
        )}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={collapsed ? t('nav.expand') : t('nav.collapse')}
            className={`flex w-full items-center gap-3 rounded-lg py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 ${
              collapsed ? 'justify-center px-2' : 'px-3'
            }`}
          >
            <SidebarIcon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && t('nav.collapse')}
          </button>
        )}
      </div>
    </div>
  );
}
