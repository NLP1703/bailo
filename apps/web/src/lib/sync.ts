import { useEffect, useState } from 'react';
import type { CreatePaymentDto } from '@bailo/shared';
import { api } from './api';
import { db, type CachedTenant, type CachedUnit } from './db';

/** Ajoute un paiement à la file hors-ligne. */
export async function enqueuePayment(body: CreatePaymentDto): Promise<void> {
  await db.outbox.put({ clientId: body.clientId, body, createdAt: Date.now() });
}

export async function pendingCount(): Promise<number> {
  return db.outbox.count();
}

/** Pousse la file puis rafraîchit le cache local. Sans réseau, échoue en silence. */
export async function sync(): Promise<{ pushed: number }> {
  const queued = await db.outbox.toArray();
  let pushed = 0;
  if (queued.length > 0) {
    const { results } = await api.post<{ results: { clientId: string; status: string }[] }>(
      '/sync/push',
      { payments: queued.map((q) => q.body) },
    );
    for (const r of results) {
      if (r.status === 'ok') {
        await db.outbox.delete(r.clientId);
        pushed += 1;
      }
    }
  }
  await pull();
  return { pushed };
}

/** Récupère un instantané et le range dans le cache local (lecture hors-ligne). */
export async function pull(): Promise<void> {
  const since = (await db.meta.get('since'))?.value;
  const data = await api.get<{
    serverTime: string;
    units: CachedUnit[];
    tenants: CachedTenant[];
  }>(`/sync/pull${since ? `?since=${encodeURIComponent(since)}` : ''}`);
  if (data.units.length) await db.units.bulkPut(data.units);
  if (data.tenants.length) await db.tenants.bulkPut(data.tenants);
  await db.meta.put({ key: 'since', value: data.serverTime });
}

/** Hook : nombre d'opérations en attente + état réseau, resynchronise au retour en ligne. */
export function useSyncStatus(): { online: boolean; pending: number } {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const refresh = () => {
      void pendingCount().then(setPending);
    };
    refresh();
    const onOnline = () => {
      setOnline(true);
      void sync().finally(refresh);
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const timer = setInterval(refresh, 5000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(timer);
    };
  }, []);

  return { online, pending };
}
