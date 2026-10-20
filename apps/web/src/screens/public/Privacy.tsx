import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PublicShell } from './PublicShell';
import { Reveal } from '../../components/Reveal';
import { ShieldIcon, ChevronRightIcon } from '../../components/icons';

/**
 * Politique de confidentialité publique — accessible sans compte.
 *
 * Rédigée pour un bailleur camerounais, dans un langage simple. Les sections
 * couvrent : données collectées, finalités, bases légales, durée de
 * conservation, partage avec des tiers, droits de la personne concernée,
 * sécurité, et contact du responsable. Date de dernière mise à jour affichée.
 */
export function Privacy() {
  const { t } = useTranslation();
  const updated = new Date('2026-10-20').toLocaleDateString('fr-FR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const sections = ['data', 'purposes', 'legal', 'sharing', 'retention', 'rights', 'security', 'contact'] as const;

  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <Reveal>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <Link to="/" className="hover:text-brand">{t('public.nav.home')}</Link>
            <ChevronRightIcon className="h-3.5 w-3.5" />
            <span className="text-slate-900 dark:text-slate-100">{t('privacy.title')}</span>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <ShieldIcon className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('privacy.title')}</h1>
              <p className="mt-1 text-xs text-slate-500">
                {t('privacy.updated', { date: updated })}
              </p>
            </div>
          </div>
          <p className="mt-6 text-base leading-relaxed text-slate-600 dark:text-slate-300">
            {t('privacy.intro')}
          </p>
        </Reveal>

        <div className="mt-12 space-y-10">
          {sections.map((key, i) => (
            <Reveal key={key} delay={i * 40} as="section">
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {t(`privacy.${key}.title`)}
              </h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {t(`privacy.${key}.body`)}
              </p>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <div className="mt-12 rounded-xl bg-slate-50 p-5 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {t('privacy.footer')}{' '}
              <Link to="/signup" className="font-semibold text-brand hover:underline">
                {t('public.cta.signup')}
              </Link>
              .
            </p>
          </div>
        </Reveal>
      </article>
    </PublicShell>
  );
}
