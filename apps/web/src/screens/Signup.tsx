import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { signupDto } from '@bailo/shared';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import {
  AuthShell,
  BuildingIcon,
  ErrorBanner,
  Field,
  LockIcon,
  MailIcon,
  PasswordField,
  PhoneIcon,
  PrimaryButton,
  UserIcon,
} from './auth/AuthUI';

export function Signup() {
  const { t } = useTranslation();
  const { signup } = useAuth();
  const [accountName, setAccountName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pwd, setPwd] = useState('');
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Inscription directe : valide les champs puis crée le compte, ce qui ouvre la session.
  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!acceptedPrivacy) {
      setError(t('signup.mustAcceptPrivacy'));
      return;
    }
    const dto = signupDto.safeParse({
      accountName,
      ownerName,
      email: email.trim(),
      phone: phone.trim(),
      password: pwd,
    });
    if (!dto.success) {
      setError(dto.error.issues[0]?.message ?? t('signup.invalid'));
      return;
    }
    setBusy(true);
    try {
      await signup(dto.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('signup.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={t('signup.title')}
      subtitle={t('signup.subtitle')}
      footer={
        <>
          {t('signup.haveAccount')}{' '}
          <Link to="/login" className="font-semibold text-white underline-offset-2 hover:underline">
            {t('login.submit')}
          </Link>
        </>
      }
    >
      <form onSubmit={create} className="space-y-4">
        <Field
          id="accountName"
          label={t('signup.accountName')}
          icon={<BuildingIcon />}
          placeholder={t('signup.accountName')}
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
        />
        <Field
          id="ownerName"
          label={t('signup.ownerName')}
          icon={<UserIcon />}
          placeholder={t('signup.ownerName')}
          autoComplete="name"
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
        />
        <Field
          id="email"
          type="email"
          label={t('signup.email')}
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
          autoComplete="new-password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
        />
        {/* Consentement explicite — l'inscription vaut acceptation et le libellé
            renvoie vers la politique de confidentialité, obligatoire pour avancer. */}
        <label className="flex items-start gap-2.5 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-inset ring-slate-200">
          <input
            type="checkbox"
            checked={acceptedPrivacy}
            onChange={(e) => setAcceptedPrivacy(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span className="leading-snug">
            {t('signup.privacyAccept')}{' '}
            <Link
              to="/privacy"
              target="_blank"
              rel="noopener"
              className="font-semibold text-brand underline-offset-2 hover:underline"
            >
              {t('signup.privacyLink')}
            </Link>
            .
          </span>
        </label>
        <ErrorBanner message={error} />
        <PrimaryButton busy={busy} disabled={!acceptedPrivacy}>
          {t('signup.submit')}
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
