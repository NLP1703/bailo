import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Layout } from './Layout';
import { Login } from '../screens/Login';
import { Signup } from '../screens/Signup';
import { Onboarding } from '../screens/Onboarding';
import { Dashboard } from '../screens/Dashboard';
import { Rooms } from '../screens/Rooms';
import { UnitEdit } from '../screens/UnitEdit';
import { Collect } from '../screens/Collect';
import { Reminders } from '../screens/Reminders';
import { Arrears } from '../screens/Arrears';
import { More } from '../screens/More';
import { Tenants } from '../screens/Tenants';
import { TenantDetail } from '../screens/TenantDetail';
import { NewEntry } from '../screens/NewEntry';
import { Cash } from '../screens/Cash';
import { Checkout } from '../screens/Checkout';
import { Settings } from '../screens/Settings';
import { Templates } from '../screens/Templates';
import { Profile } from '../screens/Profile';
import { SiteSettings } from '../screens/SiteSettings';
import { AddSite } from '../screens/AddSite';
import { Plans } from '../screens/Plans';
import { Verify } from '../screens/Verify';
import { Contracts } from '../screens/Contracts';
import { ContractNew } from '../screens/ContractNew';
import { ContractDetail } from '../screens/ContractDetail';
import { Inspections } from '../screens/Inspections';
import { Maintenance } from '../screens/Maintenance';
import { Expenses } from '../screens/Expenses';
import { Meters } from '../screens/Meters';
import { Accounting } from '../screens/Accounting';

export function App() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  // Vérification publique de reçu (QR) — accessible sans authentification.
  if (location.pathname.startsWith('/r/')) {
    return (
      <Routes>
        <Route path="/r/:id" element={<Verify />} />
      </Routes>
    );
  }

  if (loading) {
    return <div className="p-6 text-center text-slate-500">{t('common.loading')}</div>;
  }
  if (!user) {
    return (
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return <AuthedApp />;
}

/**
 * Zone authentifiée. Juste après l'inscription, un propriétaire sans aucun site
 * est dirigé vers la mise en service de son premier bâtiment (onboarding).
 */
function AuthedApp() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    if (user?.role !== 'OWNER') {
      setNeedsOnboarding(false);
      return;
    }
    api
      .get<{ id: string }[]>('/sites')
      .then((sites) => setNeedsOnboarding(sites.length === 0))
      .catch(() => setNeedsOnboarding(false));
  }, [user?.role]);

  if (needsOnboarding === null) {
    return <div className="p-6 text-center text-slate-500">{t('common.loading')}</div>;
  }
  if (needsOnboarding) {
    return <Onboarding />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="rooms" element={<Rooms />} />
        <Route path="units/:id" element={<UnitEdit />} />
        <Route path="sites/new" element={<AddSite />} />
        <Route path="plans" element={<Plans />} />
        <Route path="sites/:id" element={<SiteSettings />} />
        <Route path="collect" element={<Collect />} />
        <Route path="reminders" element={<Reminders />} />
        <Route path="arrears" element={<Arrears />} />
        <Route path="more" element={<More />} />
        <Route path="tenants" element={<Tenants />} />
        <Route path="tenants/:id" element={<TenantDetail />} />
        <Route path="new-entry" element={<NewEntry />} />
        <Route path="cash" element={<Cash />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="settings" element={<Settings />} />
        <Route path="templates" element={<Templates />} />
        <Route path="profile" element={<Profile />} />
        <Route path="contracts" element={<Contracts />} />
        <Route path="contracts/new" element={<ContractNew />} />
        <Route path="contracts/:id" element={<ContractDetail />} />
        <Route path="inspections" element={<Inspections />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="meters" element={<Meters />} />
        <Route path="accounting" element={<Accounting />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
