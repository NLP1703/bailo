import {
  BadRequestException,
  InternalServerErrorException,
  type ArgumentsHost,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter';

// vi.mock est remonté en tête de fichier : la fonction espion doit l'être aussi.
const capture = vi.hoisted(() => vi.fn());
vi.mock('./monitoring', () => ({ captureServerError: (...args: unknown[]) => capture(...args) }));

function httpHost(): ArgumentsHost {
  const req = {
    id: 'req-1234',
    method: 'GET',
    route: { path: '/api/v1/x' },
    ctx: { accountId: 'acc-1' },
  };
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter (monitoring 6.4)', () => {
  beforeEach(() => {
    capture.mockReset();
    vi.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined);
  });

  it('signale une erreur inattendue avec des étiquettes techniques', () => {
    const filter = new AllExceptionsFilter();
    const err = new Error('boom');
    filter.catch(err, httpHost());
    expect(capture).toHaveBeenCalledWith(err, {
      requestId: 'req-1234',
      route: '/api/v1/x',
      method: 'GET',
      account: 'acc-1',
    });
    expect(BaseExceptionFilter.prototype.catch).toHaveBeenCalled();
  });

  it('signale une 5xx explicite', () => {
    new AllExceptionsFilter().catch(new InternalServerErrorException(), httpHost());
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('ne signale pas une erreur métier 4xx, mais la délègue', () => {
    new AllExceptionsFilter().catch(new BadRequestException('invalide'), httpHost());
    expect(capture).not.toHaveBeenCalled();
    expect(BaseExceptionFilter.prototype.catch).toHaveBeenCalled();
  });
});
