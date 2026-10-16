import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

/**
 * Correlation ID : attache un `request-id` à chaque requête (en lit un existant
 * côté upstream si présent — Caddy/Nginx peut déjà en poser un via l'en-tête
 * `X-Request-Id`). L'ID est renvoyé dans la réponse pour permettre à l'utilisateur
 * ou au front de le remonter en cas d'incident.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = (req.headers['x-request-id'] ?? req.headers['x-correlation-id']) as
      | string
      | undefined;
    const id = incoming && /^[a-zA-Z0-9_-]{8,128}$/.test(incoming) ? incoming : randomUUID();
    (req as Request & { id: string }).id = id;
    res.setHeader('X-Request-Id', id);
    next();
  }
}
