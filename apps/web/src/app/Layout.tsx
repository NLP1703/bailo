import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { SidebarContent } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';
import { PrintLetterhead } from '../components/PrintLetterhead';

const COLLAPSE_KEY = 'bailo.sidebarCollapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Cadre de l'espace connecté, façon back-office :
 *  - ordinateur (≥ 1024 px) : sidebar fixe par rubriques, repliable en icônes ;
 *  - mobile : la même navigation dans un tiroir coulissant ;
 *  - barre du haut avec fil d'Ariane, recherche globale (Ctrl+K) et compte.
 */
export function Layout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* préférence non mémorisée, sans conséquence */
      }
      return !c;
    });

  // Le tiroir mobile se referme à chaque changement de page ; on remonte en haut.
  useEffect(() => {
    setDrawerOpen(false);
    window.scrollTo({ top: 0 });
  }, [pathname]);

  // Raccourcis : Ctrl/⌘+K partout, « / » hors champ de saisie, Échap ferme le tiroir.
  const onKey = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const typing =
      !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setSearchOpen((o) => !o);
    } else if (e.key === '/' && !typing) {
      e.preventDefault();
      setSearchOpen(true);
    } else if (e.key === 'Escape') {
      setDrawerOpen(false);
    }
  }, []);
  useEffect(() => {
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onKey]);

  const sidebarWidth = collapsed ? 'lg:w-[76px]' : 'lg:w-64';
  const contentOffset = collapsed ? 'lg:pl-[76px]' : 'lg:pl-64';

  return (
    <div className="min-h-screen bg-[#f6f7f9] print:min-h-0 print:bg-white">
      {/* Sidebar fixe — ordinateur */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden border-r border-slate-200/80 bg-white transition-[width] duration-200 lg:block print:!hidden ${sidebarWidth}`}
      >
        <SidebarContent collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </aside>

      {/* Tiroir — mobile */}
      <div className={`lg:hidden print:hidden ${drawerOpen ? '' : 'pointer-events-none'}`} aria-hidden={!drawerOpen}>
        <div
          className={`fixed inset-0 z-40 bg-slate-900/40 transition-opacity duration-200 ${
            drawerOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setDrawerOpen(false)}
        />
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85%] bg-white shadow-pop transition-transform duration-200 ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <SidebarContent onNavigate={() => setDrawerOpen(false)} onClose={() => setDrawerOpen(false)} />
        </aside>
      </div>

      {/* Zone principale */}
      <div className={`flex min-h-screen flex-col transition-[padding] duration-200 print:min-h-0 print:!pl-0 ${contentOffset}`}>
        <Topbar onOpenMenu={() => setDrawerOpen(true)} onOpenSearch={() => setSearchOpen(true)} />

        {user?.readOnly && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm font-medium text-amber-800 sm:px-6 lg:px-8 print:hidden">
            {t('billing.readOnlyBanner')}
            {user.role === 'OWNER' && (
              <Link to="/plans" className="ml-2 font-semibold underline underline-offset-2 hover:text-amber-900">
                {t('billing.manage')}
              </Link>
            )}
          </div>
        )}

        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8 print:!p-0">
          <div className="mx-auto w-full max-w-7xl print:max-w-none">
            <PrintLetterhead />
            <Outlet />
          </div>
        </main>
      </div>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
