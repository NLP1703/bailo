import {
  animate,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type Variants,
} from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from 'react';

/**
 * Primitives de motion design de la page publique (Framer Motion).
 *
 * Principes :
 *  - une seule courbe d'accélération partout (EASE, « ease-out-quint ») pour
 *    une sensation cohérente ;
 *  - révélations combinant opacité + translation + flou (plus « produit »
 *    qu'un simple fondu) ;
 *  - cascades courtes (60–90 ms) pour guider l'œil sans le faire attendre ;
 *  - tout est neutralisé si l'utilisateur demande moins d'animations
 *    (prefers-reduced-motion) — exigence d'accessibilité.
 */

export const EASE = [0.22, 1, 0.36, 1] as const;

// ─── Révélation au scroll ─────────────────────────────────────────────────────

export function FadeIn({
  children,
  delay = 0,
  y = 28,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: 'blur(8px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.8, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

// ─── Cascade (grilles de cartes) ──────────────────────────────────────────────

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const staggerChild: Variants = {
  hidden: { opacity: 0, y: 32, scale: 0.97, filter: 'blur(6px)' },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: { duration: 0.75, ease: EASE },
  },
};

export function Stagger({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={staggerParent}
      initial={reduce ? false : 'hidden'}
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={staggerChild}>
      {children}
    </motion.div>
  );
}

// ─── Titre révélé mot à mot ───────────────────────────────────────────────────

export function WordReveal({
  text,
  className = '',
  delay = 0,
  wordClassName = '',
}: {
  text: string;
  className?: string;
  delay?: number;
  wordClassName?: string;
}) {
  const reduce = useReducedMotion();
  const words = text.split(' ');
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={`${w}-${i}`} className="inline-block overflow-hidden pb-[0.12em] align-bottom" aria-hidden="true">
          <motion.span
            className={`inline-block ${wordClassName}`}
            initial={reduce ? false : { y: '110%', opacity: 0, rotate: 4 }}
            animate={{ y: '0%', opacity: 1, rotate: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: delay + i * 0.07 }}
          >
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

// ─── Compteur animé ───────────────────────────────────────────────────────────

export function Counter({
  to,
  suffix = '',
  className = '',
  duration = 1.8,
}: {
  to: number;
  suffix?: string;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? to : 0);

  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, to, {
      duration,
      ease: EASE,
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, to, duration, reduce]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {value.toLocaleString('fr-FR')}
      {suffix}
    </span>
  );
}

// ─── Carte « spotlight » (halo qui suit la souris) ───────────────────────────

export function SpotlightCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const mx = useMotionValue(-200);
  const my = useMotionValue(-200);
  const bg = useMotionTemplate`radial-gradient(420px circle at ${mx}px ${my}px, rgba(15,118,110,0.14), transparent 70%)`;
  const border = useMotionTemplate`radial-gradient(260px circle at ${mx}px ${my}px, rgba(15,118,110,0.55), transparent 70%)`;

  function onMove(e: MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(e.clientX - r.left);
    my.set(e.clientY - r.top);
  }

  return (
    <div
      onMouseMove={onMove}
      onMouseLeave={() => {
        mx.set(-200);
        my.set(-200);
      }}
      className={`group relative h-full rounded-2xl bg-slate-200/70 p-px transition-shadow duration-500 hover:shadow-[0_20px_50px_-20px_rgba(15,118,110,0.35)] dark:bg-slate-700/60 ${className}`}
    >
      {/* bordure lumineuse qui suit le curseur */}
      <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: border }} />
      <div className="relative h-full overflow-hidden rounded-[15px] bg-white dark:bg-slate-900">
        <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: bg }} />
        <div className="relative h-full">{children}</div>
      </div>
    </div>
  );
}

// ─── Carte inclinable en 3D (mockup du hero) ──────────────────────────────────

export function TiltCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 120, damping: 18, mass: 0.6 });
  const sy = useSpring(py, { stiffness: 120, damping: 18, mass: 0.6 });
  const rotateY = useTransform(sx, [0, 1], [-9, 9]);
  const rotateX = useTransform(sy, [0, 1], [7, -7]);
  const glareX = useTransform(sx, [0, 1], ['0%', '100%']);
  const glare = useMotionTemplate`radial-gradient(600px circle at ${glareX} 0%, rgba(255,255,255,0.35), transparent 50%)`;

  function onMove(e: MouseEvent<HTMLDivElement>) {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  }

  return (
    <div
      className={className}
      style={{ perspective: 1200 }}
      onMouseMove={onMove}
      onMouseLeave={() => {
        px.set(0.5);
        py.set(0.5);
      }}
    >
      <motion.div style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }} className="relative">
        {children}
        <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-2xl mix-blend-overlay" style={{ background: glare }} />
      </motion.div>
    </div>
  );
}

// ─── Défilement infini (bandeau d'arguments) ─────────────────────────────────

export function Marquee({ children, speed = 38 }: { children: ReactNode; speed?: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
      <div
        className="flex w-max gap-12"
        style={reduce ? undefined : { animation: `bailo-marquee ${speed}s linear infinite` }}
      >
        <div className="flex shrink-0 items-center gap-12">{children}</div>
        <div className="flex shrink-0 items-center gap-12" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}
