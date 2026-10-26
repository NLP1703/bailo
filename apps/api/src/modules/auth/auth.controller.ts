import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  loginDto,
  logoutDto,
  passwordResetDto,
  refreshDto,
  requestOtpDto,
  signupDto,
  type AuthSession,
  type LoginDto,
  type LogoutDto,
  type PasswordResetDto,
  type RefreshDto,
  type RequestOtpDto,
  type SignupDto,
} from '@bailo/shared';
import { APP_ENV, type AppEnv } from '../../common/config/env';
import { Public } from '../../common/auth/public.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { AuthService } from './auth.service';
import { clearRefreshCookie, presentedRefreshToken, sendSession } from './refresh-cookie';

/**
 * Authentification. Le jeton d'accès (courte durée) est renvoyé dans le corps et
 * gardé en mémoire par le front ; le refresh token (longue durée) est posé en
 * cookie HttpOnly `bailo_rt`, illisible par le JavaScript (sécurité 1.2).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Public()
  @Post('otp')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Demander un code OTP (signup / login / reset)' })
  async requestOtp(@Body(new ZodValidationPipe(requestOtpDto)) dto: RequestOtpDto): Promise<void> {
    await this.auth.requestOtp(dto);
  }

  @Public()
  @Post('signup')
  @ApiOperation({ summary: 'Créer un compte + propriétaire' })
  async signup(
    @Body(new ZodValidationPipe(signupDto)) dto: SignupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    return sendSession(req, res, this.env, await this.auth.signup(dto));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion téléphone/email + mot de passe' })
  async login(
    @Body(new ZodValidationPipe(loginDto)) dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    return sendSession(req, res, this.env, await this.auth.login(dto));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renouveler le JWT (rotation du refresh, cookie HttpOnly)' })
  async refresh(
    @Body(new ZodValidationPipe(refreshDto)) dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    const presented = presentedRefreshToken(req, dto.refreshToken);
    if (!presented) {
      throw new UnauthorizedException('Session expirée, reconnexion requise');
    }
    try {
      return sendSession(req, res, this.env, await this.auth.refresh(presented));
    } catch (error) {
      // Refresh révoqué ou expiré : on retire le cookie pour ne pas le renvoyer en boucle.
      if (error instanceof UnauthorizedException) clearRefreshCookie(res, this.env);
      throw error;
    }
  }

  @Public()
  @Post('password-reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Réinitialiser le mot de passe par OTP' })
  async resetPassword(
    @Body(new ZodValidationPipe(passwordResetDto)) dto: PasswordResetDto,
  ): Promise<void> {
    await this.auth.resetPassword(dto);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Révoquer le refresh token et retirer le cookie' })
  async logout(
    @Body(new ZodValidationPipe(logoutDto)) dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const presented = presentedRefreshToken(req, dto.refreshToken);
    if (presented) await this.auth.logout(presented);
    clearRefreshCookie(res, this.env);
  }
}
