import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { InvitationPreview } from '@bailo/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/format';
import { AuthShell, ErrorBanner, LockIcon, PasswordField, PrimaryButton } from './auth/AuthUI';

/**
 * Page publique ouverte depuis le lien de l'e-mail d'invitation : l'invité voit
 * qui l'invite et avec quel rôle, choisit son mot de passe, et sa session s'ouvre.
 */
export function InviteAccept() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { acceptInvitation } = useAuth();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'error'>('loading');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<InvitationPreview>(`/auth/invitations/${encodeURIComponent(token)}`)
      .then((p) => {
        setPreview(p);
        setState('ready');
      })
      .catch((err) =>
        setState(err instanceof ApiError && (err.status === 410 || err.status === 400) ? 'invalid' : 'error'),
      );
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError(t('invite.passwordLength'));
    if (password !== confirm) return setError(t('invite.mismatch'));
    setBusy(true);
    try {
      await acceptInvitation(token, password);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) setState('invalid');
      else if (err instanceof ApiError && err.status === 409) setError(t('invite.conflict'));
      else setError(t('invite.error'));
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <Link to="/login" className="font-semibold text-white underline-offset-2 hover:underline">
      {t('invite.toLogin')}
    </Link>
  );

  if (state === 'loading') {
    return <AuthShell title={t('invite.title')} subtitle={t('common.loading')} footer={footer}>{null}</AuthShell>;
  }
  if (state !== 'ready' || !preview) {
    return (
      <AuthShell
        title={t('invite.invalidTitle')}
        subtitle={state === 'invalid' ? t('invite.invalidText') : t('invite.error')}
        footer={footer}
      >
        {null}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t('invite.title')}
      subtitle={t('invite.subtitle', {
        name: preview.name,
        account: preview.accountName,
        role: t(`profile.role.${preview.role}`).toLowerCase(),
      })}
      footer={footer}
    >
      <form onSubmit={submit} className="space-y-4">
        {preview.email && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {t('invite.loginWith', { email: preview.email })}
          </p>
        )}
        <PasswordField
          id="invite-password"
          label={t('invite.password')}
          icon={<LockIcon />}
          placeholder="••••••••"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        <PasswordField
          id="invite-confirm"
          label={t('invite.confirm')}
          icon={<LockIcon />}
          placeholder="••••••••"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <ErrorBanner message={error} />
        <PrimaryButton busy={busy}>{t('invite.submit')}</PrimaryButton>
        <p className="text-center text-xs text-slate-500">
          {t('invite.expires', { date: formatDate(preview.expiresAt) })}
        </p>
      </form>
    </AuthShell>
  );
}
