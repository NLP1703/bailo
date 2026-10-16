import { Prisma } from '@prisma/client';
import { getContext } from '../tenancy/request-context';

/**
 * Modèles porteurs d'un `accountId` : filtrage systématique par compte (NF7).
 * Les tables sans `accountId` (Account, OtpCode, RefreshToken, UserSite) sont
 * hors périmètre — elles sont scopées autrement (par id, par user, par téléphone).
 */
export const ACCOUNT_SCOPED_MODELS: ReadonlySet<string> = new Set([
  'User',
  'Site',
  'Block',
  'Unit',
  'Tenant',
  'Guarantor',
  'Occupancy',
  'Charge',
  'Payment',
  'Allocation',
  'CashHandover',
  'Reminder',
  'Template',
  'ReceiptSequence',
  'AuditLog',
]);

function withAccount(
  where: Record<string, unknown> | undefined,
  accountId: string,
): Record<string, unknown> {
  return { ...(where ?? {}), accountId };
}

/**
 * Garde multi-tenant au niveau ORM (NF7). Filet de sécurité en plus du filtrage
 * explicite fait dans les services : quel que soit ce que demande le code appelant,
 * toute requête sur un modèle scopé est forcée sur l'`accountId` du contexte courant.
 *
 * - create / createMany : injecte `accountId` dans les données.
 * - toute lecture / écriture ciblée : ajoute `accountId` au `where`
 *   (Prisma 5 accepte un filtre non-unique aux côtés d'un champ unique — « extended where »).
 *
 * Hors contexte authentifié (routes publiques : OTP, login, vérif. de reçu),
 * `getContext()` est `undefined` et le middleware ne fait rien : ces flux
 * portent leur propre `accountId` explicitement.
 */
export function accountScopeMiddleware(): Prisma.Middleware {
  return async (params, next) => {
    const ctx = getContext();
    if (!ctx || !params.model || !ACCOUNT_SCOPED_MODELS.has(params.model)) {
      return next(params);
    }
    const { accountId } = ctx;
    const args = (params.args ??= {});

    switch (params.action) {
      case 'create':
        args.data = { ...(args.data ?? {}), accountId };
        break;
      case 'createMany': {
        const data = args.data;
        args.data = Array.isArray(data)
          ? data.map((row: Record<string, unknown>) => ({ ...row, accountId }))
          : { ...(data ?? {}), accountId };
        break;
      }
      case 'upsert':
        args.where = withAccount(args.where, accountId);
        args.create = { ...(args.create ?? {}), accountId };
        break;
      case 'findUnique':
      case 'findUniqueOrThrow':
      case 'findFirst':
      case 'findFirstOrThrow':
      case 'findMany':
      case 'update':
      case 'updateMany':
      case 'delete':
      case 'deleteMany':
      case 'count':
      case 'aggregate':
      case 'groupBy':
        args.where = withAccount(args.where, accountId);
        break;
      default:
        break;
    }
    return next(params);
  };
}
