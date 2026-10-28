import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AdminUserView,
  CreateInvitationDto,
  InvitationView,
  PaginatedResult,
  UpdateAdminUserDto,
  UserRole,
} from '@bailo/shared';
import { ADMIN_USER_ERRORS, USER_ROLES } from '@bailo/shared';
import { api, ApiError } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import { useConfirm } from '../../components/Confirm';
import { useToast } from '../../components/Toast';
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  NativeSelect,
  PageSkeleton,
} from '../../components/ui';
import { KeyIcon, LogOutIcon, MailIcon, PencilIcon, UserPlusIcon, UsersIcon, XIcon } from '../../components/icons';

interface Site {
  id: string;
  name: string;
}

/**
 * Admin → Équipe (OWNER uniquement).
 * Liste paginée + filtres (rôle, actif, recherche), édition inline d'un
 * utilisateur (rôle, actif, sites assignés), réinitialisation du mot de passe
 * (code envoyé par e-mail), révocation forcée des sessions, invitation
 * par e-mail (lien d'activation) avec renvoi. Les réponses d'erreur de l'API portent un code applicatif
 * (ADMIN_USER_LAST_OWNER…) qu'on affiche en toast dédié.
 */
export function AdminTeam() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | UserRole>('');
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedResult<AdminUserView> | null>(null);
  const [invitations, setInvitations] = useState<InvitationView[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [editing, setEditing] = useState<AdminUserView | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (search.trim()) qs.set('search', search.trim());
    if (roleFilter) qs.set('role', roleFilter);
    if (activeFilter) qs.set('active', activeFilter);
    try {
      const res = await api.get<PaginatedResult<AdminUserView>>(
        `/admin/users?${qs.toString()}`,
      );
      setData(res);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [page, search, roleFilter, activeFilter, toast]);

  const loadInvitations = useCallback(async () => {
    try {
      const list = await api.get<InvitationView[]>('/admin/invitations');
      setInvitations(list.filter((i) => !i.usedAt && !i.revokedAt));
    } catch {
      /* liste optionnelle, pas de blocage */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadInvitations();
    api
      .get<Site[]>('/sites')
      .then(setSites)
      .catch(() => setSites([]));
  }, [loadInvitations]);

  // Debounce de la recherche (300 ms) pour éviter une requête par touche.
  useEffect(() => {
    const id = setTimeout(() => setPage(1), 300);
    return () => clearTimeout(id);
  }, [search, roleFilter, activeFilter]);

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1),
    [data],
  );

  async function patchUser(target: AdminUserView, patch: UpdateAdminUserDto) {
    try {
      const updated = await api.patch<AdminUserView>(`/admin/users/${target.id}`, patch);
      toast.success(t('adminTeam.saved'));
      setEditing(updated);
      void load();
    } catch (e) {
      if (e instanceof ApiError && e.code === ADMIN_USER_ERRORS.LAST_OWNER) {
        toast.error(t('adminTeam.err.lastOwner'));
      } else if (e instanceof ApiError && e.code === ADMIN_USER_ERRORS.SELF_ROLE_CHANGE) {
        toast.error(t('adminTeam.err.selfRole'));
      } else if (e instanceof ApiError && e.code === ADMIN_USER_ERRORS.SELF_DEACTIVATE) {
        toast.error(t('adminTeam.err.selfDeactivate'));
      } else {
        toast.error((e as Error).message);
      }
    }
  }

  async function resetPassword(target: AdminUserView) {
    const ok = await confirm({
      title: t('adminTeam.confirm.resetTitle', { name: target.name }),
      message: t('adminTeam.confirm.resetMsg', { email: target.email ?? '' }),
      confirmLabel: t('adminTeam.resetBtn'),
    });
    if (!ok) return;
    try {
      const { email } = await api.post<{ email: string }>(
        `/admin/users/${target.id}/reset-password`,
        {},
      );
      toast.success(t('adminTeam.resetSent', { email }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function revokeSessions(target: AdminUserView) {
    const ok = await confirm({
      title: t('adminTeam.confirm.revokeTitle', { name: target.name }),
      message: t('adminTeam.confirm.revokeMsg'),
      confirmLabel: t('adminTeam.revokeBtn'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const { revoked } = await api.post<{ revoked: number }>(
        `/admin/users/${target.id}/revoke-sessions`,
        {},
      );
      toast.success(t('adminTeam.revokeOk', { n: revoked }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function resendInvitation(inv: InvitationView) {
    try {
      const view = await api.post<InvitationView>(`/admin/invitations/${inv.id}/resend`, {});
      announceInvitation(view);
      void loadInvitations();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  /** Confirme l'envoi ; si l'e-mail n'a pas pu partir, copie le lien à partager à la main. */
  function announceInvitation(view: InvitationView) {
    if (view.emailSent) {
      toast.success(t('adminTeam.inviteEmailSent', { email: view.email }));
    } else if (view.acceptUrl) {
      navigator.clipboard?.writeText(view.acceptUrl).catch(() => undefined);
      toast.error(t('adminTeam.inviteEmailFailed'));
    }
  }

  async function revokeInvitation(inv: InvitationView) {
    const ok = await confirm({
      title: t('adminTeam.confirm.revokeInvTitle', { name: inv.name }),
      message: t('adminTeam.confirm.revokeInvMsg'),
      confirmLabel: t('adminTeam.revokeBtn'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/invitations/${inv.id}`);
      toast.success(t('adminTeam.invRevoked'));
      void loadInvitations();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!data) return <PageSkeleton variant="list" />;

  return (
    <div className="space-y-5">
      {/* Barre d'outils */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-1 flex-wrap gap-3">
          <label className="flex-1 min-w-[180px]">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              {t('adminTeam.search')}
            </span>
            <Input
              placeholder={t('adminTeam.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-slate-500">
              {t('adminTeam.role')}
            </span>
            <NativeSelect value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as UserRole | '')}>
              <option value="">{t('adminTeam.allRoles')}</option>
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`profile.role.${r}`)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-slate-500">
              {t('adminTeam.status')}
            </span>
            <NativeSelect value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as '' | 'true' | 'false')}>
              <option value="">{t('adminTeam.allStatus')}</option>
              <option value="true">{t('adminTeam.active')}</option>
              <option value="false">{t('adminTeam.inactive')}</option>
            </NativeSelect>
          </label>
        </div>
        <Button onClick={() => setShowInvite(true)}>
          <UserPlusIcon className="h-4 w-4" />
          {t('adminTeam.invite')}
        </Button>
      </div>

      {/* Invitations en attente */}
      {invitations.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">
            {t('adminTeam.pendingInvitations', { n: invitations.length })}
          </h2>
          <ul className="divide-y divide-slate-100">
            {invitations.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900">
                    {i.name} · {t(`profile.role.${i.role}`)}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {i.email ?? i.phone} · {t('adminTeam.expiresOn', { date: formatDate(i.expiresAt) })}
                  </span>
                </span>
                {i.email && (
                  <Button variant="ghost" size="sm" onClick={() => void resendInvitation(i)}>
                    <MailIcon className="h-4 w-4" />
                    {t('adminTeam.resendBtn')}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => void revokeInvitation(i)}>
                  <XIcon className="h-4 w-4" />
                  {t('adminTeam.revokeBtn')}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Liste des utilisateurs */}
      {data.items.length === 0 ? (
        <EmptyState icon={UsersIcon} message={t('adminTeam.empty')} />
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-slate-100">
            {data.items.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    u.active ? 'bg-brand/10 text-brand' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {u.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium text-slate-900">{u.name}</span>
                    {u.id === me?.id && (
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                        {t('adminTeam.you')}
                      </span>
                    )}
                    {!u.active && (
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                        {t('adminTeam.inactive')}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {t(`profile.role.${u.role}`)} · {u.phone}
                    {u.lastLoginAt && ` · ${t('adminTeam.lastLogin', { date: formatDate(u.lastLoginAt) })}`}
                  </span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>
                  <PencilIcon className="h-4 w-4" />
                  {t('adminTeam.editBtn')}
                </Button>
              </li>
            ))}
          </ul>
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm">
              <span className="text-xs text-slate-500">
                {t('adminTeam.pagerSummary', {
                  from: (data.page - 1) * data.pageSize + 1,
                  to: Math.min(data.total, data.page * data.pageSize),
                  total: data.total,
                })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={data.page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t('table.prev')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={data.page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('table.next')}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {editing && (
        <EditUserSheet
          user={editing}
          sites={sites}
          isSelf={editing.id === me?.id}
          onClose={() => setEditing(null)}
          onSave={(patch) => patchUser(editing, patch)}
          onResetPassword={() => resetPassword(editing)}
          onRevokeSessions={() => revokeSessions(editing)}
        />
      )}

      {showInvite && (
        <InviteSheet
          sites={sites}
          onClose={() => setShowInvite(false)}
          onCreated={(view) => {
            setShowInvite(false);
            void loadInvitations();
            void load();
            announceInvitation(view);
          }}
        />
      )}
    </div>
  );
}

// ─── Modales (bottom-sheet mobile) ─────────────────────────────────────────────

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg animate-slide-up rounded-t-2xl bg-white px-5 pb-5 pt-3 pb-safe shadow-pop sm:animate-pop-in sm:rounded-2xl sm:p-6">
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="-mr-1 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function EditUserSheet({
  user,
  sites,
  isSelf,
  onClose,
  onSave,
  onResetPassword,
  onRevokeSessions,
}: {
  user: AdminUserView;
  sites: Site[];
  isSelf: boolean;
  onClose: () => void;
  onSave: (patch: UpdateAdminUserDto) => void | Promise<void>;
  onResetPassword: () => void;
  onRevokeSessions: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? '');
  const [role, setRole] = useState<UserRole>(user.role);
  const [active, setActive] = useState(user.active);
  const [siteIds, setSiteIds] = useState<string[]>(user.sites.map((s) => s.id));

  function toggleSite(id: string) {
    setSiteIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <Sheet title={t('adminTeam.editTitle', { name: user.name })} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <Label>{t('adminTeam.name')}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>{t('adminTeam.emailEdit')}</Label>
          <Input
            type="email"
            value={email}
            placeholder="nom@exemple.com"
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">{t('adminTeam.emailHint')}</p>
        </div>
        <div>
          <Label>{t('adminTeam.role')}</Label>
          <NativeSelect
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            disabled={isSelf}
          >
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`profile.role.${r}`)}
              </option>
            ))}
          </NativeSelect>
          {isSelf && (
            <p className="mt-1 text-xs text-slate-500">{t('adminTeam.cantChangeSelfRole')}</p>
          )}
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-200">
          <input
            type="checkbox"
            id="active"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            disabled={isSelf}
            className="h-4 w-4"
          />
          <label htmlFor="active" className="text-sm text-slate-700">
            {t('adminTeam.activeLabel')}
          </label>
        </div>
        {sites.length > 0 && (role === 'MANAGER' || role === 'CARETAKER') && (
          <div>
            <Label>{t('adminTeam.sites')}</Label>
            <ul className="space-y-1.5 rounded-lg bg-slate-50 p-2 ring-1 ring-inset ring-slate-200">
              {sites.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={siteIds.includes(s.id)}
                    onChange={() => toggleSite(s.id)}
                    className="h-4 w-4"
                  />
                  <span>{s.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 text-sm">
          <Button
            variant="secondary"
            size="sm"
            onClick={onResetPassword}
            disabled={!user.email}
            title={user.email ? undefined : t('adminTeam.resetNeedsEmail')}
          >
            <KeyIcon className="h-4 w-4" />
            {t('adminTeam.resetBtn')}
          </Button>
          <Button variant="secondary" size="sm" onClick={onRevokeSessions}>
            <LogOutIcon className="h-4 w-4" />
            {t('adminTeam.revokeAllBtn')}
          </Button>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" className="h-12 sm:h-10" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            className="h-12 sm:h-10"
            onClick={() => {
              const patch: UpdateAdminUserDto = {
                name: name !== user.name ? name : undefined,
                email:
                  email.trim() === (user.email ?? '')
                    ? undefined
                    : email.trim()
                      ? email.trim()
                      : null,
                role: role !== user.role ? role : undefined,
                active: active !== user.active ? active : undefined,
                siteIds:
                  JSON.stringify(siteIds.sort()) !==
                  JSON.stringify(user.sites.map((s) => s.id).sort())
                    ? siteIds
                    : undefined,
              };
              void onSave(patch);
            }}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function InviteSheet({
  sites,
  onClose,
  onCreated,
}: {
  sites: Site[];
  onClose: () => void;
  onCreated: (view: InvitationView) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState('');
  const [phoneValue, setPhone] = useState('');
  const [emailValue, setEmail] = useState('');
  const [role, setRole] = useState<'MANAGER' | 'CARETAKER'>('CARETAKER');
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function toggleSite(id: string) {
    setSiteIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit() {
    setBusy(true);
    try {
      const body: CreateInvitationDto = {
        name,
        phone: phoneValue,
        email: emailValue.trim(),
        role,
        siteIds,
        ttlHours: 72,
      };
      const inv = await api.post<InvitationView>('/admin/invitations', body);
      onCreated(inv);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={t('adminTeam.invite')} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <Label>{t('adminTeam.name')}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jean Mballa" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>{t('adminTeam.phoneLabel')}</Label>
            <Input
              value={phoneValue}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="690000000"
              inputMode="tel"
            />
          </div>
          <div>
            <Label>{t('adminTeam.inviteEmailLabel')}</Label>
            <Input
              value={emailValue}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jean@example.com"
              type="email"
            />
          </div>
        </div>
        <div>
          <Label>{t('adminTeam.role')}</Label>
          <NativeSelect value={role} onChange={(e) => setRole(e.target.value as 'MANAGER' | 'CARETAKER')}>
            <option value="MANAGER">{t('profile.role.MANAGER')}</option>
            <option value="CARETAKER">{t('profile.role.CARETAKER')}</option>
          </NativeSelect>
        </div>
        {sites.length > 0 && (
          <div>
            <Label>{t('adminTeam.sites')}</Label>
            <ul className="space-y-1.5 rounded-lg bg-slate-50 p-2 ring-1 ring-inset ring-slate-200">
              {sites.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={siteIds.includes(s.id)}
                    onChange={() => toggleSite(s.id)}
                    className="h-4 w-4"
                  />
                  <span>{s.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" className="h-12 sm:h-10" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            className="h-12 sm:h-10"
            busy={busy}
            disabled={!name || !phoneValue || !/^\S+@\S+\.\S+$/.test(emailValue.trim())}
            onClick={() => void submit()}
          >
            {t('adminTeam.sendInvite')}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
