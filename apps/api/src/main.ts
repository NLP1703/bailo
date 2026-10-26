import 'reflect-metadata';
// Charge le .env du monorepo (racine) AVANT tout import qui lit process.env.
// En prod, les variables sont injectées par Docker — dotenv.config() ne fait rien si .env absent.
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';
loadDotenv({ path: resolve(__dirname, '../../../.env') });

// Monitoring (Sentry) initialisé avant le reste de l'application — inactif sans SENTRY_DSN.
import { initMonitoring } from './common/monitoring/monitoring';
initMonitoring();

import { Logger, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { loadEnv } from './common/config/env';
import { PrismaExceptionFilter } from './common/http/prisma-exception.filter';
import { AllExceptionsFilter } from './common/monitoring/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // Derrière un reverse-proxy (Railway, Render, Caddy…), on fait confiance au premier
  // hop pour X-Forwarded-* : indispensable pour les cookies Secure, les redirections,
  // la limite de taux par IP réelle et les webhooks momo/OM qui s'appuient sur l'URL.
  const expressApp = app.getHttpAdapter().getInstance();
  if (typeof expressApp.set === 'function') {
    expressApp.set('trust proxy', 1);
  }

  // Les routes /health et /ready restent hors du préfixe /api/v1 (sondes k8s/Docker standards).
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready'] });
  // CORS : accepte une ou plusieurs origines séparées par des virgules.
  const corsOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    credentials: true,
  });
  // Ordre important : l'attrape-tout d'abord, le filtre Prisma (plus spécifique) ensuite.
  app.useGlobalFilters(
    new AllExceptionsFilter(app.get(HttpAdapterHost).httpAdapter),
    new PrismaExceptionFilter(),
  );
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

  const port = env.PORT ?? env.API_PORT;
  // 0.0.0.0 : indispensable en conteneur (localhost ne reçoit que du trafic interne).
  await app.listen(port, '0.0.0.0');
  Logger.log(
    `API prête sur le port ${port} (préfixe /api/v1, docs: /api/docs)`,
    'Bootstrap',
  );
}

void bootstrap();
