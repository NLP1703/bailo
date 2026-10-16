import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserRole } from '@bailo/shared';
import type { RequestContext } from '../tenancy/request-context';
import { ROLES_KEY } from './roles.decorator';

/**
 * Applique la matrice des droits (§2.1). S'exécute après le JwtAuthGuard :
 * si la route exige des rôles et que le rôle courant n'y figure pas → 403.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { ctx?: RequestContext }>();
    const role = request.ctx?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException('Droit insuffisant pour cette action');
    }
    return true;
  }
}
