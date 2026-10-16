import 'reflect-metadata';
// Charge le .env du monorepo (racine) AVANT tout import qui lit process.env.
// En prod, les variables sont injectées par Docker — dotenv.config() ne fait rien si .env absent.
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';
loadDotenv({ path: resolve(__dirname, '../../../.env') });

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { loadEnv } from './common/config/env';
import { PrismaExceptionFilter } from './common/http/prisma-exception.filter';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // Les routes /health et /ready restent hors du préfixe /api/v1 (sondes k8s/Docker standards).
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready'] });
  app.enableCors({ origin: env.CORS_ORIGIN, credentials: true });
  app.useGlobalFilters(new PrismaExceptionFilter());
  // La validation métier passe par Zod (ZodValidationPipe) ; ce pipe ne sert
  // qu'à rejeter les charges utiles non conformes au typage de base.
  app.useGlobalPipes(new ValidationPipe({ transform: false, whitelist: false }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Bailo API')
    .setDescription('Gestion locative — cités et immeubles (MVP)')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(env.API_PORT);
  Logger.log(
    `API prête sur http://localhost:${env.API_PORT}/api/v1 (docs: /api/docs)`,
    'Bootstrap',
  );
}

void bootstrap();
