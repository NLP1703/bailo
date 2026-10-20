import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpIcon, MailIcon, PhoneIcon, WhatsAppIcon, XIcon } from './icons';

/**
 * Bouton de contact flottant (coin bas-droite sur desktop uniquement :
 * sur mobile, la bottom-nav + les FAB d'écran prennent déjà la place).
 *
 * Ouvre un petit menu avec 3 canaux : WhatsApp (direct, parcours mobile du
 * bailleur camerounais), appel téléphone, email. Les coordonnées sont
 * configurables via les variables d'env Vite (VITE_SUPPORT_PHONE, EMAIL,
 * WHATSAPP) — valeurs sensibles non committées.
 */
const PHONE = import.meta.env.VITE_SUPPORT_PHONE ?? '';
const EMAIL = import.meta.env.VITE_SUPPORT_EMAIL ?? '';
const WHATSAPP = import.meta.env.VITE_SUPPORT_WHATSAPP ?? '';

export function ContactFab() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  // Si aucun canal n'est configuré, on cache le bouton (évite un cul-de-sac).
  if (!PHONE && !EMAIL && !WHATSAPP) return null;

  return (
    <div className="fixed bottom-6 right-20 z-20 hidden lg:block print:hidden">
      {open && (
        <div
          role="menu"
          className="mb-2 w-56 origin-bottom-right animate-pop-in rounded-xl bg-white p-1 shadow-pop ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
        >
          {WHATSAPP && (
            <a
              href={`https://wa.me/${WHATSAPP.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <WhatsAppIcon className="h-4 w-4 text-emerald-600" />
              {t('contact.whatsapp')}
            </a>
          )}
          {PHONE && (
            <a
              href={`tel:${PHONE}`}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <PhoneIcon className="h-4 w-4 text-slate-500" />
              {t('contact.phone')}
            </a>
          )}
          {EMAIL && (
            <a
              href={`mailto:${EMAIL}`}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <MailIcon className="h-4 w-4 text-slate-500" />
              {t('contact.email')}
            </a>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? t('contact.close') : t('contact.open')}
        aria-expanded={open}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-pop ring-4 ring-white transition hover:bg-brand-dark active:scale-95 dark:ring-slate-900"
      >
        {open ? <XIcon className="h-5 w-5" /> : <HelpIcon className="h-5 w-5" />}
      </button>
    </div>
  );
}
