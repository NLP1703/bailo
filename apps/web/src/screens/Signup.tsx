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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Inscription directe : valide les champs puis crée le compte, ce qui ouvre la session.
  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
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
          <Link to="/" className="font-semibold text-white underline-offset-2 hover:underline">
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
        <ErrorBanner message={error} />
        <PrimaryButton busy={busy}>{t('signup.submit')}</PrimaryButton>
      </form>
    </AuthShell>
  );
}
