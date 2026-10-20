import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

/**
 * Sous-module « équipe & sessions » du périmètre Admin (Lot 2).
 * Dépend d'`AuthModule` pour réutiliser `TokenService` (révocation de sessions)
 * et `OtpService` (envoi d'un OTP de réinitialisation de mot de passe).
 */
@Module({
  imports: [AuthModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
  exports: [AdminUsersService],
})
export class AdminUsersModule {}
