import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, OtpService, TokenService],
  // TokenService est réutilisé par le TenancyMiddleware (vérif. du JWT d'accès).
  // OtpService est réutilisé par AdminUsersService (reset de mot de passe).
  exports: [TokenService, OtpService],
})
export class AuthModule {}
