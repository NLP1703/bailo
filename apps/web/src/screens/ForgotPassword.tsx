import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import {
  AuthShell,
  ErrorBanner,
  Field,
  LockIcon,
  MailIcon,
  PasswordField,
  PrimaryButton,
} from './auth/AuthUI';

/**
 * Mot de passe oublié : 1) l'utilisateur saisit son e-mail, un code à 6 chiffres
 * lui est envoyé ; 2) il saisit le code et son nouveau mot de passe.
 * Le même écran sert après un « Réinitialiser le mot de passe » lancé par l'admin.
 */
export function ForgotPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const message = (err: unknown): string => {
    if (err instanceof ApiError && err.code === 'OTP_RATE_LIMITED') return t('forgot.rateLimited');
    if (err instanceof ApiError && err.status === 401) return t('forgot.badCode');
    if (err instanceof ApiError && err.status === 400) return t('forgot.invalid');
    return t('forgot.error');
  };

  const requestCode = async (e?: FormEvent) => {
    e?.preventDefault();
    setError('');
    if (!email.trim()) {
      setError(t('forgot.needEmail'));
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/otp', { email: email.trim(), purpose: 'PASSWORD_RESET' });
      // Réponse identique que le compte existe ou non : on ne révèle rien.
      setInfo(t('forgot.sent', { email: email.trim() }));
      setStep('code');
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code.trim())) {
      setError(t('forgot.codeFormat'));
      return;
    }
    if (password.length < 8) {
      setError(t('forgot.passwordLength'));
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/password-reset', {
        email: email.trim(),
        otp: code.trim(),
        newPassword: password,
      });
      navigate('/login', { replace: true, state: { passwordReset: true } });
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={t('forgot.title')}
      subtitle={step === 'email' ? t('forgot.subtitle') : t('forgot.subtitleCode')}
      footer={
        <Link to="/login" className="font-semibold text-white underline-offset-2 hover:underline">
          {t('forgot.backToLogin')}
        </Link>
      }
    >
      {step === 'email' ? (
        <form onSubmit={requestCode} className="space-y-4">
          <Field
            id="email"
            type="email"
            label={t('login.email')}
            icon={<MailIcon />}
            placeholder="nom@exemple.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          <ErrorBanner message={error} />
          <PrimaryButton busy={busy}>{t('forgot.sendCode')}</PrimaryButton>
        </form>
      ) : (
        <form onSubmit={reset} className="space-y-4">
          {info && (
            <p
              className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
              role="status"
            >
              {info}
            </p>
          )}
          <Field
            id="code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            label={t('forgot.code')}
            icon={<LockIcon />}
            placeholder="123456"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            autoFocus
          />
          <PasswordField
            id="new-password"
            label={t('forgot.newPassword')}
            icon={<LockIcon />}
            placeholder="••••••••"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <ErrorBanner message={error} />
          <PrimaryButton busy={busy}>{t('forgot.submit')}</PrimaryButton>
          <button
            type="button"
            className="w-full text-center text-sm font-medium text-brand hover:underline disabled:opacity-50"
            disabled={busy}
            onClick={() => void requestCode()}
          >
            {t('forgot.resend')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
