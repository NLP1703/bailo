import { Global, Module } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../common/config/env';
import { GmailMailProvider } from './gmail.provider';
import { BrevoMailProvider, ResendMailProvider } from './http-mail.providers';
import { ConsoleMailProvider, MAIL_PROVIDER, type MailProvider } from './mail.provider';

/**
 * Sélection du fournisseur d'e-mails selon `EMAIL_PROVIDER` :
 *  - `console` : factice (dev / tests), interdit en production ;
 *  - `gmail`   : API Gmail depuis un compte Gmail (OAuth, portée gmail.send) ;
 *  - `brevo`   : API Brevo (adresse d'expéditeur vérifiée suffit) ;
 *  - `resend`  : API Resend (nom de domaine vérifié requis).
 */
@Global()
@Module({
  providers: [
    ConsoleMailProvider,
    GmailMailProvider,
    BrevoMailProvider,
    ResendMailProvider,
    {
      provide: MAIL_PROVIDER,
      inject: [
        APP_ENV,
        ConsoleMailProvider,
        GmailMailProvider,
        BrevoMailProvider,
        ResendMailProvider,
      ],
      useFactory: (
        env: AppEnv,
        consoleProvider: ConsoleMailProvider,
        gmail: GmailMailProvider,
        brevo: BrevoMailProvider,
        resend: ResendMailProvider,
      ): MailProvider =>
        env.EMAIL_PROVIDER === 'gmail'
          ? gmail
          : env.EMAIL_PROVIDER === 'brevo'
            ? brevo
            : env.EMAIL_PROVIDER === 'resend'
              ? resend
              : consoleProvider,
    },
  ],
  exports: [MAIL_PROVIDER],
})
export class MailModule {}
