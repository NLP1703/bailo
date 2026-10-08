import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { RequestContext } from '../tenancy/request-context';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Exige un contexte authentifié, sauf sur les routes `@Public()`.
 * Le contexte (`req.ctx`) est établi en amont par le TenancyMiddleware à partir du JWT ;
 * ce guard ne fait que vérifier sa présence.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { ctx?: RequestContext }>();
    if (!request.ctx) {
      throw new UnauthorizedException('Authentification requise');
    }
    return true;
  }
}
