import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { registerDeviceDto, type DeviceView, type RegisterDeviceDto } from '@bailo/shared';
import { AllowWhenReadOnly } from '../../common/auth/allow-read-only.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { DevicesService } from './devices.service';

const deviceRef = z.string().uuid();

/** Appareils de l'équipe — routes du cahier n°2, § 8.1. */
@ApiTags('devices')
@ApiBearerAuth()
@AllowWhenReadOnly()
@Controller()
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post('auth/device')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enregistrer ce téléphone (deux actifs au plus par utilisateur)' })
  register(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(registerDeviceDto)) dto: RegisterDeviceDto,
  ): Promise<DeviceView> {
    return this.devices.register(ctx, dto);
  }

  @Get('devices')
  @ApiOperation({ summary: 'Appareils connectés (tous pour le propriétaire, les siens sinon)' })
  list(@CurrentUser() ctx: RequestContext): Promise<DeviceView[]> {
    return this.devices.list(ctx);
  }

  @Delete('auth/devices/:id')
  @ApiOperation({ summary: 'Déconnecter un appareil à distance' })
  revoke(
    @CurrentUser() ctx: RequestContext,
    @Param('id', new ZodValidationPipe(deviceRef)) id: string,
  ): Promise<DeviceView> {
    return this.devices.revoke(ctx, id);
  }
}
