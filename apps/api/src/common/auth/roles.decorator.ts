import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@bailo/shared';

export const ROLES_KEY = 'roles';

/**
 * Restreint une route à certains rôles (matrice §2.1 du cahier des charges).
 * Sans décorateur, une route protégée est ouverte à tout utilisateur authentifié du compte.
 */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
