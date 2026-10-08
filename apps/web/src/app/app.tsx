import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { Layout } from './Layout';
import { Login } from '../screens/Login';
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
import { Expenses } from '../screens/Expenses';
import { Cash } from '../screens/Cash';
import { Checkout } from '../screens/Checkout';
import { Settings } from '../screens/Settings';
import { Templates } from '../screens/Templates';
import { Verify } from '../screens/Verify';

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
    return <Login />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="rooms" element={<Rooms />} />
        <Route path="units/:id" element={<UnitEdit />} />
        <Route path="collect" element={<Collect />} />
        <Route path="reminders" element={<Reminders />} />
        <Route path="arrears" element={<Arrears />} />
        <Route path="more" element={<More />} />
        <Route path="tenants" element={<Tenants />} />
        <Route path="tenants/:id" element={<TenantDetail />} />
        <Route path="new-entry" element={<NewEntry />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="cash" element={<Cash />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="settings" element={<Settings />} />
        <Route path="templates" element={<Templates />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
