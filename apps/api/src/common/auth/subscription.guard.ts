import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { RequestContext } from '../tenancy/request-context';
import { BillingService } from '../billing/billing.service';
import { ALLOW_READONLY_KEY } from './allow-read-only.decorator';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Lecture seule après non-paiement (§9.1) : bloque les écritures d'un compte
 * dont l'abonnement est échu (hors délai de grâce). Les lectures et les
 * handlers marqués @AllowWhenReadOnly (changer d'offre…) passent toujours.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billing: BillingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { ctx?: RequestContext }>();
    if (SAFE_METHODS.has(request.method)) return true;
    if (!request.ctx) return true; // route publique (auth, vérif. reçu)

    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_READONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed) return true;

    if (await this.billing.isReadOnly(request.ctx.accountId)) {
      throw new HttpException(
        'Compte en lecture seule : abonnement à régulariser',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return true;
  }
}
