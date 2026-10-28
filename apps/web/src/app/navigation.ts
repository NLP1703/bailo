import type { ComponentType } from 'react';
import type { MeView } from '@bailo/shared';
import {
  DashboardIcon,
  ClockAlertIcon,
  DoorIcon,
  UsersIcon,
  UserPlusIcon,
  BanknoteIcon,
  WalletIcon,
  BellIcon,
  BuildingIcon,
  FileTextIcon,
  TagIcon,
  SettingsIcon,
  ShieldIcon,
  ReceiptIcon,
  BookIcon,
  type IconProps,
} from '../components/icons';

/**
 * Source unique de la navigation : la sidebar, le fil d'Ariane et la recherche
 * globale lisent tous cette description. Ajouter un écran = l'ajouter ici.
 */

type Role = MeView['role'];

export interface NavEntry {
  to: string;
  /** Clé i18n du libellé court (sidebar). */
  labelKey: string;
  Icon: ComponentType<IconProps>;
  /** Correspondance exacte (pour « / »). */
  end?: boolean;
  /** Rôles autorisés ; absent = tout le monde. */
  roles?: Role[];
  /** Masqué quand le compte est en lecture seule (action d'écriture). */
  write?: boolean;
  /** Mots-clés supplémentaires pour la recherche globale. */
  keywords?: string;
}

export interface NavSection {
  key: 'pilotage' | 'rental' | 'finance' | 'admin';
  labelKey: string;
  items: NavEntry[];
}

const MGMT: Role[] = ['OWNER', 'MANAGER'];

export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'pilotage',
    labelKey: 'nav.section.pilotage',
    items: [
      { to: '/', labelKey: 'nav.dashboard', Icon: DashboardIcon, end: true, keywords: 'accueil home kpi' },
      { to: '/arrears', labelKey: 'nav.arrears', Icon: ClockAlertIcon, roles: MGMT, keywords: 'retard dette arriérés' },
    ],
  },
  {
    key: 'rental',
    labelKey: 'nav.section.rental',
    items: [
      { to: '/rooms', labelKey: 'nav.rooms', Icon: DoorIcon, keywords: 'logements appartements plan' },
      { to: '/tenants', labelKey: 'nav.tenants', Icon: UsersIcon, roles: MGMT, keywords: 'occupants réservations' },
      { to: '/new-entry', labelKey: 'nav.newEntry', Icon: UserPlusIcon, roles: MGMT, write: true, keywords: 'bail contrat arrivée' },
      { to: '/contracts', labelKey: 'nav.contracts', Icon: FileTextIcon, roles: MGMT, keywords: 'bail signature caution' },
    ],
  },
  {
    key: 'finance',
    labelKey: 'nav.section.finance',
    items: [
      { to: '/collect', labelKey: 'nav.collect', Icon: BanknoteIcon, write: true, keywords: 'paiement loyer momo orange' },
      { to: '/cash', labelKey: 'nav.cash', Icon: WalletIcon, keywords: 'caisse journal encaissements' },
      { to: '/expenses', labelKey: 'nav.expenses', Icon: ReceiptIcon, roles: MGMT, keywords: 'depenses charges travaux taxes' },
      { to: '/accounting', labelKey: 'nav.accounting', Icon: BookIcon, roles: MGMT, keywords: 'ohada syscohada comptabilite export csv journal' },
      { to: '/reminders', labelKey: 'nav.reminders', Icon: BellIcon, keywords: 'whatsapp sms rappel' },
    ],
  },
  {
    key: 'admin',
    labelKey: 'nav.section.admin',
    items: [
      { to: '/admin', labelKey: 'nav.admin', Icon: ShieldIcon, roles: MGMT, keywords: 'administration équipe audit abonnement intégrations gouvernance' },
      { to: '/sites/new', labelKey: 'nav.addSite', Icon: BuildingIcon, roles: MGMT, write: true, keywords: 'immeuble créer' },
      { to: '/templates', labelKey: 'nav.templates', Icon: FileTextIcon, roles: ['OWNER'], keywords: 'messages modèles contrat reçu' },
      { to: '/plans', labelKey: 'nav.plans', Icon: TagIcon, roles: ['OWNER'], keywords: 'abonnement facturation prix' },
      { to: '/settings', labelKey: 'nav.settings', Icon: SettingsIcon, keywords: 'utilisateurs paramètres langue' },
    ],
  },
];

function allowed(item: NavEntry, user: MeView | null): boolean {
  if (!user) return false;
  if (item.roles && !item.roles.includes(user.role)) return false;
  if (item.write && user.readOnly) return false;
  return true;
}

/** Rubriques visibles pour l'utilisateur courant (les rubriques vides disparaissent). */
export function visibleSections(user: MeView | null): NavSection[] {
  return NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => allowed(i, user)) })).filter(
    (s) => s.items.length > 0,
  );
}

// ─── Fil d'Ariane ────────────────────────────────────────────────────────────

export interface Crumb {
  labelKey: string;
  to?: string;
}

/** Écrans de détail / hors menu, rattachés à une rubrique et un parent. */
const DETAIL_ROUTES: { pattern: RegExp; section: NavSection['key']; parent?: string; labelKey: string }[] = [
  { pattern: /^\/units\/[^/]+$/, section: 'rental', parent: '/rooms', labelKey: 'nav.crumb.unit' },
  { pattern: /^\/tenants\/[^/]+$/, section: 'rental', parent: '/tenants', labelKey: 'nav.crumb.tenant' },
  { pattern: /^\/checkout/, section: 'rental', parent: '/tenants', labelKey: 'nav.crumb.checkout' },
  { pattern: /^\/contracts\/new$/, section: 'rental', parent: '/contracts', labelKey: 'nav.crumb.contractNew' },
  { pattern: /^\/contracts\/[^/]+$/, section: 'rental', parent: '/contracts', labelKey: 'nav.crumb.contract' },
  { pattern: /^\/inspections$/, section: 'rental', parent: '/tenants', labelKey: 'nav.crumb.inspections' },
  { pattern: /^\/meters$/, section: 'rental', parent: '/rooms', labelKey: 'nav.crumb.meters' },
  { pattern: /^\/sites\/(?!new$)[^/]+$/, section: 'admin', parent: '/settings', labelKey: 'nav.crumb.site' },
  { pattern: /^\/admin\/[a-z-]+$/, section: 'admin', parent: '/admin', labelKey: 'nav.admin' },
  { pattern: /^\/profile$/, section: 'admin', labelKey: 'nav.profile' },
  { pattern: /^\/more$/, section: 'admin', labelKey: 'nav.more' },
];

const ALL_ITEMS = NAV_SECTIONS.flatMap((s) => s.items.map((i) => ({ ...i, section: s })));

/**
 * Construit le fil d'Ariane d'une URL : rubrique › parent › page.
 * Le tableau de bord n'affiche que lui-même.
 */
export function breadcrumbFor(pathname: string): Crumb[] {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return [{ labelKey: 'nav.dashboard' }];

  const exact = ALL_ITEMS.find((i) => i.to === path);
  if (exact) return [{ labelKey: exact.section.labelKey }, { labelKey: exact.labelKey }];

  const detail = DETAIL_ROUTES.find((d) => d.pattern.test(path));
  if (detail) {
    const section = NAV_SECTIONS.find((s) => s.key === detail.section)!;
    const parent = detail.parent ? ALL_ITEMS.find((i) => i.to === detail.parent) : undefined;
    return [
      { labelKey: section.labelKey },
      ...(parent ? [{ labelKey: parent.labelKey, to: parent.to }] : []),
      { labelKey: detail.labelKey },
    ];
  }
  return [];
}

/** Recherche insensible aux accents et à la casse. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
