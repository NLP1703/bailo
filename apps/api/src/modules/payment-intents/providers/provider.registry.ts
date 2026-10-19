// Registre des providers disponibles. Pour brancher les vrais MoMo/OM Collect,
// ajouter une implémentation MtnMomoCollectProvider / OrangeMoneyCollectProvider
// et l'enregistrer ici. Les clés API et les secrets vivent dans la configuration
// (jamais en base, voir Account.momoApiKeyRef qui est un pointeur vers un secret).

import { Injectable } from '@nestjs/common';
import type { PaymentProvider as ProviderName } from '@prisma/client';
import { PaymentCollectProvider } from './provider';
import { MockCollectProvider } from './mock.provider';

@Injectable()
export class PaymentProviderRegistry {
  private readonly providers = new Map<ProviderName, PaymentCollectProvider>();

  constructor(mock: MockCollectProvider) {
    this.providers.set('MOCK', mock);
    // En l'absence des vraies clés MoMo/OM, on route MTN_MOMO et ORANGE_MONEY
    // vers le mock pour que la plateforme reste utilisable en dev / démo.
    this.providers.set('MTN_MOMO', mock);
    this.providers.set('ORANGE_MONEY', mock);
  }

  get(name: ProviderName): PaymentCollectProvider {
    const p = this.providers.get(name);
    if (!p) throw new Error(`Provider ${name} indisponible`);
    return p;
  }
}
