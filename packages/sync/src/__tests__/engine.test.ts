import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SyncEngine } from '../engine';
import { MemoryOutboxStore, MemoryPullStore } from '../memory-store';
import type {
  PullPage,
  PushRequest,
  PushResponse,
  PushResult,
  Scheduler,
  SyncOperation,
  SyncTransport,
} from '../types';

/** Horloge et minuteries simulées : rien ne s'exécute tant que le test ne l'a pas décidé. */
class FakeScheduler implements Scheduler {
  time = Date.UTC(2026, 9, 28, 9, 0, 0);
  timers: Array<{ at: number; fn: () => void; id: number }> = [];
  private nextId = 1;
  now(): number {
    return this.time;
  }
  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.push({ at: this.time + ms, fn, id });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.timers = this.timers.filter((t) => t.id !== handle);
  }
  /** Avance l'horloge et renvoie les minuteries échues (sans les lancer). */
  advance(ms: number): Array<() => void> {
    this.time += ms;
    const due = this.timers.filter((t) => t.at <= this.time);
    this.timers = this.timers.filter((t) => t.at > this.time);
    return due.map((t) => t.fn);
  }
}

type Fault = 'none' | 'beforeApply' | 'afterApply';

/**
 * Serveur simulé qui suit la règle du protocole : chaque opId n'est appliqué qu'une fois,
 * les opérations sont traitées dans l'ordre reçu.
 */
class FakeServer implements SyncTransport {
  readonly appliedOrder: string[] = [];
  readonly results = new Map<string, PushResult>();
  readonly requests: PushRequest[] = [];
  /** Décide, pour chaque appel, s'il échoue avant ou après l'application. */
  fault: () => Fault = () => 'none';
  rejectIf: (payload: unknown) => string | null = () => null;
  retryIf: (opId: string) => boolean = () => false;
  inFlight = 0;
  maxInFlight = 0;
  pages: PullPage[] = [];
  pullCalls: Array<string | null> = [];
  pullFails = false;

  async push(request: PushRequest): Promise<PushResponse> {
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      await Promise.resolve();
      this.requests.push(request);
      const fault = this.fault();
      if (fault === 'beforeApply') throw new Error('Network request failed');
      const results: PushResult[] = [];
      for (const op of request.ops) {
        const previous = this.results.get(op.opId);
        if (previous) {
          results.push(
            previous.status === 'applied' ? { ...previous, status: 'duplicate' } : previous,
          );
          continue;
        }
        if (this.retryIf(op.opId)) {
          results.push({ opId: op.opId, status: 'retry', message: 'Service indisponible' });
          break; // le serveur s'arrête aussi au premier échec passager
        }
        const reason = this.rejectIf(op.payload);
        const result: PushResult = reason
          ? { opId: op.opId, status: 'rejected', errorCode: reason, message: reason }
          : { opId: op.opId, status: 'applied', entityId: op.opId };
        if (result.status === 'applied') this.appliedOrder.push(op.opId);
        this.results.set(op.opId, result);
        results.push(result);
      }
      if (fault === 'afterApply') throw new Error('Connexion coupée pendant la réponse');
      return { results };
    } finally {
      this.inFlight -= 1;
    }
  }

  async pull(_siteId: string, cursor: string | null): Promise<PullPage> {
    this.pullCalls.push(cursor);
    if (this.pullFails) throw new Error('Network request failed');
    const index = cursor === null ? 0 : Number(cursor);
    const page = this.pages[index];
    if (!page) return { changes: {}, tombstones: {}, cursor: String(index), hasMore: false };
    return page;
  }
}

function setup(batchSize = 50) {
  const outbox = new MemoryOutboxStore();
  const pullStore = new MemoryPullStore();
  const server = new FakeServer();
  const scheduler = new FakeScheduler();
  const engine = new SyncEngine({
    outbox,
    pullStore,
    transport: server,
    deviceId: 'device-1',
    uuid: () => randomUUID(),
    scheduler,
    batchSize,
  });
  return { outbox, pullStore, server, scheduler, engine };
}

const pay = (amount: number) => ({ type: 'payment.create', siteId: 'site-1', payload: { amount } });

describe('SyncEngine — file et envoi', () => {
  it('enregistre localement avec un seq croissant et un opId unique, puis envoie dans l’ordre', async () => {
    const { engine, outbox, server } = setup();
    const a = await engine.enqueue(pay(1000));
    const b = await engine.enqueue(pay(2000));
    const c = await engine.enqueue(pay(3000));
    expect([a.seq, b.seq, c.seq]).toEqual([1, 2, 3]);
    expect(new Set([a.opId, b.opId, c.opId]).size).toBe(3);
    expect(await outbox.count()).toBe(3);

    const report = await engine.flush();
    expect(report).toEqual({ sent: 3, applied: 3, rejected: 0, interrupted: false });
    expect(server.appliedOrder).toEqual([a.opId, b.opId, c.opId]);
    expect(await outbox.count()).toBe(0);
    expect(engine.getState()).toMatchObject({ phase: 'idle', pendingCount: 0, lastError: null });
  });

  it('transmet au serveur le nombre d’opérations en attente et la plus ancienne (RGM7)', async () => {
    const { engine, server } = setup();
    const first = await engine.enqueue(pay(1000));
    await engine.enqueue(pay(2000));
    await engine.flush();
    expect(server.requests[0]).toMatchObject({
      deviceId: 'device-1',
      pendingCount: 2,
      oldestPendingAt: first.createdAt,
    });
  });

  it('range une opération refusée dans « à corriger » sans bloquer les suivantes (RGM6)', async () => {
    const { engine, outbox, server } = setup();
    server.rejectIf = (p) => ((p as { amount: number }).amount < 0 ? 'AMOUNT_INVALID' : null);
    const ok1 = await engine.enqueue(pay(1000));
    const bad = await engine.enqueue(pay(-5));
    const ok2 = await engine.enqueue(pay(2000));

    const report = await engine.flush();
    expect(report).toMatchObject({ applied: 2, rejected: 1, interrupted: false });
    expect(server.appliedOrder).toEqual([ok1.opId, ok2.opId]);
    expect(outbox.toFix).toHaveLength(1);
    expect(outbox.toFix[0]).toMatchObject({ errorCode: 'AMOUNT_INVALID', op: { opId: bad.opId } });
    expect(await outbox.count()).toBe(0);
  });

  it('s’arrête sur une erreur passagère et reprend à la même opération, dans l’ordre (RGM2)', async () => {
    const { engine, outbox, server, scheduler } = setup();
    const ops: SyncOperation[] = [];
    for (let i = 1; i <= 4; i += 1) ops.push(await engine.enqueue(pay(i * 1000)));
    let failing = true;
    server.retryIf = (opId) => failing && opId === ops[2]!.opId;

    const first = await engine.flush();
    expect(first).toMatchObject({ applied: 2, interrupted: true });
    expect((await outbox.pending(10)).map((o) => o.opId)).toEqual([ops[2]!.opId, ops[3]!.opId]);
    expect(engine.getState().phase).toBe('offline');
    expect(engine.getState().nextRetryAt).toBe(scheduler.now() + 5_000);

    failing = false;
    const due = scheduler.advance(5_000);
    expect(due).toHaveLength(1);
    due[0]!();
    await engine.flush();
    expect(server.appliedOrder).toEqual(ops.map((o) => o.opId));
    expect(await outbox.count()).toBe(0);
  });

  it('ne perd rien sans réseau et espace les tentatives : 5 s, 15 s, 1 min, puis 5 min', async () => {
    const { engine, outbox, server, scheduler } = setup();
    server.fault = () => 'beforeApply';
    await engine.enqueue(pay(1000));
    const waits: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      await engine.flush();
      waits.push(engine.getState().nextRetryAt! - scheduler.now());
    }
    expect(waits).toEqual([5_000, 15_000, 60_000, 300_000, 300_000]);
    expect(await outbox.count()).toBe(1);
    expect((await outbox.pending(1))[0]!.attempts).toBe(5);

    server.fault = () => 'none';
    await engine.flush();
    expect(await outbox.count()).toBe(0);
    expect(engine.getState()).toMatchObject({ phase: 'idle', lastError: null, nextRetryAt: null });
  });

  it('réponse perdue après application : le renvoi revient en « duplicate », aucun doublon', async () => {
    const { engine, outbox, server } = setup();
    const a = await engine.enqueue(pay(15000));
    const b = await engine.enqueue(pay(10000));
    server.fault = () => 'afterApply';
    await engine.flush();
    expect(server.appliedOrder).toEqual([a.opId, b.opId]);
    expect(await outbox.count()).toBe(2); // le téléphone n'a pas eu la réponse

    server.fault = () => 'none';
    await engine.flush();
    expect(server.appliedOrder).toEqual([a.opId, b.opId]); // toujours une seule fois chacune
    expect(outbox.applied.map((x) => x.result.status)).toEqual(['duplicate', 'duplicate']);
    expect(await outbox.count()).toBe(0);
  });

  it('un seul envoi à la fois, même avec plusieurs déclencheurs simultanés', async () => {
    const { engine, server } = setup();
    for (let i = 0; i < 5; i += 1) await engine.enqueue(pay(1000 + i));
    await Promise.all([engine.flush(), engine.flush(), engine.flush()]);
    expect(server.maxInFlight).toBe(1);
    expect(server.appliedOrder).toHaveLength(5);
  });

  it('prend en compte une opération ajoutée pendant un envoi', async () => {
    const { engine, server, outbox } = setup();
    await engine.enqueue(pay(1000));
    const flushing = engine.flush();
    const late = await engine.enqueue(pay(2000));
    await engine.flush();
    await flushing;
    expect(server.appliedOrder).toContain(late.opId);
    expect(await outbox.count()).toBe(0);
  });

  it('découpe en lots de la taille demandée', async () => {
    const { engine, server } = setup(3);
    for (let i = 0; i < 7; i += 1) await engine.enqueue(pay(1000 + i));
    await engine.flush();
    expect(server.requests.map((r) => r.ops.length)).toEqual([3, 3, 1]);
  });

  it('traite une réponse incomplète comme une erreur passagère, et ignore les opId inconnus', async () => {
    const { engine, outbox } = setup();
    const a = await engine.enqueue(pay(1000));
    const b = await engine.enqueue(pay(2000));
    const transport: SyncTransport = {
      push: async () => ({
        results: [
          { opId: 'inconnu', status: 'applied' },
          { opId: a.opId, status: 'applied' },
        ],
      }),
      pull: async () => ({ changes: {}, tombstones: {}, cursor: '0', hasMore: false }),
    };
    const engine2 = new SyncEngine({
      outbox,
      pullStore: new MemoryPullStore(),
      transport,
      deviceId: 'd',
      uuid: () => randomUUID(),
      scheduler: new FakeScheduler(),
    });
    const report = await engine2.flush();
    expect(report).toMatchObject({ applied: 1, interrupted: true });
    expect((await outbox.pending(10)).map((o) => o.opId)).toEqual([b.opId]);
    expect(engine.getState().pendingCount).toBe(2); // l'autre moteur n'a rien changé
  });

  it('critère de recette n°1 : 1 000 opérations, coupures aléatoires, chacune appliquée une fois', async () => {
    const { engine, outbox, server } = setup();
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    server.fault = () => {
      const r = random();
      return r < 0.2 ? 'beforeApply' : r < 0.4 ? 'afterApply' : 'none';
    };
    const ids: string[] = [];
    for (let i = 0; i < 1000; i += 1) {
      ids.push((await engine.enqueue(pay(1000 + i))).opId);
      if (i % 37 === 0) await engine.flush();
    }
    for (let attempt = 0; attempt < 500 && (await outbox.count()) > 0; attempt += 1) {
      await engine.flush();
    }
    expect(await outbox.count()).toBe(0);
    expect(server.appliedOrder).toEqual(ids); // tout, dans l'ordre, sans doublon
  });
});

describe('SyncEngine — réception', () => {
  it('reçoit page par page et n’avance le curseur qu’après application', async () => {
    const { engine, pullStore, server } = setup();
    server.pages = [
      {
        changes: { units: [{ id: 'u1' }, { id: 'u2' }] },
        tombstones: {},
        cursor: '1',
        hasMore: true,
      },
      {
        changes: { units: [{ id: 'u3' }] },
        tombstones: { units: ['u1'] },
        cursor: '2',
        hasMore: false,
      },
    ];
    expect(await engine.pull('site-1')).toBe(true);
    expect(server.pullCalls).toEqual([null, '1']);
    expect([...pullStore.rows.get('site-1')!.get('units')!.keys()]).toEqual(['u2', 'u3']);
    expect(await pullStore.getCursor('site-1')).toBe('2');
  });

  it('sans réseau, garde le curseur et passe hors-ligne', async () => {
    const { engine, pullStore, server } = setup();
    await pullStore.applyPage('site-1', {
      changes: {},
      tombstones: {},
      cursor: '7',
      hasMore: false,
    });
    server.pullFails = true;
    expect(await engine.pull('site-1')).toBe(false);
    expect(await pullStore.getCursor('site-1')).toBe('7');
    expect(engine.getState().phase).toBe('offline');
  });

  it('recharge tout quand le serveur demande une remise à zéro', async () => {
    const { engine, pullStore } = setup();
    await pullStore.applyPage('site-1', {
      changes: { units: [{ id: 'old' }] },
      tombstones: {},
      cursor: '9',
      hasMore: false,
    });
    let calls = 0;
    const transport: SyncTransport = {
      push: async () => ({ results: [] }),
      pull: async (_site, cursor): Promise<PullPage> => {
        calls += 1;
        if (cursor === '9')
          return { changes: {}, tombstones: {}, cursor: '9', hasMore: false, resetRequired: true };
        return { changes: { units: [{ id: 'new' }] }, tombstones: {}, cursor: '1', hasMore: false };
      },
    };
    const engine2 = new SyncEngine({
      outbox: new MemoryOutboxStore(),
      pullStore,
      transport,
      deviceId: 'd',
      uuid: () => randomUUID(),
      scheduler: new FakeScheduler(),
    });
    expect(await engine2.pull('site-1')).toBe(true);
    expect(calls).toBe(2);
    expect([...pullStore.rows.get('site-1')!.get('units')!.keys()]).toEqual(['new']);
    expect(engine.getState().phase).toBe('idle');
  });

  it('syncNow : envoie d’abord, puis reçoit ; pas de réception si l’envoi a échoué', async () => {
    const { engine, server } = setup();
    await engine.enqueue(pay(1000));
    server.fault = () => 'beforeApply';
    expect(await engine.syncNow('site-1')).toMatchObject({ interrupted: true, pulled: false });
    expect(server.pullCalls).toHaveLength(0);
    server.fault = () => 'none';
    expect(await engine.syncNow('site-1')).toMatchObject({ applied: 1, pulled: true });
    expect(server.pullCalls).toHaveLength(1);
  });
});
