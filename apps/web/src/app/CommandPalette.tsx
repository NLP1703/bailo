import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { normalize, visibleSections } from './navigation';
import {
  BuildingIcon,
  ChevronRightIcon,
  CornerDownLeftIcon,
  SearchIcon,
  UsersIcon,
  type IconProps,
} from '../components/icons';

type Color = 'GREEN' | 'ORANGE' | 'RED' | 'GREY' | 'BLUE';

interface TenantHit {
  id: string;
  name: string;
  phone: string | null;
  unitCode: string | null;
  siteName: string | null;
  color: Color;
}
interface SiteHit {
  id: string;
  name: string;
  city?: string | null;
}

interface Result {
  group: 'pages' | 'tenants' | 'sites';
  key: string;
  to: string;
  label: string;
  sub?: string;
  Icon?: ComponentType<IconProps>;
  dot?: string;
}

const DOT: Record<Color, string> = {
  GREEN: 'bg-emerald-500',
  ORANGE: 'bg-amber-500',
  RED: 'bg-red-500',
  BLUE: 'bg-sky-500',
  GREY: 'bg-slate-300',
};

/**
 * Recherche globale façon « palette de commandes » (Ctrl+K ou « / »).
 * Trouve un écran, un locataire (nom, téléphone, code chambre) ou une cité,
 * puis y amène en un appui sur Entrée.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMgmt = user?.role === 'OWNER' || user?.role === 'MANAGER';

  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [tenants, setTenants] = useState<TenantHit[]>([]);
  const [sites, setSites] = useState<SiteHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  // Réinitialise à chaque ouverture ; charge les cités une fois.
  useEffect(() => {
    if (!open) return;
    setQ('');
    setActive(0);
    setTenants([]);
    if (isMgmt && sites === null) {
      api
        .get<SiteHit[]>('/sites')
        .then(setSites)
        .catch(() => setSites([]));
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
    // Dépend volontairement de `open` seul : on réinitialise à chaque ouverture.
  }, [open]);

  // Locataires : recherche serveur, avec un léger délai pendant la frappe.
  useEffect(() => {
    const term = q.trim();
    if (!open || !isMgmt || term.length < 2) {
      setTenants([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = setTimeout(() => {
      api
        .get<TenantHit[]>(`/tenants?q=${encodeURIComponent(term)}`)
        .then((rows) => setTenants(rows.slice(0, 6)))
        .catch(() => setTenants([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(id);
  }, [q, open, isMgmt]);

  const results = useMemo<Result[]>(() => {
    const term = normalize(q.trim());
    const pages: Result[] = visibleSections(user).flatMap((s) =>
      s.items
        .filter((i) => {
          if (!term) return true;
          const hay = normalize(`${t(i.labelKey)} ${t(s.labelKey)} ${i.keywords ?? ''}`);
          return hay.includes(term);
        })
        .map((i) => ({
          group: 'pages' as const,
          key: `p:${i.to}`,
          to: i.to,
          label: t(i.labelKey),
          sub: t(s.labelKey),
          Icon: i.Icon,
        })),
    );
    const tenantHits: Result[] = tenants.map((tn) => ({
      group: 'tenants',
      key: `t:${tn.id}`,
      to: `/tenants/${tn.id}`,
      label: tn.name,
      sub: [tn.unitCode, tn.siteName, tn.phone].filter(Boolean).join(' · '),
      dot: DOT[tn.color] ?? DOT.GREY,
    }));
    const siteHits: Result[] = term
      ? (sites ?? [])
          .filter((s) => normalize(`${s.name} ${s.city ?? ''}`).includes(term))
          .slice(0, 5)
          .map((s) => ({
            group: 'sites',
            key: `s:${s.id}`,
            to: `/sites/${s.id}`,
            label: s.name,
            sub: s.city ?? undefined,
            Icon: BuildingIcon,
          }))
      : [];
    return [...pages, ...tenantHits, ...siteHits];
  }, [q, tenants, sites, user, t]);

  // Garde la sélection dans les bornes quand la liste change.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)));
  }, [results.length]);

  // Fait défiler l'élément actif dans la zone visible.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const go = (r: Result | undefined) => {
    if (!r) return;
    onClose();
    navigate(r.to);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (results.length ? (a + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const groupLabel: Record<Result['group'], string> = {
    pages: t('search.groupPages'),
    tenants: t('search.groupTenants'),
    sites: t('search.groupSites'),
  };

  const term = q.trim();
  const showTenantHint = isMgmt && term.length > 0 && term.length < 2;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 pt-[8vh] sm:p-6 sm:pt-[12vh]">
      <div
        className="absolute inset-0 animate-fade-in bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('search.title')}
        className="relative flex max-h-[75vh] w-full max-w-xl animate-pop-in flex-col overflow-hidden rounded-2xl bg-white shadow-pop ring-1 ring-slate-200"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4">
          <SearchIcon className="h-5 w-5 shrink-0 text-slate-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            placeholder={isMgmt ? t('search.placeholder') : t('search.placeholderPages')}
            className="h-14 w-full bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
            aria-controls="cmdk-list"
            aria-activedescendant={results[active] ? `cmdk-${results[active].key}` : undefined}
          />
          {loading && (
            <svg className="h-4 w-4 shrink-0 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )}
          <kbd className="hidden shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 sm:inline">
            {t('search.esc')}
          </kbd>
        </div>

        <ul id="cmdk-list" ref={listRef} role="listbox" className="scrollbar-thin flex-1 overflow-y-auto p-2">
          {results.length === 0 && !loading && (
            <li className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-slate-500">
              <UsersIcon className="h-7 w-7 text-slate-300" />
              {t('search.empty', { q: term })}
            </li>
          )}
          {results.map((r, idx) => {
            const first = idx === 0 || results[idx - 1]?.group !== r.group;
            const isActive = idx === active;
            return (
              <li key={r.key} role="presentation">
                {first && (
                  <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 first:pt-1">
                    {groupLabel[r.group]}
                  </div>
                )}
                <button
                  id={`cmdk-${r.key}`}
                  data-idx={idx}
                  role="option"
                  aria-selected={isActive}
                  onMouseMove={() => setActive(idx)}
                  onClick={() => go(r)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                    isActive ? 'bg-brand-soft text-slate-900' : 'text-slate-700'
                  }`}
                >
                  {r.Icon ? (
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${
                        isActive
                          ? 'bg-white text-brand ring-brand/20'
                          : 'bg-slate-50 text-slate-500 ring-slate-200'
                      }`}
                    >
                      <r.Icon className="h-4 w-4" />
                    </span>
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                      {r.label.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{r.label}</span>
                      {r.dot && <span className={`h-2 w-2 shrink-0 rounded-full ${r.dot}`} />}
                    </span>
                    {r.sub && <span className="block truncate text-xs text-slate-400">{r.sub}</span>}
                  </span>
                  {isActive ? (
                    <CornerDownLeftIcon className="h-4 w-4 shrink-0 text-brand" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-300" />
                  )}
                </button>
              </li>
            );
          })}
          {showTenantHint && (
            <li className="px-3 py-2 text-xs text-slate-400">{t('search.minChars')}</li>
          )}
        </ul>

        <div className="hidden items-center gap-4 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500 sm:flex">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> {t('search.hintNavigate')}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> {t('search.hintOpen')}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd> {t('search.hintToggle')}
          </span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[20px] items-center justify-center rounded border border-slate-200 bg-white px-1 py-px font-sans text-[11px] font-medium text-slate-600 shadow-sm">
      {children}
    </kbd>
  );
}
