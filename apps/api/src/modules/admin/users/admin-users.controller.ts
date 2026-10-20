import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  adminUserListQuery,
  createAdminUserDto,
  createInvitationDto,
  updateAdminUserDto,
  uuid,
  type AdminUserListQuery,
  type AdminUserView,
  type CreateAdminUserDto,
  type CreateInvitationDto,
  type InvitationView,
  type PaginatedResult,
  type UpdateAdminUserDto,
} from '@bailo/shared';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { Roles } from '../../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../../common/tenancy/request-context';
import { AdminUsersService } from './admin-users.service';

/**
 * Endpoints Administration ⇒ équipe & sessions (OWNER uniquement).
 *
 * Lecture ouverte à MANAGER prévue au Lot 3 (journal d'audit filtré). Pour
 * l'instant, @Roles('OWNER') sur la classe entière — aucun autre rôle n'a
 * besoin de ces routes.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('OWNER')
@Controller('admin')
export class AdminUsersController {
  constructor(private readonly service: AdminUsersService) {}

  @Get('users')
  @ApiOperation({ summary: 'Lister les utilisateurs du compte (pagination, filtres)' })
  async list(
    @CurrentUser() ctx: RequestContext,
    @Query(new ZodValidationPipe(adminUserListQuery)) q: AdminUserListQuery,
  ): Promise<PaginatedResult<AdminUserView>> {
    return this.service.list(ctx, q);
  }

  @Post('users')
  @ApiOperation({ summary: 'Créer directement un utilisateur (MANAGER ou CARETAKER)' })
  async create(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(createAdminUserDto)) dto: CreateAdminUserDto,
  ): Promise<AdminUserView> {
    return this.service.create(ctx, dto);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Modifier nom / email / rôle / actif / sites' })
  async update(
    @CurrentUser() ctx: RequestContext,
    @Param('id', new ZodValidationPipe(uuid)) id: string,
    @Body(new ZodValidationPipe(updateAdminUserDto)) dto: UpdateAdminUserDto,
  ): Promise<AdminUserView> {
    return this.service.update(ctx, id, dto);
  }

  @Post('users/:id/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Envoyer un OTP de réinitialisation à l’utilisateur' })
  async resetPassword(
    @CurrentUser() ctx: RequestContext,
    @Param('id', new ZodValidationPipe(uuid)) id: string,
  ): Promise<{ phone: string }> {
    return this.service.resetPassword(ctx, id);
  }

  @Post('users/:id/revoke-sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Révoquer toutes les sessions actives de l’utilisateur' })
  async revokeSessions(
    @CurrentUser() ctx: RequestContext,
    @Param('id', new ZodValidationPipe(uuid)) id: string,
  ): Promise<{ revoked: number }> {
    return this.service.revokeSessions(ctx, id);
  }

  @Get('invitations')
  @ApiOperation({ summary: 'Lister les invitations en attente' })
  async listInvitations(@CurrentUser() ctx: RequestContext): Promise<InvitationView[]> {
    return this.service.listInvitations(ctx);
  }

  @Post('invitations')
  @ApiOperation({ summary: 'Créer une invitation (OTP + jeton)' })
  async createInvitation(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(createInvitationDto)) dto: CreateInvitationDto,
  ): Promise<InvitationView> {
    return this.service.createInvitation(ctx, dto);
  }

  @Delete('invitations/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Révoquer une invitation en attente' })
  async revokeInvitation(
    @CurrentUser() ctx: RequestContext,
    @Param('id', new ZodValidationPipe(uuid)) id: string,
  ): Promise<InvitationView> {
    return this.service.revokeInvitation(ctx, id);
  }
}
