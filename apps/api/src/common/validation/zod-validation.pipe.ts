import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Valide et transforme une entrée (body/query/param) avec un schéma Zod
 * partagé (`@bailo/shared`). Rejette en 400 avec le détail des erreurs.
 *
 * Usage : `@Body(new ZodValidationPipe(createSiteDto)) dto: CreateSiteDto`.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation échouée',
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
