import { Global, Module } from '@nestjs/common';
import { APP_ENV, loadEnv } from './env';

/**
 * Expose la configuration d'environnement validée (Zod) via le token `APP_ENV`.
 * `loadEnv()` échoue au démarrage si une variable requise manque (fail-fast).
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_ENV,
      useFactory: loadEnv,
    },
  ],
  exports: [APP_ENV],
})
export class ConfigModule {}
