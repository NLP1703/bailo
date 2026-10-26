import { Global, Module } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../common/config/env';
import { AfricasTalkingSmsProvider } from './africastalking.provider';
import { ConsoleSmsProvider, SMS_PROVIDER, type SmsProvider } from './sms.provider';

/**
 * Sélection du fournisseur d'envoi selon `SMS_PROVIDER` :
 *  - `console`        : factice (dev / tests), interdit en production ;
 *  - `africastalking` : Africa's Talking (8.1).
 * Tout autre fournisseur s'ajoute ici derrière la même interface `SmsProvider`.
 */
@Global()
@Module({
  providers: [
    ConsoleSmsProvider,
    AfricasTalkingSmsProvider,
    {
      provide: SMS_PROVIDER,
      inject: [APP_ENV, ConsoleSmsProvider, AfricasTalkingSmsProvider],
      useFactory: (
        env: AppEnv,
        consoleProvider: ConsoleSmsProvider,
        africasTalking: AfricasTalkingSmsProvider,
      ): SmsProvider => (env.SMS_PROVIDER === 'africastalking' ? africasTalking : consoleProvider),
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
