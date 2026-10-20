import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BuildingIcon, MenuIcon, XIcon } from '../../components/icons';

/**
 * Coquille des pages PUBLIQUES (visiteurs non connectés) : landing, politique
 * de confidentialité, mentions légales. Header fixe translucide qui se densifie
 * au scroll, menu mobile en drawer, footer avec les liens juridiques.
 */

const NAV = [
  { to: '/', labelKey: 'public.nav.home' },
  { to: '/#features', labelKey: 'public.nav.features' },
  { to: '/#pricing', labelKey: 'public.nav.pricing' },
  { to: '/#faq', labelKey: 'public.nav.faq' },
] as const;

export function PublicShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { pathname, hash } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setDrawer(false), [pathname, hash]);

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header
        className={`fixed inset-x-0 top-0 z-40 pt-safe transition-all duration-300 ${
          scrolled
            ? 'bg-white/85 shadow-sm backdrop-blur dark:bg-slate-950/85'
            : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5 group">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white shadow-sm transition-transform group-hover:scale-105">
              <BuildingIcon className="h-5 w-5" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-base font-bold tracking-tight">Bailo</span>
              <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-slate-400">
                {t('public.tagline')}
              </span>
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300 md:flex">
            {NAV.map((n) => (
              <a
                key={n.to}
                href={n.to}
                className="transition hover:text-slate-900 dark:hover:text-white"
              >
                {t(n.labelKey)}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 sm:inline-flex"
            >
              {t('public.cta.login')}
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark active:scale-95"
            >
              {t('public.cta.signup')}
            </Link>
            <button
              type="button"
              onClick={() => setDrawer((d) => !d)}
              aria-label="Menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 md:hidden"
            >
              {drawer ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {drawer && (
          <div className="border-t border-slate-200 bg-white px-5 py-4 shadow-md dark:border-slate-800 dark:bg-slate-950 md:hidden">
            <nav className="flex flex-col gap-1 text-sm font-medium">
              {NAV.map((n) => (
                <a
                  key={n.to}
                  href={n.to}
                  className="rounded-lg px-3 py-2.5 text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {t(n.labelKey)}
                </a>
              ))}
              <Link
                to="/login"
                className="mt-2 rounded-lg px-3 py-2.5 text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 dark:text-slate-200 dark:ring-slate-700"
              >
                {t('public.cta.login')}
              </Link>
            </nav>
          </div>
        )}
      </header>

      <main className="pt-16">{children}</main>

      <footer className="border-t border-slate-200 bg-slate-50 py-10 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 sm:px-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
                <BuildingIcon className="h-4 w-4" />
              </span>
              <span className="font-bold tracking-tight">Bailo</span>
            </Link>
            <p className="mt-3 max-w-sm text-sm text-slate-600 dark:text-slate-400">
              {t('public.footer.tagline')}
            </p>
            <p className="mt-4 text-xs text-slate-500">
              © {new Date().getFullYear()} Bailo · {t('public.footer.rights')}
            </p>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('public.footer.product')}
            </p>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <li><a href="/#features" className="hover:text-brand">{t('public.nav.features')}</a></li>
              <li><a href="/#pricing" className="hover:text-brand">{t('public.nav.pricing')}</a></li>
              <li><a href="/#faq" className="hover:text-brand">{t('public.nav.faq')}</a></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('public.footer.legal')}
            </p>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <li><Link to="/privacy" className="hover:text-brand">{t('public.footer.privacy')}</Link></li>
              <li><Link to="/signup" className="hover:text-brand">{t('public.cta.signup')}</Link></li>
              <li><Link to="/login" className="hover:text-brand">{t('public.cta.login')}</Link></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
