import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * Traduit les erreurs Prisma connues en réponses HTTP propres :
 *  - P2002 (violation d'unicité) → 409 Conflict
 *  - P2025 (enregistrement absent) → 404 Not Found
 *    (couvre aussi les accès inter-comptes : le filtre `accountId` fait échouer
 *     un update/delete ciblant une donnée d'un autre compte, comme si elle n'existait pas.)
 *
 * Aucune donnée personnelle n'est journalisée (NF8) : on ne loggue que le code d'erreur.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    let httpException: HttpException;

    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.target as string[] | undefined)?.join(', ');
        httpException = new ConflictException(
          target ? `Valeur déjà utilisée (${target})` : "Contrainte d'unicité violée",
        );
        break;
      }
      case 'P2025':
        httpException = new NotFoundException('Ressource introuvable');
        break;
      default:
        this.logger.warn(`Erreur Prisma non mappée: ${exception.code}`);
        httpException = new ConflictException('Opération impossible');
        break;
    }

    const status = httpException.getStatus();
    response.status(status).json(httpException.getResponse());
  }
}
