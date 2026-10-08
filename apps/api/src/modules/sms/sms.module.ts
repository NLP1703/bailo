import { Global, Module } from '@nestjs/common';
import { ConsoleSmsProvider, SMS_PROVIDER } from './sms.provider';

/**
 * Sélection du fournisseur d'envoi. MVP : `console` (factice) en dev.
 * Un fournisseur local (SMS/WhatsApp) s'ajoute ici derrière la même interface.
 */
@Global()
@Module({
  providers: [
    ConsoleSmsProvider,
    {
      provide: SMS_PROVIDER,
      useExisting: ConsoleSmsProvider,
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
