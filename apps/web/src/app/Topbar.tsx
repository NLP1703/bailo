import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useAuth } from '../lib/auth';
import { useSyncStatus } from '../lib/sync';
import { breadcrumbFor } from './navigation';
import {
  BuildingIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  GlobeIcon,
  LogOutIcon,
  MoonIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  TagIcon,
  UserIcon,
} from '../components/icons';
import { ThemeToggle } from '../components/ThemeToggle';
import { useTheme } from '../lib/theme';

/** Barre supérieure : fil d'Ariane, recherche, synchro, compte.
 *  Sur mobile, le menu complet est atteint via « Plus » de la bottom-nav —
 *  on ne garde ici que la marque, le titre de page et la recherche. */
export function Topbar({
  onOpenMenu: _onOpenMenu,
  onOpenSearch,
}: {
  onOpenMenu: () => void;
  onOpenSearch: () => void;
}) {
  void _onOpenMenu;
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const crumbs = breadcrumbFor(pathname);
  const current = crumbs[crumbs.length - 1];

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 pt-safe backdrop-blur supports-[backdrop-filter]:bg-white/75 print:hidden">
      <div className="flex h-14 items-center gap-3 px-4 sm:h-16 sm:px-6 lg:px-8">
        {/* Mobile : marque compacte (le menu complet est dans la bottom-nav → « Plus ») */}
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white shadow-sm lg:hidden">
          <BuildingIcon className="h-4 w-4" />
        </span>

        {/* Fil d'Ariane (ordinateur) / titre courant (mobile) */}
        <nav aria-label={t('nav.breadcrumb')} className="min-w-0 flex-1">
          <ol className="hidden items-center gap-1.5 text-sm sm:flex">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <Fragment key={`${c.labelKey}-${i}`}>
                  {i > 0 && <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
                  <li className={`truncate ${last ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
                    {c.to && !last ? (
                      <Link to={c.to} className="transition hover:text-slate-900">
                        {t(c.labelKey)}
                      </Link>
                    ) : (
                      <span aria-current={last ? 'page' : undefined}>{t(c.labelKey)}</span>
                    )}
                  </li>
                </Fragment>
              );
            })}
          </ol>
          <span className="block truncate text-[15px] font-semibold text-slate-900 sm:hidden">
            {current ? t(current.labelKey) : t('app.title')}
          </span>
        </nav>

        {/* Recherche */}
        <button
          onClick={onOpenSearch}
          className="hidden h-9 w-64 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-400 transition hover:border-slate-300 hover:bg-white md:flex xl:w-80"
        >
          <SearchIcon className="h-4 w-4" />
          <span className="flex-1 text-left">{t('search.trigger')}</span>
          <kbd className="rounded border border-slate-200 bg-white px-1.5 py-px text-[11px] font-medium text-slate-500">
            Ctrl K
          </kbd>
        </button>
        <button
          onClick={onOpenSearch}
          aria-label={t('search.title')}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 md:hidden"
        >
          <SearchIcon className="h-5 w-5" />
        </button>

        <SyncPill />
        <AccountMenu />
      </div>
    </header>
  );
}

/** Pastille d'état réseau / synchronisation hors-ligne. */
function SyncPill() {
  const { t } = useTranslation();
  const { online, pending } = useSyncStatus();
  if (online && pending === 0) {
    return (
      <span
        title={t('app.synced')}
        className="hidden items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-slate-500 lg:flex"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        {t('app.online')}
      </span>
    );
  }
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
        online ? 'bg-sky-50 text-sky-700 ring-sky-200' : 'bg-amber-50 text-amber-700 ring-amber-200'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${online ? 'animate-pulse bg-sky-500' : 'bg-amber-500'}`} />
      <span className="hidden sm:inline">
        {online ? t('app.pending', { count: pending }) : t('app.offline')}
      </span>
    </span>
  );
}

/** Icône Soleil/Lune reflétant le thème effectif courant. */
function ThemeIcon() {
  const { isDark } = useTheme();
  return isDark ? (
    <MoonIcon className="h-4 w-4 text-slate-400" />
  ) : (
    <SunIcon className="h-4 w-4 text-slate-400" />
  );
}

/** Avatar + menu déroulant du compte. */
function AccountMenu() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  // Initiales : uniquement des lettres (« Obélix (propriétaire) » → « OP », pas « O( »).
  const initials = (user.name.match(/\p{L}+/gu) ?? [])
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

  const setLang = (lng: string) => {
    try {
      localStorage.setItem('lang', lng);
    } catch {
      /* stockage indisponible : la langue vaut pour la session */
    }
    void i18n.changeLanguage(lng);
  };

  const item =
    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition hover:bg-slate-100 sm:pr-2"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
          {initials || 'U'}
        </span>
        <span className="hidden min-w-0 text-left leading-tight lg:block">
          <span className="block max-w-[140px] truncate text-sm font-semibold text-slate-800">{user.name}</span>
          <span className="block text-[11px] text-slate-400">{t(`profile.role.${user.role}`)}</span>
        </span>
        <ChevronDownIcon className="hidden h-4 w-4 text-slate-400 sm:block" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 origin-top-right animate-pop-in rounded-xl bg-white p-1.5 shadow-pop ring-1 ring-slate-200"
        >
          <div className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
              {initials || 'U'}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold text-slate-900">{user.name}</span>
              <span className="block truncate text-xs text-slate-500">{user.email ?? user.phone}</span>
              <span className="mt-1 inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                {t(`profile.role.${user.role}`)} · {user.accountName}
              </span>
            </span>
          </div>
          <div className="my-1 border-t border-slate-100" />
          <Link to="/profile" role="menuitem" className={item}>
            <UserIcon className="h-4 w-4 text-slate-400" />
            {t('nav.profile')}
          </Link>
          {user.role === 'OWNER' && (
            <Link to="/plans" role="menuitem" className={item}>
              <TagIcon className="h-4 w-4 text-slate-400" />
              {t('nav.plans')}
              <span className="ml-auto rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand">
                {t(`billing.plan.${user.plan}`)}
              </span>
            </Link>
          )}
          <Link to="/settings" role="menuitem" className={item}>
            <SettingsIcon className="h-4 w-4 text-slate-400" />
            {t('nav.settings')}
          </Link>
          <div className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700">
            <GlobeIcon className="h-4 w-4 text-slate-400" />
            {t('common.language')}
            <span className="ml-auto inline-flex rounded-lg bg-slate-100 p-0.5">
              {(['fr', 'en'] as const).map((lng) => (
                <button
                  key={lng}
                  onClick={() => setLang(lng)}
                  className={`rounded-md px-2 py-0.5 text-xs font-semibold uppercase transition ${
                    i18n.language === lng ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {lng}
                </button>
              ))}
            </span>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700">
            <ThemeIcon />
            {t('theme.label')}
            <span className="ml-auto">
              <ThemeToggle />
            </span>
          </div>
          <div className="my-1 border-t border-slate-100" />
          <button
            role="menuitem"
            onClick={() => void logout()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            <LogOutIcon className="h-4 w-4" />
            {t('common.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
