import { useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import {
  BanknoteIcon,
  BookIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockAlertIcon,
  DoorIcon,
  GlobeIcon,
  ReceiptIcon,
  ShieldIcon,
  UsersIcon,
  WhatsAppIcon,
  type IconProps,
} from '../../components/icons';
import { PublicShell } from './PublicShell';
import {
  Counter,
  EASE,
  FadeIn,
  Marquee,
  SpotlightCard,
  Stagger,
  StaggerItem,
  TiltCard,
  WordReveal,
} from './motion';

/**
 * Page d'accueil publique — motion design v2.
 *
 * Langage de mouvement :
 *  - Hero : fond « aurore » qui dérive + grille estompée, titre révélé mot à
 *    mot, parallaxe au scroll (le contenu s'éloigne en douceur), mockup du
 *    tableau de bord inclinable en 3D qui suit la souris, notifications
 *    flottantes qui apparaissent en séquence, chiffres qui comptent.
 *  - Bandeau d'arguments en défilement infini.
 *  - Fonctionnalités : cartes « spotlight » (halo + bordure lumineuse qui
 *    suivent le curseur), entrée en cascade.
 *  - Avant / Avec Bailo : interrupteur global animé (pastille glissante) qui
 *    bascule les trois scénarios avec un fondu-flou.
 *  - Étapes : ligne de progression qui se dessine au fil du scroll.
 *  - FAQ : panneaux qui s'ouvrent en hauteur fluide.
 * Tout se neutralise avec prefers-reduced-motion.
 */

const FEATURES: { icon: ComponentType<IconProps>; key: string }[] = [
  { icon: BanknoteIcon, key: 'collect' },
  { icon: ClockAlertIcon, key: 'arrears' },
  { icon: ReceiptIcon, key: 'receipt' },
  { icon: BookIcon, key: 'ohada' },
  { icon: DoorIcon, key: 'rooms' },
  { icon: UsersIcon, key: 'team' },
];

export function Landing() {
  return (
    <PublicShell>
      <Hero />
      <TrustMarquee />
      <Audience />
      <Features />
      <Stats />
      <BeforeAfter />
      <Steps />
      <Pricing />
      <Faq />
      <FinalCta />
    </PublicShell>
  );
}

// ─── HERO ────────────────────────────────────────────────────────────────────

function Hero() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const contentY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 120]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.8], [1, reduce ? 1 : 0]);
  const mockY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -60]);

  return (
    <section ref={ref} className="relative overflow-hidden">
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-24">
        <motion.div style={{ y: contentY, opacity: contentOpacity }}>
          <motion.span
            initial={reduce ? false : { opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-white/70 px-3 py-1 text-xs font-semibold text-brand shadow-sm backdrop-blur dark:bg-slate-900/60"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
            </span>
            {t('public.hero.badge')}
          </motion.span>

          <h1 className="mt-6 text-[2.6rem] font-bold leading-[1.05] tracking-[-0.03em] sm:text-6xl lg:text-[4.2rem]">
            <WordReveal text={t('public.hero.title1')} delay={0.1} />
            <br />
            <WordReveal text={t('public.hero.title2')} delay={0.35} wordClassName="text-gradient-animated" />
          </h1>

          <FadeIn delay={0.65} y={16}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
              {t('public.hero.subtitle')}
            </p>
          </FadeIn>

          <FadeIn delay={0.8} y={16}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <motion.div whileHover={reduce ? undefined : { y: -2 }} whileTap={{ scale: 0.97 }}>
                <Link
                  to="/signup"
                  className="btn-shine group inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(15,118,110,0.7)] transition-shadow hover:shadow-[0_16px_40px_-12px_rgba(15,118,110,0.85)]"
                >
                  {t('public.hero.ctaPrimary')}
                  <ChevronRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </motion.div>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300/80 bg-white/60 px-6 py-3.5 text-sm font-semibold text-slate-700 backdrop-blur transition hover:border-slate-400 hover:bg-white dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
              >
                {t('public.hero.ctaSecondary')}
              </a>
            </div>
          </FadeIn>

          <Stagger className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
            {['free', 'nocard', 'ohada'].map((k) => (
              <StaggerItem key={k} className="flex items-center gap-1.5">
                <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
                {t(`public.hero.proof.${k}`)}
              </StaggerItem>
            ))}
          </Stagger>
        </motion.div>

        <motion.div
          style={{ y: mockY }}
          initial={reduce ? false : { opacity: 0, y: 60, rotateX: 18, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, rotateX: 0, filter: 'blur(0px)' }}
          transition={{ duration: 1.2, ease: EASE, delay: 0.3 }}
        >
          <HeroMockup />
        </motion.div>
      </div>
    </section>
  );
}

/** Mockup du tableau de bord : inclinable, KPI qui comptent, barres qui se
 *  remplissent, notifications flottantes en séquence. */
function HeroMockup() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const rows = [
    { tone: 'bg-emerald-500', w: 100, label: 'A2 · Loyer octobre', amount: '45 000' },
    { tone: 'bg-emerald-500', w: 100, label: 'B4 · Loyer octobre', amount: '60 000' },
    { tone: 'bg-amber-500', w: 55, label: 'C7 · Paiement partiel', amount: '20 000' },
    { tone: 'bg-red-500', w: 18, label: 'D1 · 15 j de retard', amount: '0' },
  ];

  return (
    <div className="relative mx-auto w-full max-w-[520px]">
      <TiltCard>
        <div className="relative rounded-2xl border border-white/60 bg-white/90 p-5 shadow-[0_40px_80px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/90">
          {/* barre de fenêtre */}
          <div className="flex items-center gap-1.5 border-b border-slate-100 pb-3 dark:border-slate-800">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="ml-3 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800">
              bailo · tableau de bord
            </span>
          </div>

          {/* KPI */}
          <div className="mt-4 grid grid-cols-3 gap-2.5" style={{ transform: 'translateZ(30px)' }}>
            <Kpi label={t('public.mockup.collected')} tone="emerald">
              <Counter to={1230000} />
            </Kpi>
            <Kpi label={t('public.mockup.arrears')} tone="amber">
              <Counter to={320000} />
            </Kpi>
            <Kpi label={t('public.mockup.occupancy')} tone="brand">
              <Counter to={92} suffix=" %" />
            </Kpi>
          </div>

          {/* mini graphique */}
          <div className="mt-4 flex h-20 items-end gap-1.5 rounded-xl bg-slate-50 px-3 pb-2 pt-3 dark:bg-slate-800/60">
            {[38, 52, 45, 68, 61, 82, 74, 95].map((h, i) => (
              <motion.span
                key={i}
                className="flex-1 rounded-t-md bg-gradient-to-t from-brand to-teal-400"
                initial={reduce ? false : { height: 0 }}
                animate={{ height: `${h}%` }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.9 + i * 0.07 }}
              />
            ))}
          </div>

          {/* lignes locataires */}
          <div className="mt-4 space-y-2">
            {rows.map((r, i) => (
              <motion.div
                key={r.label}
                initial={reduce ? false : { opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, ease: EASE, delay: 1.3 + i * 0.1 }}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-[11px] transition hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${r.tone}`} />
                <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{r.label}</span>
                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  <motion.span
                    className={`block h-full ${r.tone}`}
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${r.w}%` }}
                    transition={{ duration: 1, ease: EASE, delay: 1.5 + i * 0.1 }}
                  />
                </span>
                <span className="w-14 text-right font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                  {r.amount}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </TiltCard>

      {/* Notifications flottantes */}
      <FloatingToast
        className="-left-6 top-16 sm:-left-14"
        delay={2.0}
        icon={<BanknoteIcon className="h-4 w-4" />}
        iconClass="bg-emerald-100 text-emerald-700"
        title={t('public.toast.payment')}
        sub="MTN MoMo · 45 000 FCFA"
      />
      <FloatingToast
        className="-right-4 top-1/2 sm:-right-10"
        delay={2.6}
        icon={<ReceiptIcon className="h-4 w-4" />}
        iconClass="bg-brand/10 text-brand"
        title={t('public.toast.receipt')}
        sub="BL-000142 · QR vérifiable"
        floatDelay={1.2}
      />
      <FloatingToast
        className="-bottom-6 left-8"
        delay={3.2}
        icon={<WhatsAppIcon className="h-4 w-4" />}
        iconClass="bg-green-100 text-green-700"
        title={t('public.toast.reminder')}
        sub="Chambre D1 · J+15"
        floatDelay={0.6}
      />
    </div>
  );
}

function Kpi({ label, tone, children }: { label: string; tone: 'emerald' | 'amber' | 'brand'; children: ReactNode }) {
  const cls = {
    emerald: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200',
    amber: 'bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
    brand: 'bg-brand/10 text-brand',
  }[tone];
  return (
    <div className={`rounded-xl p-2.5 ${cls}`}>
      <p className="text-[9px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-[15px] font-bold leading-none">{children}</p>
    </div>
  );
}

function FloatingToast({
  className,
  delay,
  icon,
  iconClass,
  title,
  sub,
  floatDelay = 0,
}: {
  className: string;
  delay: number;
  icon: ReactNode;
  iconClass: string;
  title: string;
  sub: string;
  floatDelay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={`absolute z-10 hidden sm:block ${className}`}
      initial={reduce ? false : { opacity: 0, scale: 0.8, y: 20, filter: 'blur(6px)' }}
      animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.7, ease: EASE, delay }}
    >
      <motion.div
        animate={reduce ? undefined : { y: [0, -8, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: delay + floatDelay }}
        className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/95 py-2.5 pl-2.5 pr-4 shadow-[0_18px_40px_-16px_rgba(15,23,42,0.35)] backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95"
      >
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconClass}`}>{icon}</span>
        <span className="leading-tight">
          <span className="block text-[12px] font-semibold text-slate-900 dark:text-white">{title}</span>
          <span className="block text-[11px] text-slate-500">{sub}</span>
        </span>
      </motion.div>
    </motion.div>
  );
}

// ─── BANDEAU D'ARGUMENTS ─────────────────────────────────────────────────────

function TrustMarquee() {
  const { t } = useTranslation();
  const items: { icon: ComponentType<IconProps>; key: string }[] = [
    { icon: BookIcon, key: 'ohada' },
    { icon: BanknoteIcon, key: 'momo' },
    { icon: ReceiptIcon, key: 'qr' },
    { icon: GlobeIcon, key: 'offline' },
    { icon: ShieldIcon, key: 'secure' },
    { icon: DoorIcon, key: 'multisite' },
    { icon: WhatsAppIcon, key: 'whatsapp' },
  ];
  return (
    <section className="border-y border-slate-200/70 bg-white/60 py-6 backdrop-blur dark:border-slate-800 dark:bg-slate-950/60">
      <Marquee>
        {items.map(({ icon: Icon, key }) => (
          <span key={key} className="flex items-center gap-2.5 whitespace-nowrap text-sm font-semibold text-slate-500 dark:text-slate-400">
            <Icon className="h-4 w-4 text-brand" />
            {t(`public.trust.${key}`)}
          </span>
        ))}
      </Marquee>
    </section>
  );
}

// ─── POUR QUI ? (photos) ─────────────────────────────────────────────────────
// Photos libres de droits (licence Pexels : usage commercial gratuit), hébergées
// dans le site (public/images/landing) en WebP, deux tailles chacune :
//  - owners   : https://www.pexels.com/photo/people-holding-a-key-7579192/
//  - teams    : https://www.pexels.com/photo/photo-of-a-woman-using-her-phone-while-smiling-5711715/
//  - tenants  : https://www.pexels.com/photo/happy-black-students-standing-in-light-studio-6238198/
// Elles illustrent les profils d'utilisateurs : ce ne sont ni des clients ni des témoignages.

const AUDIENCE: { key: 'owners' | 'teams' | 'tenants'; icon: ComponentType<IconProps> }[] = [
  { key: 'owners', icon: BanknoteIcon },
  { key: 'teams', icon: UsersIcon },
  { key: 'tenants', icon: ReceiptIcon },
];

function Audience() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading
          overline={t('public.audience.overline')}
          title={t('public.audience.title')}
          subtitle={t('public.audience.subtitle')}
        />
        <Stagger className="mt-16 grid gap-6 md:grid-cols-3">
          {AUDIENCE.map(({ key, icon: Icon }) => (
            <StaggerItem key={key}>
              <motion.article
                whileHover={reduce ? undefined : { y: -6 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="group h-full overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <img
                    src={`/images/landing/${key}-640.webp`}
                    srcSet={`/images/landing/${key}-640.webp 640w, /images/landing/${key}-960.webp 960w`}
                    sizes="(min-width: 768px) 33vw, 100vw"
                    width={640}
                    height={480}
                    loading="lazy"
                    decoding="async"
                    alt={t(`public.audience.${key}.alt`)}
                    className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/35 to-transparent" />
                  <span className="absolute bottom-4 left-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white/90 text-brand shadow-sm backdrop-blur dark:bg-slate-900/90">
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
                <div className="p-6">
                  <h3 className="text-lg font-semibold tracking-tight">{t(`public.audience.${key}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {t(`public.audience.${key}.body`)}
                  </p>
                </div>
              </motion.article>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

// ─── FONCTIONNALITÉS ─────────────────────────────────────────────────────────

function Features() {
  const { t } = useTranslation();
  return (
    <section id="features" className="relative scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading overline={t('public.feat.overline')} title={t('public.feat.title')} subtitle={t('public.feat.subtitle')} />
        <Stagger className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, key }, i) => (
            <StaggerItem key={key}>
              <SpotlightCard>
                <div className="p-7">
                  <div className="flex items-start justify-between">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/15 to-teal-400/10 text-brand ring-1 ring-brand/15 transition-all duration-500 group-hover:-rotate-6 group-hover:scale-110 group-hover:from-brand group-hover:to-teal-500 group-hover:text-white">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-300 transition-colors duration-500 group-hover:text-brand dark:text-slate-600">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <h3 className="mt-6 text-lg font-semibold tracking-tight">{t(`public.feat.${key}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{t(`public.feat.${key}.body`)}</p>
                </div>
              </SpotlightCard>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

// ─── CHIFFRES ─────────────────────────────────────────────────────────────────
// Uniquement des faits produit vérifiables (pas de faux « +500 clients »).

function Stats() {
  const { t } = useTranslation();
  const stats: { value: number; suffix: string; key: string }[] = [
    { value: 10, suffix: ' min', key: 'setup' },
    { value: 5, suffix: '', key: 'free' },
    { value: 0, suffix: ' FCFA', key: 'cost' },
    { value: 100, suffix: ' %', key: 'audit' },
  ];
  return (
    <section className="border-y border-slate-200/70 bg-white py-20 dark:border-slate-800 dark:bg-slate-950">
      <Stagger className="relative mx-auto grid max-w-6xl grid-cols-2 gap-8 px-5 sm:px-8 lg:grid-cols-4">
        {stats.map((s) => (
          <StaggerItem key={s.key} className="text-center lg:text-left">
            <p className="text-4xl font-bold tracking-tight text-brand sm:text-5xl">
              <Counter to={s.value} suffix={s.suffix} />
            </p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t(`public.stats.${s.key}`)}</p>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

// ─── AVANT / AVEC BAILO (interrupteur) ───────────────────────────────────────

function BeforeAfter() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'before' | 'after'>('after');
  const items = ['b1', 'b2', 'b3'] as const;

  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading overline={t('public.ba.overline')} title={t('public.ba.title')} subtitle={t('public.ba.subtitle')} />

        <FadeIn delay={0.1}>
          <div className="mt-10 flex justify-center">
            <div role="tablist" className="relative inline-flex rounded-full bg-slate-100 p-1 dark:bg-slate-800">
              {(['before', 'after'] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`relative z-10 rounded-full px-6 py-2.5 text-sm font-semibold transition-colors duration-300 ${
                    mode === m ? (m === 'after' ? 'text-white' : 'text-slate-900 dark:text-white') : 'text-slate-500'
                  }`}
                >
                  {mode === m && (
                    <motion.span
                      layoutId="ba-pill"
                      className={`absolute inset-0 -z-10 rounded-full shadow-md ${m === 'after' ? 'bg-brand' : 'bg-white dark:bg-slate-600'}`}
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  {m === 'before' ? t('public.ba.before') : t('public.ba.after')}
                </button>
              ))}
            </div>
          </div>
        </FadeIn>

        <Stagger className="mt-12 grid gap-5 md:grid-cols-3">
          {items.map((k) => (
            <StaggerItem key={k}>
              <div
                className={`relative h-full overflow-hidden rounded-2xl border p-7 transition-colors duration-500 ${
                  mode === 'after'
                    ? 'border-brand/25 bg-gradient-to-br from-brand/[0.06] to-transparent'
                    : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{t(`public.ba.${k}.badge`)}</p>
                <div className="relative mt-4 min-h-[96px]">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={mode}
                      initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, y: -14, filter: 'blur(6px)' }}
                      transition={{ duration: 0.45, ease: EASE }}
                      className="flex gap-3"
                    >
                      <span
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          mode === 'after' ? 'bg-brand text-white' : 'bg-red-100 text-red-600'
                        }`}
                      >
                        {mode === 'after' ? '✓' : '✕'}
                      </span>
                      <p
                        className={`text-[15px] leading-relaxed ${
                          mode === 'after' ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-500'
                        }`}
                      >
                        {t(`public.ba.${k}.${mode}`)}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

// ─── ÉTAPES (ligne qui se dessine au scroll) ─────────────────────────────────

function Steps() {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 55%'] });
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 24 });
  const steps = ['s1', 's2', 's3'] as const;

  return (
    <section className="relative bg-white py-24 sm:py-32 dark:bg-slate-950">
      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading overline={t('public.step.overline')} title={t('public.step.title')} subtitle={t('public.step.subtitle')} />

        <div ref={ref} className="relative mt-20 grid gap-10 md:grid-cols-3 md:gap-6">
          {/* rail + progression (desktop) */}
          <div aria-hidden="true" className="absolute left-[16.6%] right-[16.6%] top-6 hidden h-px bg-slate-200 md:block dark:bg-slate-800">
            <motion.div className="h-full origin-left bg-gradient-to-r from-brand via-teal-400 to-amber-400" style={{ scaleX: progress }} />
          </div>

          {steps.map((s, i) => (
            <FadeIn key={s} delay={i * 0.15} className="relative text-center">
              <StepDot index={i} progress={progress} />
              <h3 className="mt-6 text-lg font-semibold">{t(`public.step.${s}.title`)}</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-600 dark:text-slate-400">{t(`public.step.${s}.body`)}</p>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

function StepDot({ index, progress }: { index: number; progress: ReturnType<typeof useSpring> }) {
  const threshold = index / 2; // 0, 0.5, 1
  const bg = useTransform(progress, [Math.max(0, threshold - 0.08), threshold], ['rgba(241,245,249,1)', 'rgba(15,118,110,1)']);
  const scale = useTransform(progress, [Math.max(0, threshold - 0.08), threshold, threshold + 0.1], [1, 1.15, 1]);
  const color = useTransform(progress, [Math.max(0, threshold - 0.08), threshold], ['rgb(100,116,139)', 'rgb(255,255,255)']);
  return (
    <motion.span
      style={{ backgroundColor: bg, color, scale }}
      className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-full font-mono text-sm font-bold ring-1 ring-slate-200 dark:ring-slate-700"
    >
      {String(index + 1).padStart(2, '0')}
    </motion.span>
  );
}

// ─── OFFRES ───────────────────────────────────────────────────────────────────

function Pricing() {
  const { t } = useTranslation();
  return (
    <section id="pricing" className="scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <SectionHeading overline={t('public.pricing.overline')} title={t('public.pricing.title')} subtitle={t('public.pricing.subtitle')} />
        <Stagger className="mt-16 grid gap-6 md:grid-cols-2">
          <StaggerItem>
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className="relative h-full rounded-3xl bg-gradient-to-br from-brand via-teal-500 to-amber-400 p-[1.5px] shadow-[0_30px_60px_-30px_rgba(15,118,110,0.6)]"
            >
              <div className="h-full rounded-[22px] bg-white p-8 dark:bg-slate-900">
                <span className="inline-flex rounded-full bg-brand/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand">
                  {t('public.pricing.freeBadge')}
                </span>
                <p className="mt-5 text-5xl font-bold tracking-tight">{t('public.pricing.freeTitle')}</p>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{t('public.pricing.freeDesc')}</p>
                <PlanList prefix="public.pricing.freeList" keys={['f1', 'f2', 'f3', 'f4']} />
                <Link
                  to="/signup"
                  className="btn-shine mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-brand-dark"
                >
                  {t('public.pricing.freeCta')}
                  <ChevronRightIcon className="h-4 w-4" />
                </Link>
              </div>
            </motion.div>
          </StaggerItem>
          <StaggerItem>
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className="h-full rounded-3xl border border-slate-200 bg-slate-50 p-8 dark:border-slate-800 dark:bg-slate-900/60"
            >
              <span className="inline-flex rounded-full bg-slate-200 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {t('public.pricing.paidBadge')}
              </span>
              <p className="mt-5 text-3xl font-bold tracking-tight">{t('public.pricing.paidTitle')}</p>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{t('public.pricing.paidDesc')}</p>
              <PlanList prefix="public.pricing.paidList" keys={['p1', 'p2', 'p3', 'p4']} />
              <p className="mt-8 text-xs italic text-slate-500">{t('public.pricing.paidHint')}</p>
            </motion.div>
          </StaggerItem>
        </Stagger>
      </div>
    </section>
  );
}

function PlanList({ prefix, keys }: { prefix: string; keys: string[] }) {
  const { t } = useTranslation();
  return (
    <ul className="mt-6 space-y-3 text-sm">
      {keys.map((k) => (
        <li key={k} className="flex items-start gap-2.5">
          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          <span className="text-slate-700 dark:text-slate-200">{t(`${prefix}.${k}`)}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── FAQ (ouverture fluide) ──────────────────────────────────────────────────

function Faq() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>('q1');
  const keys = ['q1', 'q2', 'q3', 'q4', 'q5'];
  return (
    <section id="faq" className="scroll-mt-20 bg-white py-24 sm:py-32 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <SectionHeading overline={t('public.faq.overline')} title={t('public.faq.title')} subtitle={t('public.faq.subtitle')} />
        <Stagger className="mt-12 space-y-3">
          {keys.map((k) => {
            const isOpen = open === k;
            return (
              <StaggerItem key={k}>
                <div
                  className={`overflow-hidden rounded-2xl border bg-white transition-colors duration-300 dark:bg-slate-900 ${
                    isOpen ? 'border-brand/30 shadow-[0_12px_30px_-18px_rgba(15,118,110,0.45)]' : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : k)}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left text-[15px] font-semibold"
                  >
                    {t(`public.faq.${k}.q`)}
                    <motion.span
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={{ duration: 0.4, ease: EASE }}
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isOpen ? 'bg-brand text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}
                    >
                      <ChevronDownIcon className="h-4 w-4" />
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.45, ease: EASE }}
                      >
                        <p className="px-6 pb-6 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{t(`public.faq.${k}.a`)}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}

// ─── CTA FINAL ────────────────────────────────────────────────────────────────

function FinalCta() {
  const { t } = useTranslation();
  return (
    <section className="py-24">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <FadeIn>
          <div className="relative overflow-hidden rounded-[2rem] bg-brand px-8 py-16 text-center text-white sm:px-16 sm:py-20">
            {/* Résidence à Lagos (Pexels, licence gratuite) :
                https://www.pexels.com/photo/modern-high-rise-building-in-lagos-nigeria-34557960/
                Fondue dans la couleur de marque pour garder le texte lisible. */}
            <img
              src="/images/landing/residence-960.webp"
              srcSet="/images/landing/residence-960.webp 960w, /images/landing/residence-1600.webp 1600w"
              sizes="(min-width: 1024px) 1024px, 100vw"
              width={960}
              height={540}
              loading="lazy"
              decoding="async"
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30 mix-blend-luminosity"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand/80 via-brand/70 to-teal-900/80" />
            <h2 className="relative mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">{t('public.final.title')}</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-white/70">{t('public.final.subtitle')}</p>
            <motion.div className="relative mt-9 inline-block" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Link
                to="/signup"
                className="btn-shine inline-flex items-center gap-2 rounded-xl bg-white px-7 py-4 text-sm font-semibold text-slate-900 shadow-[0_10px_40px_-10px_rgba(255,255,255,0.5)]"
              >
                {t('public.final.cta')}
                <ChevronRightIcon className="h-4 w-4" />
              </Link>
            </motion.div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

// ─── Utilitaire : en-tête de section ─────────────────────────────────────────

function SectionHeading({
  overline,
  title,
  subtitle,
  light = false,
}: {
  overline: string;
  title: string;
  subtitle?: string;
  light?: boolean;
}) {
  return (
    <FadeIn className="mx-auto max-w-2xl text-center">
      <span
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${
          light ? 'bg-white/10 text-teal-300' : 'bg-brand/10 text-brand'
        }`}
      >
        {overline}
      </span>
      <h2 className={`mt-5 text-3xl font-bold tracking-[-0.02em] sm:text-[2.75rem] sm:leading-[1.1] ${light ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
        {title}
      </h2>
      {subtitle && (
        <p className={`mt-4 text-base leading-relaxed sm:text-lg ${light ? 'text-white/60' : 'text-slate-600 dark:text-slate-400'}`}>{subtitle}</p>
      )}
    </FadeIn>
  );
}
