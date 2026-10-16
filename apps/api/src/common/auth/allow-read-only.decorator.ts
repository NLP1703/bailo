import { SetMetadata } from '@nestjs/common';

export const ALLOW_READONLY_KEY = 'allowReadOnly';

/** Autorise un handler mutatif même quand le compte est en lecture seule
 *  (ex. changer d'offre pour régulariser, se déconnecter). */
export const AllowWhenReadOnly = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_READONLY_KEY, true);
