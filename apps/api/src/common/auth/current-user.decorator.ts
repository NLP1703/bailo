import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestContext } from '../tenancy/request-context';

/**
 * Injecte le contexte d'appel (userId, accountId, role) posé par le TenancyMiddleware.
 * Sur une route protégée, il est toujours présent (garanti par le JwtAuthGuard).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext => {
    const request = ctx.switchToHttp().getRequest<Request & { ctx?: RequestContext }>();
    if (!request.ctx) {
      // Ne devrait jamais arriver derrière le JwtAuthGuard.
      throw new Error('Contexte utilisateur absent sur une route protégée');
    }
    return request.ctx;
  },
);
