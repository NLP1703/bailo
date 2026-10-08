import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TokenService } from '../../modules/auth/token.service';
import { runWithContext, type RequestContext } from './request-context';

/**
 * Établit le contexte d'appel à partir du Bearer JWT et propage l'`accountId`
 * dans un AsyncLocalStorage pour toute la durée de la requête (base du filtrage NF7).
 *
 * - Sans en-tête ou avec un token invalide : `req.ctx` reste absent ;
 *   le JwtAuthGuard renverra 401 sur les routes protégées, et les routes
 *   `@Public()` fonctionnent sans contexte.
 * - Avec un token valide : `req.ctx` est posé ET tout le pipeline aval
 *   (guards, handler, Prisma) s'exécute dans `runWithContext`.
 */
@Injectable()
export class TenancyMiddleware implements NestMiddleware {
  constructor(private readonly tokens: TokenService) {}

  use(req: Request & { ctx?: RequestContext }, _res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      const payload = this.tokens.verifyAccess(header.slice(7));
      if (payload) {
        const ctx: RequestContext = {
          userId: payload.sub,
          accountId: payload.accountId,
          role: payload.role,
        };
        req.ctx = ctx;
        runWithContext(ctx, () => next());
        return;
      }
    }
    next();
  }
}
