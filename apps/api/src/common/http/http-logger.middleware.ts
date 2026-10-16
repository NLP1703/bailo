import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Logger HTTP minimal format JSON — un log par requête terminée.
 * Préférer ce logger natif à `pino` tant que la dépendance n'est pas ajoutée ;
 * les champs restent compatibles avec un futur remplacement par pino-http.
 *
 * Niveau :
 *   - 5xx → error
 *   - 4xx → warn
 *   - 2xx/3xx → log
 */
@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const startNs = process.hrtime.bigint();
    const { method, originalUrl, ip } = req;
    const requestId = (req as Request & { id?: string }).id;

    res.on('finish', () => {
      const durationMs = Number((process.hrtime.bigint() - startNs) / 1_000_000n);
      const status = res.statusCode;
      const payload = JSON.stringify({
        requestId,
        method,
        url: originalUrl,
        status,
        durationMs,
        ip,
        ua: req.headers['user-agent'],
      });

      if (status >= 500) this.logger.error(payload);
      else if (status >= 400) this.logger.warn(payload);
      else this.logger.log(payload);
    });

    next();
  }
}
