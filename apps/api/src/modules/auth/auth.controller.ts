import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  loginDto,
  logoutDto,
  passwordResetDto,
  refreshDto,
  requestOtpDto,
  signupDto,
  type AuthTokens,
  type LoginDto,
  type LogoutDto,
  type PasswordResetDto,
  type RefreshDto,
  type RequestOtpDto,
  type SignupDto,
} from '@bailo/shared';
import { Public } from '../../common/auth/public.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('otp')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Demander un code OTP (signup / login / reset)' })
  async requestOtp(@Body(new ZodValidationPipe(requestOtpDto)) dto: RequestOtpDto): Promise<void> {
    await this.auth.requestOtp(dto);
  }

  @Public()
  @Post('signup')
  @ApiOperation({ summary: 'Créer un compte + propriétaire (OTP validé)' })
  async signup(@Body(new ZodValidationPipe(signupDto)) dto: SignupDto): Promise<AuthTokens> {
    return this.auth.signup(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion téléphone + mot de passe' })
  async login(@Body(new ZodValidationPipe(loginDto)) dto: LoginDto): Promise<AuthTokens> {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renouveler le JWT (rotation du refresh)' })
  async refresh(@Body(new ZodValidationPipe(refreshDto)) dto: RefreshDto): Promise<AuthTokens> {
    return this.auth.refresh(dto.refreshToken);
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
  @ApiOperation({ summary: 'Révoquer le refresh token' })
  async logout(@Body(new ZodValidationPipe(logoutDto)) dto: LogoutDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }
}
