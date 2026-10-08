import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { accountScopeMiddleware } from './account-scope';
import { runWithContext } from '../tenancy/request-context';

const ACCOUNT = 'acc-1';

function run(params: Prisma.MiddlewareParams) {
  const middleware = accountScopeMiddleware();
  const next = vi.fn(async (p: Prisma.MiddlewareParams) => p);
  return runWithContext({ userId: 'u1', accountId: ACCOUNT, role: 'OWNER' }, async () => {
    await middleware(params, next);
    return next.mock.calls[0]![0];
  });
}

describe('accountScopeMiddleware (NF7)', () => {
  it('injecte accountId dans les données de create', async () => {
    const out = await run({
      model: 'Unit',
      action: 'create',
      args: { data: { code: 'A01' } },
      dataPath: [],
      runInTransaction: false,
    });
    expect(out.args.data).toMatchObject({ code: 'A01', accountId: ACCOUNT });
  });

  it('injecte accountId sur chaque ligne de createMany', async () => {
    const out = await run({
      model: 'Unit',
      action: 'createMany',
      args: { data: [{ code: 'A01' }, { code: 'A02' }] },
      dataPath: [],
      runInTransaction: false,
    });
    expect(out.args.data).toEqual([
      { code: 'A01', accountId: ACCOUNT },
      { code: 'A02', accountId: ACCOUNT },
    ]);
  });

  it('ajoute le filtre accountId sur findMany', async () => {
    const out = await run({
      model: 'Tenant',
      action: 'findMany',
      args: { where: { name: { contains: 'x' } } },
      dataPath: [],
      runInTransaction: false,
    });
    expect(out.args.where).toEqual({ name: { contains: 'x' }, accountId: ACCOUNT });
  });

  it('ajoute le filtre accountId sur findUnique (extended where)', async () => {
    const out = await run({
      model: 'Site',
      action: 'findUnique',
      args: { where: { id: 'site-9' } },
      dataPath: [],
      runInTransaction: false,
    });
    expect(out.args.where).toEqual({ id: 'site-9', accountId: ACCOUNT });
  });

  it('ne touche pas un modèle non scopé (OtpCode)', async () => {
    const out = await run({
      model: 'OtpCode',
      action: 'create',
      args: { data: { phone: '690000000' } },
      dataPath: [],
      runInTransaction: false,
    });
    expect(out.args.data).toEqual({ phone: '690000000' });
  });

  it('ne fait rien hors contexte authentifié', async () => {
    const middleware = accountScopeMiddleware();
    const next = vi.fn(async (p: Prisma.MiddlewareParams) => p);
    await middleware(
      {
        model: 'Unit',
        action: 'findMany',
        args: { where: {} },
        dataPath: [],
        runInTransaction: false,
      },
      next,
    );
    expect(next.mock.calls[0]![0].args.where).toEqual({});
  });
});
