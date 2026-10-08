import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';

export function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(phone.trim(), password);
    } catch {
      setError(t('login.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="mb-1 text-center text-2xl font-bold text-brand">CitéGest</h1>
      <p className="mb-6 text-center text-slate-500">{t('login.title')}</p>
      <form onSubmit={submit} className="space-y-3">
        <input
          className="w-full rounded border border-slate-300 px-3 py-2"
          placeholder={t('login.phone')}
          value={phone}
          inputMode="tel"
          onChange={(e) => setPhone(e.target.value)}
        />
        <input
          className="w-full rounded border border-slate-300 px-3 py-2"
          type="password"
          placeholder={t('login.password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded bg-brand py-2 font-semibold text-white disabled:opacity-60"
        >
          {t('login.submit')}
        </button>
      </form>
    </div>
  );
}
