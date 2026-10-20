import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BanknoteIcon,
  BookIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockAlertIcon,
  DoorIcon,
  ReceiptIcon,
  ShieldIcon,
  UsersIcon,
  WalletIcon,
  type IconProps,
} from '../../components/icons';
import { Accordion } from '../../components/Accordion';
import { Reveal } from '../../components/Reveal';
import { PublicShell } from './PublicShell';
import type { ComponentType, ReactNode } from 'react';

/**
 * Page d'accueil publique de Bailo. Six sections :
 *  1) Hero — proposition de valeur + 2 CTA (essayer gratuit / voir la démo).
 *  2) Fonctionnalités — 6 cartes numérotées (clin d'œil au style sectoriel).
 *  3) Avant / après — 3 situations réelles au Cameroun avec la version Bailo.
 *  4) Comment ça marche — 3 étapes de prise en main.
 *  5) FAQ — composant Accordion réutilisable.
 *  6) CTA final + argument de garantie (gratuit à ouvrir).
 *
 * Toutes les sections entrent au scroll via <Reveal> (IntersectionObserver,
 * respecte prefers-reduced-motion).
 */
export function Landing() {
  const { t } = useTranslation();

  const features: {
    icon: ComponentType<IconProps>;
    titleKey: string;
    bodyKey: string;
  }[] = [
    { icon: BanknoteIcon, titleKey: 'public.feat.collect.title', bodyKey: 'public.feat.collect.body' },
    { icon: ClockAlertIcon, titleKey: 'public.feat.arrears.title', bodyKey: 'public.feat.arrears.body' },
    { icon: ReceiptIcon, titleKey: 'public.feat.receipt.title', bodyKey: 'public.feat.receipt.body' },
    { icon: BookIcon, titleKey: 'public.feat.ohada.title', bodyKey: 'public.feat.ohada.body' },
    { icon: DoorIcon, titleKey: 'public.feat.rooms.title', bodyKey: 'public.feat.rooms.body' },
    { icon: UsersIcon, titleKey: 'public.feat.team.title', bodyKey: 'public.feat.team.body' },
  ];

  const beforeAfter: { badge: string; before: string; after: string }[] = [
    {
      badge: t('public.ba.b1.badge'),
      before: t('public.ba.b1.before'),
      after: t('public.ba.b1.after'),
    },
    {
      badge: t('public.ba.b2.badge'),
      before: t('public.ba.b2.before'),
      after: t('public.ba.b2.after'),
    },
    {
      badge: t('public.ba.b3.badge'),
      before: t('public.ba.b3.before'),
      after: t('public.ba.b3.after'),
    },
  ];

  const steps: { n: string; titleKey: string; bodyKey: string }[] = [
    { n: '01', titleKey: 'public.step.s1.title', bodyKey: 'public.step.s1.body' },
    { n: '02', titleKey: 'public.step.s2.title', bodyKey: 'public.step.s2.body' },
    { n: '03', titleKey: 'public.step.s3.title', bodyKey: 'public.step.s3.body' },
  ];

  const faqItems = [
    { id: 'q1', title: t('public.faq.q1.q'), content: t('public.faq.q1.a') },
    { id: 'q2', title: t('public.faq.q2.q'), content: t('public.faq.q2.a') },
    { id: 'q3', title: t('public.faq.q3.q'), content: t('public.faq.q3.a') },
    { id: 'q4', title: t('public.faq.q4.q'), content: t('public.faq.q4.a') },
    { id: 'q5', title: t('public.faq.q5.q'), content: t('public.faq.q5.a') },
  ];

  return (
    <PublicShell>
      {/* HERO ────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Halos décoratifs */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 left-1/2 h-[520px] w-[720px] -translate-x-1/2 rounded-full bg-brand/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-20 right-10 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl dark:bg-amber-500/10"
        />

        <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:py-28">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand">
              <ShieldIcon className="h-3.5 w-3.5" />
              {t('public.hero.badge')}
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              {t('public.hero.title1')}{' '}
              <span className="bg-gradient-to-br from-brand to-brand-dark bg-clip-text text-transparent">
                {t('public.hero.title2')}
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
              {t('public.hero.subtitle')}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/signup"
                className="group inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/30 transition hover:bg-brand-dark hover:shadow-xl hover:shadow-brand/40 active:scale-95"
              >
                {t('public.hero.ctaPrimary')}
                <ChevronRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-50 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
              >
                {t('public.hero.ctaSecondary')}
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
              {['free', 'nocard', 'ohada'].map((k) => (
                <li key={k} className="flex items-center gap-1.5">
                  <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
                  {t(`public.hero.proof.${k}`)}
                </li>
              ))}
            </ul>
          </Reveal>

          {/* Capture mockée du dashboard */}
          <Reveal delay={120}>
            <HeroMockup />
          </Reveal>
        </div>
      </section>

      {/* FONCTIONNALITÉS ─────────────────────────────────────────────────── */}
      <section id="features" className="scroll-mt-16 bg-slate-50 py-20 dark:bg-slate-900">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <Reveal>
            <SectionHeading
              overline={t('public.feat.overline')}
              title={t('public.feat.title')}
              subtitle={t('public.feat.subtitle')}
            />
          </Reveal>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <Reveal key={f.titleKey} delay={i * 70} as="article">
                  <div className="group h-full rounded-2xl bg-white p-6 ring-1 ring-slate-200 transition hover:-translate-y-1 hover:shadow-lg dark:bg-slate-800 dark:ring-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand transition group-hover:bg-brand group-hover:text-white">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="font-mono text-xs font-bold tracking-wider text-slate-300 dark:text-slate-600">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <h3 className="mt-5 text-lg font-semibold">{t(f.titleKey)}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {t(f.bodyKey)}
                    </p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* AVANT / APRÈS ───────────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <Reveal>
            <SectionHeading
              overline={t('public.ba.overline')}
              title={t('public.ba.title')}
              subtitle={t('public.ba.subtitle')}
            />
          </Reveal>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {beforeAfter.map((b, i) => (
              <Reveal key={b.badge} delay={i * 100} as="article">
                <div className="h-full rounded-2xl ring-1 ring-slate-200 dark:ring-slate-700 overflow-hidden">
                  <div className="bg-slate-100 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {b.badge}
                  </div>
                  <div className="space-y-4 px-5 py-5">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-red-500">
                        {t('public.ba.before')}
                      </p>
                      <p className="mt-1.5 text-sm text-slate-700 line-through decoration-red-400/60 decoration-2 dark:text-slate-300">
                        {b.before}
                      </p>
                    </div>
                    <div>
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-600">
                        <CheckCircleIcon className="h-3.5 w-3.5" />
                        {t('public.ba.after')}
                      </p>
                      <p className="mt-1.5 text-sm font-medium text-slate-900 dark:text-slate-100">
                        {b.after}
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* COMMENT ÇA MARCHE ──────────────────────────────────────────────── */}
      <section className="bg-slate-900 py-24 text-white dark:bg-slate-950">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <Reveal>
            <SectionHeading
              overline={t('public.step.overline')}
              title={t('public.step.title')}
              subtitle={t('public.step.subtitle')}
              light
            />
          </Reveal>
          <div className="mt-16 grid gap-5 md:grid-cols-3">
            {steps.map((s, i) => (
              <Reveal key={s.n} delay={i * 120} as="article">
                <div className="relative h-full rounded-2xl bg-white/5 p-7 ring-1 ring-white/10 backdrop-blur transition hover:bg-white/10">
                  <span className="font-mono text-3xl font-bold text-brand">{s.n}</span>
                  <h3 className="mt-3 text-lg font-semibold">{t(s.titleKey)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/70">{t(s.bodyKey)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING ─────────────────────────────────────────────────────────── */}
      <section id="pricing" className="scroll-mt-16 py-20">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <Reveal>
            <SectionHeading
              overline={t('public.pricing.overline')}
              title={t('public.pricing.title')}
              subtitle={t('public.pricing.subtitle')}
            />
          </Reveal>
          <Reveal delay={100}>
            <div className="mt-14 flex flex-col overflow-hidden rounded-2xl ring-1 ring-slate-200 dark:ring-slate-700 md:flex-row">
              <div className="flex-1 bg-white p-8 dark:bg-slate-800">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                  {t('public.pricing.freeBadge')}
                </p>
                <h3 className="mt-2 text-2xl font-bold">{t('public.pricing.freeTitle')}</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {t('public.pricing.freeDesc')}
                </p>
                <ul className="mt-5 space-y-2.5 text-sm">
                  {['f1', 'f2', 'f3', 'f4'].map((k) => (
                    <li key={k} className="flex items-start gap-2">
                      <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <span className="text-slate-700 dark:text-slate-200">
                        {t(`public.pricing.freeList.${k}`)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/signup"
                  className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark"
                >
                  {t('public.pricing.freeCta')}
                  <ChevronRightIcon className="h-4 w-4" />
                </Link>
              </div>
              <div className="flex-1 bg-slate-50 p-8 dark:bg-slate-900">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {t('public.pricing.paidBadge')}
                </p>
                <h3 className="mt-2 text-2xl font-bold">{t('public.pricing.paidTitle')}</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {t('public.pricing.paidDesc')}
                </p>
                <ul className="mt-5 space-y-2.5 text-sm">
                  {['p1', 'p2', 'p3', 'p4'].map((k) => (
                    <li key={k} className="flex items-start gap-2">
                      <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <span className="text-slate-700 dark:text-slate-200">
                        {t(`public.pricing.paidList.${k}`)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-xs italic text-slate-500">{t('public.pricing.paidHint')}</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ ─────────────────────────────────────────────────────────────── */}
      <section id="faq" className="scroll-mt-16 bg-slate-50 py-20 dark:bg-slate-900">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <Reveal>
            <SectionHeading
              overline={t('public.faq.overline')}
              title={t('public.faq.title')}
              subtitle={t('public.faq.subtitle')}
            />
          </Reveal>
          <Reveal delay={80}>
            <div className="mt-10">
              <Accordion items={faqItems} />
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA FINAL ──────────────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-brand-dark px-8 py-14 text-center text-white shadow-xl">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-white/10 blur-3xl"
              />
              <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">
                {t('public.final.title')}
              </h2>
              <p className="relative mx-auto mt-3 max-w-xl text-white/85">
                {t('public.final.subtitle')}
              </p>
              <Link
                to="/signup"
                className="relative mt-7 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-brand shadow-lg transition hover:scale-105"
              >
                {t('public.final.cta')}
                <ChevronRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </PublicShell>
  );
}

/** Petit header de section (overline + h2 + sous-titre). */
function SectionHeading({
  overline,
  title,
  subtitle,
  light = false,
}: {
  overline: string;
  title: ReactNode;
  subtitle?: ReactNode;
  light?: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span
        className={`text-xs font-semibold uppercase tracking-[0.2em] ${
          light ? 'text-brand' : 'text-brand'
        }`}
      >
        {overline}
      </span>
      <h2
        className={`mt-3 text-3xl font-bold tracking-tight sm:text-4xl ${
          light ? 'text-white' : 'text-slate-900 dark:text-white'
        }`}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className={`mt-4 text-base ${
            light ? 'text-white/70' : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

/** Mockup décoratif du dashboard pour le hero (SVG + petits KPIs). */
function HeroMockup() {
  const { t } = useTranslation();
  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-brand/20 via-transparent to-amber-200/30 blur-2xl dark:to-amber-500/10" />
      <div className="relative rounded-2xl bg-white p-5 shadow-2xl shadow-slate-900/10 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-700">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-2 flex-1 truncate text-[11px] font-mono text-slate-400">
            bailo.app/dashboard
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2.5 text-xs">
          <div className="rounded-lg bg-emerald-50 p-2.5 dark:bg-emerald-900/30">
            <p className="text-[10px] uppercase font-semibold text-emerald-700 dark:text-emerald-400">
              {t('public.mockup.collected')}
            </p>
            <p className="mt-1 text-base font-bold text-emerald-900 dark:text-emerald-200">
              1 230 000
            </p>
          </div>
          <div className="rounded-lg bg-amber-50 p-2.5 dark:bg-amber-900/30">
            <p className="text-[10px] uppercase font-semibold text-amber-700 dark:text-amber-400">
              {t('public.mockup.arrears')}
            </p>
            <p className="mt-1 text-base font-bold text-amber-900 dark:text-amber-200">320 000</p>
          </div>
          <div className="rounded-lg bg-brand/10 p-2.5">
            <p className="text-[10px] uppercase font-semibold text-brand">
              {t('public.mockup.occupancy')}
            </p>
            <p className="mt-1 text-base font-bold text-brand">92 %</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {[
            { bg: 'bg-emerald-500', w: '85%', label: 'Appt A2 · Loyer octobre' },
            { bg: 'bg-emerald-500', w: '72%', label: 'Appt B4 · Loyer octobre' },
            { bg: 'bg-amber-500', w: '55%', label: 'Chambre C7 · Loyer octobre' },
            { bg: 'bg-red-500', w: '30%', label: 'Chambre D1 · 15 j de retard' },
          ].map((row, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <WalletIcon className="h-3.5 w-3.5 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">
                {row.label}
              </span>
              <span className="h-1 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <span className={`block h-full ${row.bg}`} style={{ width: row.w }} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
