import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import type { LoginDto } from '@bailo/shared';
import { useAuth } from '../lib/auth';
import {
  AuthShell,
  ErrorBanner,
  Field,
  LockIcon,
  MailIcon,
  PasswordField,
  PhoneIcon,
  PrimaryButton,
} from './auth/AuthUI';

export function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Retour de « Mot de passe oublié » : on confirme que le changement a réussi.
  const passwordReset = Boolean(
    (useLocation().state as { passwordReset?: boolean } | null)?.passwordReset,
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // Connexion par email OU téléphone : au moins un identifiant est requis.
    const credentials: LoginDto = { password };
    if (email.trim()) credentials.email = email.trim();
    if (phone.trim()) credentials.phone = phone.trim();
    if (!credentials.email && !credentials.phone) {
      setError(t('login.needIdentifier'));
      return;
    }

    setBusy(true);
    try {
      await login(credentials);
    } catch {
      setError(t('login.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={t('login.title')}
      subtitle={t('login.subtitle')}
      footer={
        <>
          {t('login.noAccount')}{' '}
          <Link to="/signup" className="font-semibold text-white underline-offset-2 hover:underline">
            {t('signup.title')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {passwordReset && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
            {t('forgot.done')}
          </p>
        )}
        <Field
          id="email"
          type="email"
          label={t('login.email')}
          icon={<MailIcon />}
          placeholder="nom@exemple.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          id="phone"
          type="tel"
          inputMode="tel"
          label={t('login.phone')}
          icon={<PhoneIcon />}
          placeholder="6 90 00 00 00"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <PasswordField
          id="password"
          label={t('login.password')}
          icon={<LockIcon />}
          placeholder="••••••••"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="-mt-2 text-right">
          <Link to="/forgot-password" className="text-sm font-medium text-brand hover:underline">
            {t('login.forgot')}
          </Link>
        </div>
        <ErrorBanner message={error} />
        <PrimaryButton busy={busy}>{t('login.submit')}</PrimaryButton>
      </form>
    </AuthShell>
  );
}
