import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { Link } from 'react-router-dom';
import type { BillingSummary } from '@bailo/shared';
import { api, ApiError, clearTokens } from '../lib/api';
import { useAuth } from '../lib/auth';
import { FileField } from '../components/FileField';
import { SignedImage } from '../components/SignedImage';
import { useConfirm } from '../components/Confirm';
import { useToast } from '../components/Toast';
import {
  PageHeader,
  Card,
  Input,
  TextArea,
  NativeSelect,
  Button,
  Label,
  Badge,
} from '../components/ui';
import { PlusIcon, CheckIcon, PencilIcon, TrashIcon, ChevronRightIcon } from '../components/icons';

interface Site {
  id: string;
  name: string;
  type: string;
}
interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  role: string;
  active: boolean;
  siteIds: string[];
}
interface Account {
  id: string;
  name: string;
  phone: string;
  logoKey: string | null;
  receiptFooter: string | null;
}

export function Settings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();

  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Abonnement (M9).
  const [billing, setBilling] = useState<BillingSummary | null>(null);

  // Profil du compte (F1.5).
  const [account, setAccount] = useState<Account | null>(null);
  const [accountName, setAccountName] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);
  const isOwner = user?.role === 'OWNER';
  const isManagerOrOwner = isOwner || user?.role === 'MANAGER';

  // Création de site.
  const [siteName, setSiteName] = useState('');
  const [siteType, setSiteType] = useState('CITE');

  // Création de chambres en série.
  const [bulkSite, setBulkSite] = useState('');
  const [prefix, setPrefix] = useState('A');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('10');
  const [rent, setRent] = useState('25000');

  // Invitation.
  const [uName, setUName] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uPhone, setUPhone] = useState('');
  const [uRole, setURole] = useState('CARETAKER');
  const [uPass, setUPass] = useState('');
  const [uSites, setUSites] = useState<string[]>([]);

  // Édition d'un utilisateur existant (CRUD).
  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState('');
  const [eEmail, setEEmail] = useState('');
  const [eRole, setERole] = useState('CARETAKER');
  const [eSites, setESites] = useState<string[]>([]);
  const [userError, setUserError] = useState('');

  const loadSites = () => api.get<Site[]>('/sites').then(setSites);
  const loadUsers = () =>
    api
      .get<User[]>('/users')
      .then(setUsers)
      .catch(() => setUsers([]));
  const loadAccount = () =>
    api
      .get<Account>('/account')
      .then((a) => {
        setAccount(a);
        setAccountName(a.name);
        setReceiptFooter(a.receiptFooter ?? '');
      })
      .catch(() => setAccount(null));
  const loadBilling = () =>
    api
      .get<BillingSummary>('/account/billing')
      .then(setBilling)
      .catch(() => setBilling(null));
  useEffect(() => {
    void loadSites();
    void loadUsers();
    void loadAccount();
    void loadBilling();
  }, []);

  const saveProfile = async (patch: Record<string, unknown>) => {
    await api.patch('/account', patch);
    setProfileSaved(true);
    await loadAccount();
  };

  const setLang = (lng: string) => {
    localStorage.setItem('lang', lng);
    void i18n.changeLanguage(lng);
  };

  const createSite = async () => {
    if (siteName.length < 2) return;
    await api.post('/sites', { name: siteName, type: siteType });
    setSiteName('');
    await loadSites();
  };

  const createBulk = async () => {
    if (!bulkSite) return;
    await api.post(`/sites/${bulkSite}/units/bulk`, {
      prefix,
      from: Number(from),
      to: Number(to),
      baseRent: Number(rent),
    });
    setFrom('1');
    setTo('10');
  };

  const invite = async () => {
    if (uName.length < 2 || uPhone.length < 8 || uPass.length < 8) return;
    await api.post('/users/invite', {
      name: uName,
      ...(uEmail.trim() ? { email: uEmail.trim() } : {}),
      phone: uPhone,
      role: uRole,
      password: uPass,
      siteIds: uSites,
    });
    setUName('');
    setUEmail('');
    setUPhone('');
    setUPass('');
    setUSites([]);
    await loadUsers();
  };

  const toggleActive = async (u: User) => {
    await api.patch(`/users/${u.id}`, { active: !u.active });
    await loadUsers();
  };

  const startEdit = (u: User) => {
    setEditId(u.id);
    setEName(u.name);
    setEEmail(u.email ?? '');
    setERole(u.role);
    setESites(u.siteIds ?? []);
    setUserError('');
  };

  const cancelEdit = () => {
    setEditId(null);
    setUserError('');
  };

  const saveEdit = async (u: User) => {
    setUserError('');
    try {
      await api.patch(`/users/${u.id}`, {
        name: eName,
        email: eEmail.trim() || undefined,
        ...(u.role === 'OWNER' ? {} : { role: eRole, siteIds: eSites }),
      });
      setEditId(null);
      await loadUsers();
    } catch (err) {
      setUserError(err instanceof ApiError ? err.message : t('signup.error'));
    }
  };

  const removeUser = async (u: User) => {
    setUserError('');
    const ok = await confirm({
      title: t('settings.deleteConfirm', { name: u.name }),
      message: t('confirm.deleteUserMsg'),
      confirmLabel: t('settings.deleteUser'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.del(`/users/${u.id}`);
      toast.success(t('confirm.userDeleted', { name: u.name }));
      await loadUsers();
    } catch (err) {
      setUserError(err instanceof ApiError ? err.message : t('signup.error'));
    }
  };

  // Suppression de son propre compte : OWNER → tout le compte ; sinon son seul accès.
  const deleteOwnAccount = async () => {
    const warn = isOwner
      ? t('settings.deleteAccountOwnerWarn')
      : t('settings.deleteAccountSelfWarn');
    const ok = await confirm({
      title: t('settings.deleteAccountConfirm'),
      message: warn,
      confirmLabel: t('settings.deleteMyAccount'),
      tone: 'danger',
      // Action la plus lourde de l'app : on fait recopier un mot pour éviter le clic réflexe.
      requireText: t('confirm.deleteWord'),
    });
    if (!ok) return;
    try {
      await api.del(isOwner ? '/account' : '/me');
      clearTokens();
      window.location.href = '/';
    } catch (err) {
      setUserError(err instanceof ApiError ? err.message : t('signup.error'));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('settings.title')} subtitle={t('pageSub.settings')} />

      {/* Profil + langue */}
      <Card className="space-y-3">
        <div className="font-semibold text-slate-900">{t('settings.profile')}</div>
        <p className="text-sm text-slate-500">
          {user?.name} · {user?.phone}
        </p>

        {isOwner && account && (
          <div className="space-y-3 border-t border-slate-100 pt-3">
            <div className="flex items-center gap-3">
              {account.logoKey ? (
                <SignedImage
                  objectKey={account.logoKey}
                  alt={account.name}
                  className="h-12 w-12 rounded-lg object-contain ring-1 ring-slate-200"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-center text-[10px] leading-tight text-slate-400">
                  {t('settings.logo')}
                </div>
              )}
              <FileField
                purpose="account-logo"
                label={t('settings.logo')}
                onUploaded={(key) => key && void saveProfile({ logoKey: key })}
              />
            </div>
            <div>
              <Label>{t('settings.accountName')}</Label>
              <Input
                value={accountName}
                onChange={(e) => {
                  setAccountName(e.target.value);
                  setProfileSaved(false);
                }}
                placeholder={t('settings.accountName')}
              />
            </div>
            <div>
              <Label>{t('settings.receiptFooter')}</Label>
              <TextArea
                className="h-20"
                value={receiptFooter}
                onChange={(e) => {
                  setReceiptFooter(e.target.value);
                  setProfileSaved(false);
                }}
                placeholder={t('settings.receiptFooter')}
              />
            </div>
            <Button
              block
              onClick={() =>
                void saveProfile({ name: accountName, receiptFooter: receiptFooter || null })
              }
              disabled={accountName.trim().length < 2}
            >
              {t('common.save')}
            </Button>
            {profileSaved && (
              <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                <CheckIcon className="h-4 w-4" />
                {t('settings.profileSaved')}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-sm font-medium text-slate-600">{t('settings.language')}</span>
          <Button
            variant={i18n.language === 'fr' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setLang('fr')}
          >
            FR
          </Button>
          <Button
            variant={i18n.language === 'en' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setLang('en')}
          >
            EN
          </Button>
        </div>
      </Card>

      {/* L'abonnement a sa propre page, accessible depuis la sidebar (Offres). */}
      {isOwner && billing && (
        <Card className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-slate-900">{t('billing.title')}</div>
            <div className="text-xs text-slate-500">
              {t(`billing.plan.${billing.plan}`)} ·{' '}
              {billing.usage.units}
              {billing.limits.maxUnits !== null ? ` / ${billing.limits.maxUnits}` : ''}{' '}
              {t('billing.units').toLowerCase()}
            </div>
          </div>
          <Link to="/plans">
            <Button variant="secondary" size="sm">
              {t('billing.manage')}
            </Button>
          </Link>
        </Card>
      )}

      {/* Sites + chambres en série */}
      {isManagerOrOwner && (
      <Card className="space-y-3">
        <div className="font-semibold text-slate-900">{t('settings.sites')}</div>
        {sites.length > 0 && (
          <ul className="divide-y divide-slate-100 text-sm">
            {sites.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/sites/${s.id}`}
                  className="flex items-center justify-between gap-2 py-2 transition hover:text-brand"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-slate-700">{s.name}</span>
                    <ChevronRightIcon className="h-4 w-4 text-slate-300" />
                  </span>
                  <Badge>{s.type}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 border-t border-slate-100 pt-3">
          <Input
            placeholder={t('settings.siteName')}
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
          />
          <NativeSelect
            className="!w-auto"
            value={siteType}
            onChange={(e) => setSiteType(e.target.value)}
          >
            <option value="CITE">CITE</option>
            <option value="IMMEUBLE">IMMEUBLE</option>
            <option value="MIXTE">MIXTE</option>
          </NativeSelect>
          <Button onClick={createSite} aria-label={t('settings.createSite')}>
            <PlusIcon className="h-5 w-5" />
          </Button>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <Label>{t('settings.bulkRooms')}</Label>
          <NativeSelect
            className="mb-2"
            value={bulkSite}
            onChange={(e) => setBulkSite(e.target.value)}
          >
            <option value="">—</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
          <div className="flex gap-2">
            <Input
              className="w-16"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder={t('settings.prefix')}
            />
            <Input
              className="w-16"
              value={from}
              onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))}
              placeholder={t('settings.from')}
            />
            <Input
              className="w-16"
              value={to}
              onChange={(e) => setTo(e.target.value.replace(/\D/g, ''))}
              placeholder={t('settings.to')}
            />
            <Input
              value={rent}
              onChange={(e) => setRent(e.target.value.replace(/\D/g, ''))}
              placeholder={t('settings.rentLabel')}
            />
          </div>
          <Button block className="mt-2" onClick={createBulk}>
            {t('common.add')}
          </Button>
        </div>
      </Card>
      )}

      {/* Utilisateurs */}
      {user?.role === 'OWNER' && (
        <Card className="space-y-3">
          <div className="font-semibold text-slate-900">{t('settings.users')}</div>
          {userError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
              {userError}
            </p>
          )}
          <ul className="divide-y divide-slate-100 text-sm">
            {users.map((u) =>
              editId === u.id ? (
                <li key={u.id} className="space-y-2 py-3">
                  <Input value={eName} onChange={(e) => setEName(e.target.value)} placeholder={t('newEntry.name')} />
                  <Input
                    type="email"
                    value={eEmail}
                    onChange={(e) => setEEmail(e.target.value)}
                    placeholder={t('signup.email')}
                  />
                  {u.role !== 'OWNER' && (
                    <>
                      <NativeSelect value={eRole} onChange={(e) => setERole(e.target.value)}>
                        <option value="CARETAKER">CARETAKER</option>
                        <option value="MANAGER">MANAGER</option>
                      </NativeSelect>
                      <div className="flex flex-wrap gap-2">
                        {sites.map((s) => {
                          const on = eSites.includes(s.id);
                          return (
                            <button
                              key={s.id}
                              onClick={() =>
                                setESites((cur) =>
                                  on ? cur.filter((x) => x !== s.id) : [...cur, s.id],
                                )
                              }
                              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                                on
                                  ? 'bg-brand text-white'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {s.name}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(u)} disabled={eName.trim().length < 2}>
                      <CheckIcon className="h-4 w-4" />
                      {t('common.save')}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={cancelEdit}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                </li>
              ) : (
                <li key={u.id} className="flex items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0">
                    <span
                      className={
                        u.active ? 'font-medium text-slate-800' : 'text-slate-400 line-through'
                      }
                    >
                      {u.name}
                    </span>
                    <span className="block text-xs text-slate-400">
                      {u.role}
                      {u.email ? ` · ${u.email}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => startEdit(u)}
                      className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand"
                      aria-label={t('settings.editUser')}
                      title={t('settings.editUser')}
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    {u.role !== 'OWNER' && (
                      <>
                        <Button variant="secondary" size="sm" onClick={() => toggleActive(u)}>
                          {u.active ? t('settings.deactivate') : t('settings.activate')}
                        </Button>
                        <button
                          onClick={() => removeUser(u)}
                          className="rounded-lg p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                          aria-label={t('settings.deleteUser')}
                          title={t('settings.deleteUser')}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </span>
                </li>
              ),
            )}
          </ul>
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <Label>{t('settings.invite')}</Label>
            <Input
              placeholder={t('newEntry.name')}
              value={uName}
              onChange={(e) => setUName(e.target.value)}
            />
            <Input
              type="email"
              placeholder={t('signup.email')}
              value={uEmail}
              onChange={(e) => setUEmail(e.target.value)}
            />
            <Input
              placeholder={t('login.phone')}
              value={uPhone}
              onChange={(e) => setUPhone(e.target.value)}
            />
            <Input
              type="password"
              placeholder={t('login.password')}
              value={uPass}
              onChange={(e) => setUPass(e.target.value)}
            />
            <NativeSelect value={uRole} onChange={(e) => setURole(e.target.value)}>
              <option value="CARETAKER">CARETAKER</option>
              <option value="MANAGER">MANAGER</option>
            </NativeSelect>
            <div className="flex flex-wrap gap-2">
              {sites.map((s) => {
                const on = uSites.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() =>
                      setUSites((cur) => (on ? cur.filter((x) => x !== s.id) : [...cur, s.id]))
                    }
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      on ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
            <Button block onClick={invite}>
              {t('settings.invite')}
            </Button>
          </div>
        </Card>
      )}

      {/* Zone de danger : suppression de son propre compte */}
      <Card className="space-y-3 ring-red-200">
        <div className="font-semibold text-red-700">{t('settings.dangerZone')}</div>
        <p className="text-sm text-slate-500">
          {isOwner ? t('settings.deleteAccountOwnerWarn') : t('settings.deleteAccountSelfWarn')}
        </p>
        <Button variant="danger" block onClick={deleteOwnAccount}>
          <TrashIcon className="h-4 w-4" />
          {t('settings.deleteMyAccount')}
        </Button>
      </Card>
    </div>
  );
}
