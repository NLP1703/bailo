import { Global, Module } from '@nestjs/common';
import { SiteAccessService } from './site-access.service';

/** Fournit les services transverses de cloisonnement (accès par site). */
@Global()
@Module({
  providers: [SiteAccessService],
  exports: [SiteAccessService],
})
export class TenancyModule {}
