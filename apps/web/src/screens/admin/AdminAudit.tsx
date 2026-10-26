import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AuditEntryView,
  AuditFiltersQuery,
  AuditListResult,
  AuditAction,
} from '@bailo/shared';
import { AUDIT_ACTIONS } from '@bailo/shared';
import { authFetch, api, API, ApiError } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useToast } from '../../components/Toast';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  NativeSelect,
  PageSkeleton,
} from '../../components/ui';
import { DownloadIcon, ClockAlertIcon } from '../../components/icons';

/**
 * Admin → Journal d'audit (Lot 3).
 *
 * Lecture seule : filtres (période, acteur, entité, entityId, action,
 * sensible uniquement), pagination par curseur, détail dépliable avec vue
 * « avant → après » champ par champ, export CSV UTF-8 BOM.
 *
 * Côté API : OWNER voit tout, MANAGER voit ses sites + lignes sans site.
 * L'écran se fiche du rôle — l'API renvoie déjà la bonne portée.
 */

async function downloadWithAuth(url: string, filename: string): Promise<void> {
  const res = await authFetch(url);
  if (!res.ok) throw new ApiError(res.status, `Export impossible (${res.status})`);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function qsOf(f: Partial<AuditFiltersQuery>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === '' || v === null) continue;
    qs.set(k, String(v));
  }
  return qs.toString();
}

export function AdminAudit() {
  const { t } = useTranslation();
  const toast = useToast();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [actorId, setActorId] = useState('');
  const [entity, setEntity] = useState('');
  const [entityId, setEntityId] = useState('');
  const [action, setAction] = useState<'' | AuditAction>('');
  const [sensitiveOnly, setSensitiveOnly] = useState(false);

  const [pages, setPages] = useState<AuditEntryView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // Sérialisation des filtres pour détecter un changement effectif (vs typing).
  const serialized = JSON.stringify({ from, to, actorId, entity, entityId, action, sensitiveOnly });

  const load = useCallback(
    async (reset = true) => {
      setLoading(true);
      const base = {
        from: from || undefined,
        to: to || undefined,
        actorId: actorId || undefined,
        entity: entity || undefined,
        entityId: entityId || undefined,
        action: (action || undefined) as AuditAction | undefined,
        sensitiveOnly: sensitiveOnly ? true : undefined,
      };
      try {
        const qs = qsOf(reset ? base : { ...base, before: nextCursor ?? undefined });
        const res = await api.get<AuditListResult>(`/admin/audit${qs ? `?${qs}` : ''}`);
        setPages((prev) => (reset ? res.items : [...prev, ...res.items]));
        setNextCursor(res.nextCursor);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    // Dépendances explicites — on recharge à chaque changement de filtre
    // (serialized agrège tous les filtres ; nextCursor n'est pas une dép).
    [serialized], // eslint rules not configured for react-hooks/exhaustive-deps
  );

  useEffect(() => {
    void load(true);
  }, [serialized]);

  async function doExport() {
    setExporting(true);
    try {
      const qs = qsOf({
        from: from || undefined,
        to: to || undefined,
        actorId: actorId || undefined,
        entity: entity || undefined,
        entityId: entityId || undefined,
        action: (action || undefined) as AuditAction | undefined,
        sensitiveOnly: sensitiveOnly ? true : undefined,
      });
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadWithAuth(`${API}/admin/audit/export${qs ? `?${qs}` : ''}`, `bailo-audit-${stamp}.csv`);
      toast.success(t('adminAudit.exportDone'));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const total = pages.length;
  const sensitiveCount = useMemo(() => pages.filter((p) => p.sensitive).length, [pages]);

  return (
    <div className="space-y-5">
      {/* Barre de filtres */}
      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">{t('adminAudit.from')}</span>
            <Input type="datetime-local" value={from} onChange={(e) => setFrom(iso(e.target.value))} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">{t('adminAudit.to')}</span>
            <Input type="datetime-local" value={to} onChange={(e) => setTo(iso(e.target.value))} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">{t('adminAudit.entity')}</span>
            <Input
              placeholder="payment, user, tenant…"
              value={entity}
              onChange={(e) => setEntity(e.target.value.trim())}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">{t('adminAudit.entityId')}</span>
            <Input
              placeholder="UUID complet"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value.trim())}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">{t('adminAudit.actorId')}</span>
            <Input
              placeholder="UUID utilisateur"
              value={actorId}
              onChange={(e) => setActorId(e.target.value.trim())}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">{t('adminAudit.action')}</span>
            <NativeSelect value={action} onChange={(e) => setAction(e.target.value as AuditAction | '')}>
              <option value="">{t('adminAudit.allActions')}</option>
              {AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={sensitiveOnly}
              onChange={(e) => setSensitiveOnly(e.target.checked)}
              className="h-4 w-4"
            />
            {t('adminAudit.sensitiveOnly')}
          </label>
          <Button
            variant="secondary"
            size="sm"
            busy={exporting}
            disabled={total === 0}
            onClick={() => void doExport()}
          >
            <DownloadIcon className="h-4 w-4" />
            {t('adminAudit.export')}
          </Button>
        </div>
      </Card>

      {/* Métriques courantes */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
        <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
          {t('adminAudit.loaded', { n: total })}
        </span>
        {sensitiveCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 font-semibold text-amber-800">
            <ClockAlertIcon className="h-3.5 w-3.5" />
            {t('adminAudit.sensitiveN', { n: sensitiveCount })}
          </span>
        )}
      </div>

      {/* Tableau / cartes */}
      {pages.length === 0 && !loading ? (
        <EmptyState icon={ClockAlertIcon} message={t('adminAudit.empty')} />
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {pages.map((e) => {
              const isOpen = expanded.has(e.id);
              return (
                <li key={e.id} className="px-4 py-3 text-sm">
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => {
                        const n = new Set(prev);
                        if (n.has(e.id)) n.delete(e.id);
                        else n.add(e.id);
                        return n;
                      })
                    }
                    aria-expanded={isOpen}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <ActionBadge sensitive={e.sensitive} action={e.action} isRoleChange={e.isRoleChange} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900 dark:text-slate-100">
                        {e.entity}
                        <span className="ml-1.5 font-mono text-xs text-slate-400">
                          #{e.entityId.slice(0, 8)}
                        </span>
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {e.actorName ?? '—'} · {formatDate(e.createdAt)}
                        {e.reason && ` · ${e.reason}`}
                      </span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-700">
                      <Diff before={e.before} after={e.after} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-700">
            <span>{t('adminAudit.loaded', { n: total })}</span>
            <Button
              variant="secondary"
              size="sm"
              busy={loading}
              disabled={!nextCursor}
              onClick={() => void load(false)}
            >
              {nextCursor ? t('adminAudit.loadMore') : t('adminAudit.endOfList')}
            </Button>
          </div>
        </Card>
      )}

      {loading && pages.length === 0 && <PageSkeleton variant="rows" />}
    </div>
  );
}

function ActionBadge({
  sensitive,
  action,
  isRoleChange,
}: {
  sensitive: boolean;
  action: AuditAction;
  isRoleChange: boolean;
}) {
  const { t } = useTranslation();
  const label = isRoleChange ? t('adminAudit.roleChange') : action;
  const tone =
    action === 'VOID' || action === 'DELETE'
      ? 'red'
      : sensitive
        ? 'amber'
        : action === 'CREATE'
          ? 'emerald'
          : 'slate';
  return <Badge tone={tone}>{label}</Badge>;
}

/** Diff lisible champ par champ entre `before` et `after` (objets JSON plats). */
function Diff({ before, after }: { before: unknown; after: unknown }) {
  const { t } = useTranslation();
  const b = (before && typeof before === 'object' ? (before as Record<string, unknown>) : null) ?? null;
  const a = (after && typeof after === 'object' ? (after as Record<string, unknown>) : null) ?? null;

  if (!b && !a) {
    return <p className="text-xs text-slate-500">{t('adminAudit.noPayload')}</p>;
  }

  // Clés à afficher : union triée de b et a. Les lignes identiques sont masquées.
  const keys = Array.from(new Set([...(b ? Object.keys(b) : []), ...(a ? Object.keys(a) : [])])).sort();

  return (
    <div className="space-y-1 font-mono text-xs">
      {keys.map((k) => {
        const bv = b?.[k];
        const av = a?.[k];
        const same = JSON.stringify(bv) === JSON.stringify(av);
        if (same) return null;
        return (
          <div key={k} className="grid grid-cols-[auto_1fr_1fr] gap-2">
            <span className="font-semibold text-slate-500 dark:text-slate-400">{k}</span>
            <span className="truncate text-red-700 line-through dark:text-red-400">
              {renderValue(bv)}
            </span>
            <span className="truncate text-emerald-700 dark:text-emerald-400">{renderValue(av)}</span>
          </div>
        );
      })}
    </div>
  );
}

function renderValue(v: unknown): string {
  if (v === undefined) return '—';
  if (v === null) return 'null';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Convertit un input datetime-local en ISO UTC pour que le backend l'accepte. */
function iso(local: string): string {
  if (!local) return '';
  try {
    return new Date(local).toISOString();
  } catch {
    return local;
  }
}
