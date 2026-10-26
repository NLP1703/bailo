import { Global, Module } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../common/config/env';
import { BrevoMailProvider, ResendMailProvider } from './http-mail.providers';
import { ConsoleMailProvider, MAIL_PROVIDER, type MailProvider } from './mail.provider';

/**
 * Sélection du fournisseur d'e-mails selon `EMAIL_PROVIDER` :
 *  - `console` : factice (dev / tests), interdit en production ;
 *  - `brevo`   : API Brevo (adresse d'expéditeur vérifiée suffit) ;
 *  - `resend`  : API Resend (nom de domaine vérifié requis).
 */
@Global()
@Module({
  providers: [
    ConsoleMailProvider,
    BrevoMailProvider,
    ResendMailProvider,
    {
      provide: MAIL_PROVIDER,
      inject: [APP_ENV, ConsoleMailProvider, BrevoMailProvider, ResendMailProvider],
      useFactory: (
        env: AppEnv,
        consoleProvider: ConsoleMailProvider,
        brevo: BrevoMailProvider,
        resend: ResendMailProvider,
      ): MailProvider =>
        env.EMAIL_PROVIDER === 'brevo'
          ? brevo
          : env.EMAIL_PROVIDER === 'resend'
            ? resend
            : consoleProvider,
    },
  ],
  exports: [MAIL_PROVIDER],
})
export class MailModule {}
