import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  acceptInvitationDto,
  type AcceptInvitationDto,
  type AuthSession,
  type InvitationPreview,
} from '@bailo/shared';
import { APP_ENV, type AppEnv } from '../../../common/config/env';
import { Public } from '../../../common/auth/public.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { TokenService } from '../../auth/token.service';
import { sendSession } from '../../auth/refresh-cookie';
import { AdminUsersService } from './admin-users.service';

/** Jeton d'invitation : 32 octets en base64url (43 caractères). */
const invitationToken = z.string().regex(/^[A-Za-z0-9_-]{20,128}$/);

/**
 * Acceptation d'une invitation depuis le lien reçu par e-mail (sans compte).
 * Le jeton opaque fait office d'autorisation : seul son hash est stocké.
 */
@ApiTags('auth')
@Controller('auth/invitations')
export class InvitationPublicController {
  constructor(
    private readonly service: AdminUsersService,
    private readonly tokens: TokenService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Public()
  @Get(':token')
  @ApiOperation({ summary: "Aperçu d'une invitation (nom, rôle, compte)" })
  async preview(
    @Param('token', new ZodValidationPipe(invitationToken)) token: string,
  ): Promise<InvitationPreview> {
    return this.service.previewInvitation(token);
  }

  @Public()
  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accepter une invitation : choisir son mot de passe et ouvrir la session' })
  async accept(
    @Param('token', new ZodValidationPipe(invitationToken)) token: string,
    @Body(new ZodValidationPipe(acceptInvitationDto)) dto: AcceptInvitationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    const user = await this.service.acceptInvitation(token, dto);
    return sendSession(req, res, this.env, await this.tokens.issue(user));
  }
}
