import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from '@bailo/shared';

/**
 * Exception métier typée : porte un code machine stable que le front peut
 * mapper en message i18n. Préférer `AppException` à `HttpException` partout
 * où le front doit distinguer plusieurs erreurs 400/409.
 */
export class AppException extends HttpException {
  readonly code: ErrorCode;

  constructor(
    code: ErrorCode,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    extras: { message?: string; details?: unknown; retryAfterSeconds?: number } = {},
  ) {
    const body: ApiErrorBody = {
      code,
      message: extras.message ?? ERROR_CODES[code],
      ...(extras.details !== undefined ? { details: extras.details } : {}),
      ...(extras.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: extras.retryAfterSeconds }
        : {}),
    };
    super(body, status);
    this.code = code;
  }

  static conflict(code: ErrorCode, details?: unknown): AppException {
    return new AppException(code, HttpStatus.CONFLICT, { details });
  }

  static forbidden(code: ErrorCode, details?: unknown): AppException {
    return new AppException(code, HttpStatus.FORBIDDEN, { details });
  }

  static notFound(code: ErrorCode, details?: unknown): AppException {
    return new AppException(code, HttpStatus.NOT_FOUND, { details });
  }

  static paymentRequired(code: ErrorCode, details?: unknown): AppException {
    return new AppException(code, HttpStatus.PAYMENT_REQUIRED, { details });
  }

  static tooMany(code: ErrorCode, retryAfterSeconds: number): AppException {
    return new AppException(code, HttpStatus.TOO_MANY_REQUESTS, { retryAfterSeconds });
  }
}
