import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  inviteUserDto,
  updateUserDto,
  uuid,
  type InviteUserDto,
  type MeView,
  type UpdateUserDto,
  type UserView,
} from '@citegest/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Profil courant (rôle, sites)' })
  async me(@CurrentUser() ctx: RequestContext): Promise<MeView> {
    return this.users.me(ctx);
  }

  @Post('users/invite')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Inviter un gérant / gardien' })
  async invite(@Body(new ZodValidationPipe(inviteUserDto)) dto: InviteUserDto): Promise<UserView> {
    return this.users.invite(dto);
  }

  @Get('users')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Lister les utilisateurs du compte' })
  async list(): Promise<UserView[]> {
    return this.users.list();
  }

  @Patch('users/:id')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Modifier rôle / sites / activation' })
  async update(
    @Param('id', new ZodValidationPipe(uuid)) id: string,
    @Body(new ZodValidationPipe(updateUserDto)) dto: UpdateUserDto,
  ): Promise<UserView> {
    return this.users.update(id, dto);
  }
}
