import type { OptionalPaginationQuery, PaginatedResult } from '@bailo/shared';

/** Fenêtre `skip`/`take` à passer à `findMany`, absente quand la liste n'est pas paginée. */
export interface PageWindow {
  skip: number;
  take: number;
}

/**
 * Pagination par offset **optionnelle** (2.2).
 *
 * - Sans `pageSize` : comportement historique, la liste complète est renvoyée
 *   telle quelle (tableau). Les écrans existants qui calculent des totaux sur la
 *   liste filtrée continuent de fonctionner.
 * - Avec `pageSize` : renvoie `{ items, total, page, pageSize }`. La lecture et le
 *   comptage partent en parallèle avec le même filtre.
 */
export async function listMaybePaginated<T>(
  q: OptionalPaginationQuery,
  find: (window?: PageWindow) => Promise<T[]>,
  count: () => Promise<number>,
): Promise<T[] | PaginatedResult<T>> {
  if (q.pageSize === undefined) return find();
  const page = q.page ?? 1;
  const pageSize = q.pageSize;
  const [items, total] = await Promise.all([
    find({ skip: (page - 1) * pageSize, take: pageSize }),
    count(),
  ]);
  return { items, total, page, pageSize };
}
