import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request } from 'express';
import type { RequestContext } from '../tenancy/request-context';
import { captureServerError } from './monitoring';

/**
 * Filtre global « attrape-tout » : signale au monitoring les erreurs inattendues
 * (exceptions non HTTP et réponses 5xx), puis délègue à la gestion Nest par défaut.
 * Les erreurs métier (4xx : validation, droits, introuvable…) ne sont pas signalées.
 *
 * À déclarer AVANT les filtres spécialisés (`PrismaExceptionFilter`) pour que
 * ceux-ci gardent la main sur les erreurs qu'ils traitent.
 */
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500 && host.getType() === 'http') {
      const req = host.switchToHttp().getRequest<Request & { ctx?: RequestContext; id?: string }>();
      captureServerError(exception, {
        requestId: req.id, // posé par RequestIdMiddleware (renvoyé au client dans X-Request-Id)
        route: req.route?.path as string | undefined,
        method: req.method,
        account: req.ctx?.accountId,
      });
    }
    super.catch(exception, host);
  }
}
