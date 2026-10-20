import { useState, type ReactNode } from 'react';
import { ChevronDownIcon } from './icons';

/**
 * Accordéon : liste de panneaux dépliables (FAQ, détails avancés…).
 *
 * Un seul panneau ouvert à la fois par défaut (prop `single`), ou plusieurs
 * (`multiple`). Utilise un `<button aria-expanded>` + `aria-controls` pour
 * l'accessibilité clavier et lecteurs d'écran.
 *
 * Usage :
 *   <Accordion items={[{ id, title, content }, …]} />
 */
export interface AccordionItem {
  id: string;
  title: ReactNode;
  content: ReactNode;
}

export function Accordion({
  items,
  mode = 'single',
  defaultOpen,
}: {
  items: AccordionItem[];
  mode?: 'single' | 'multiple';
  defaultOpen?: string[];
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(defaultOpen ?? []));

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (mode === 'single') next.clear();
        next.add(id);
      }
      return next;
    });
  };

  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-slate-200/70 dark:divide-slate-700 dark:bg-slate-800 dark:ring-slate-700">
      {items.map((item) => {
        const isOpen = openIds.has(item.id);
        const panelId = `accordion-panel-${item.id}`;
        const headerId = `accordion-header-${item.id}`;
        return (
          <li key={item.id}>
            <button
              type="button"
              id={headerId}
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => toggle(item.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-700/50"
            >
              <span className="flex-1">{item.title}</span>
              <ChevronDownIcon
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {isOpen && (
              <div
                id={panelId}
                role="region"
                aria-labelledby={headerId}
                className="px-4 pb-4 text-sm text-slate-600 dark:text-slate-300"
              >
                {item.content}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
