import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { FileField } from '../components/FileField';
import { SignedImage } from '../components/SignedImage';

interface Site {
  id: string;
  name: string;
  type: string;
}
interface User {
  id: string;
  name: string;
  phone: string;
  role: string;
  active: boolean;
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

  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Profil du compte (F1.5).
  const [account, setAccount] = useState<Account | null>(null);
  const [accountName, setAccountName] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);
  const isOwner = user?.role === 'OWNER';

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
  const [uPhone, setUPhone] = useState('');
  const [uRole, setURole] = useState('CARETAKER');
  const [uPass, setUPass] = useState('');
  const [uSites, setUSites] = useState<string[]>([]);

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
  useEffect(() => {
    void loadSites();
    void loadUsers();
    void loadAccount();
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
      phone: uPhone,
      role: uRole,
      password: uPass,
      siteIds: uSites,
    });
    setUName('');
    setUPhone('');
    setUPass('');
    setUSites([]);
    await loadUsers();
  };

  const toggleActive = async (u: User) => {
    await api.patch(`/users/${u.id}`, { active: !u.active });
    await loadUsers();
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">{t('settings.title')}</h1>

      <section className="space-y-2 rounded-lg bg-white p-3 shadow-sm">
        <div className="font-semibold">{t('settings.profile')}</div>
        <p className="text-sm text-slate-600">
          {user?.name} · {user?.phone}
        </p>

        {isOwner && account && (
          <div className="space-y-2 border-t pt-2">
            <div className="flex items-center gap-3">
              {account.logoKey ? (
                <SignedImage
                  objectKey={account.logoKey}
                  alt={account.name}
                  className="h-12 w-12 rounded object-contain"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded bg-slate-100 text-xs text-slate-400">
                  {t('settings.logo')}
                </div>
              )}
              <FileField
                purpose="account-logo"
                label={t('settings.logo')}
                onUploaded={(key) => key && void saveProfile({ logoKey: key })}
              />
            </div>
            <input
              className="w-full rounded border border-slate-300 px-2 py-2 text-sm"
              value={accountName}
              onChange={(e) => {
                setAccountName(e.target.value);
                setProfileSaved(false);
              }}
              placeholder={t('settings.accountName')}
            />
            <textarea
              className="h-20 w-full rounded border border-slate-300 px-2 py-2 text-sm"
              value={receiptFooter}
              onChange={(e) => {
                setReceiptFooter(e.target.value);
                setProfileSaved(false);
              }}
              placeholder={t('settings.receiptFooter')}
            />
            <button
              onClick={() =>
                void saveProfile({
                  name: accountName,
                  receiptFooter: receiptFooter || null,
                })
              }
              disabled={accountName.trim().length < 2}
              className="w-full rounded bg-brand py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {t('common.save')}
            </button>
            {profileSaved && (
              <p className="rounded bg-emerald-50 p-2 text-sm text-emerald-700">
                {t('settings.profileSaved')}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 border-t pt-2">
          <span className="text-sm">{t('settings.language')}</span>
          <button onClick={() => setLang('fr')} className="rounded bg-slate-200 px-2 py-1 text-xs">
            FR
          </button>
          <button onClick={() => setLang('en')} className="rounded bg-slate-200 px-2 py-1 text-xs">
            EN
          </button>
        </div>
      </section>

      <section className="space-y-2 rounded-lg bg-white p-3 shadow-sm">
        <div className="font-semibold">{t('settings.sites')}</div>
        <ul className="text-sm">
          {sites.map((s) => (
            <li key={s.id} className="py-1">
              {s.name} · {s.type}
            </li>
          ))}
        </ul>
        <div className="flex gap-2 pt-1">
          <input
            className="flex-1 rounded border border-slate-300 px-2 py-2"
            placeholder={t('settings.siteName')}
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
          />
          <select
            className="rounded border border-slate-300 px-2 py-2"
            value={siteType}
            onChange={(e) => setSiteType(e.target.value)}
          >
            <option value="CITE">CITE</option>
            <option value="IMMEUBLE">IMMEUBLE</option>
            <option value="MIXTE">MIXTE</option>
          </select>
          <button onClick={createSite} className="rounded bg-brand px-3 text-white">
            +
          </button>
        </div>

        <div className="mt-2 border-t pt-2">
          <div className="mb-1 text-sm font-medium">{t('settings.bulkRooms')}</div>
          <select
            className="mb-2 w-full rounded border border-slate-300 px-2 py-2"
            value={bulkSite}
            onChange={(e) => setBulkSite(e.target.value)}
          >
            <option value="">—</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              className="w-16 rounded border border-slate-300 px-2 py-2"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder={t('settings.prefix')}
            />
            <input
              className="w-16 rounded border border-slate-300 px-2 py-2"
              value={from}
              onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))}
              placeholder={t('settings.from')}
            />
            <input
              className="w-16 rounded border border-slate-300 px-2 py-2"
              value={to}
              onChange={(e) => setTo(e.target.value.replace(/\D/g, ''))}
              placeholder={t('settings.to')}
            />
            <input
              className="flex-1 rounded border border-slate-300 px-2 py-2"
              value={rent}
              onChange={(e) => setRent(e.target.value.replace(/\D/g, ''))}
              placeholder={t('settings.rentLabel')}
            />
          </div>
          <button
            onClick={createBulk}
            className="mt-2 w-full rounded bg-brand py-2 text-sm font-semibold text-white"
          >
            {t('common.add')}
          </button>
        </div>
      </section>

      {user?.role === 'OWNER' && (
        <section className="space-y-2 rounded-lg bg-white p-3 shadow-sm">
          <div className="font-semibold">{t('settings.users')}</div>
          <ul className="text-sm">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-1">
                <span className={u.active ? '' : 'text-slate-400 line-through'}>
                  {u.name} · {u.role}
                </span>
                {u.role !== 'OWNER' && (
                  <button
                    onClick={() => toggleActive(u)}
                    className="rounded bg-slate-200 px-2 py-0.5 text-xs"
                  >
                    {u.active ? t('settings.deactivate') : t('settings.activate')}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="space-y-2 border-t pt-2">
            <div className="text-sm font-medium">{t('settings.invite')}</div>
            <input
              className="w-full rounded border border-slate-300 px-2 py-2"
              placeholder={t('newEntry.name')}
              value={uName}
              onChange={(e) => setUName(e.target.value)}
            />
            <input
              className="w-full rounded border border-slate-300 px-2 py-2"
              placeholder={t('login.phone')}
              value={uPhone}
              onChange={(e) => setUPhone(e.target.value)}
            />
            <input
              className="w-full rounded border border-slate-300 px-2 py-2"
              type="password"
              placeholder={t('login.password')}
              value={uPass}
              onChange={(e) => setUPass(e.target.value)}
            />
            <select
              className="w-full rounded border border-slate-300 px-2 py-2"
              value={uRole}
              onChange={(e) => setURole(e.target.value)}
            >
              <option value="CARETAKER">CARETAKER</option>
              <option value="MANAGER">MANAGER</option>
            </select>
            <div className="flex flex-wrap gap-2">
              {sites.map((s) => {
                const on = uSites.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() =>
                      setUSites((cur) => (on ? cur.filter((x) => x !== s.id) : [...cur, s.id]))
                    }
                    className={`rounded px-2 py-1 text-xs ${on ? 'bg-brand text-white' : 'bg-slate-200'}`}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
            <button
              onClick={invite}
              className="w-full rounded bg-brand py-2 text-sm font-semibold text-white"
            >
              {t('settings.invite')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
