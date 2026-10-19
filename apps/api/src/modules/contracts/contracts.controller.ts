import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  contractListQuery,
  createContractDto,
  sendForSignatureDto,
  signContractDto,
  terminateContractDto,
  type ContractListQuery,
  type CreateContractDto,
  type SendForSignatureDto,
  type SignContractDto,
  type TerminateContractDto,
} from '@bailo/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../../common/tenancy/request-context';
import { ContractsService } from './contracts.service';

@ApiTags('contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  @Get()
  list(
    @CurrentUser() ctx: RequestContext,
    @Query(new ZodValidationPipe(contractListQuery)) q: ContractListQuery,
  ) {
    return this.service.list(ctx, q);
  }

  @Get('standard-body/:occupancyId')
  @ApiOperation({ summary: 'HTML standard pré-rempli pour une occupation (brouillon de contrat)' })
  standard(@CurrentUser() ctx: RequestContext, @Param('occupancyId') occupancyId: string) {
    return this.service.standardBodyFor(ctx, occupancyId);
  }

  @Get(':id')
  get(@CurrentUser() ctx: RequestContext, @Param('id') id: string) {
    return this.service.get(ctx, id);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Télécharger le contrat (PDF, HTML en repli)' })
  async pdf(@CurrentUser() ctx: RequestContext, @Param('id') id: string, @Res() res: Response) {
    const { doc, filename } = await this.service.renderPdf(ctx, id);
    res.setHeader('Content-Type', doc.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(doc.buffer);
  }

  @Post()
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Créer un contrat (brouillon)' })
  create(
    @CurrentUser() ctx: RequestContext,
    @Body(new ZodValidationPipe(createContractDto)) dto: CreateContractDto,
  ) {
    return this.service.create(ctx, dto);
  }

  @Post(':id/send-for-signature')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Envoyer le code OTP de signature au locataire' })
  send(
    @CurrentUser() ctx: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendForSignatureDto)) dto: SendForSignatureDto,
  ) {
    return this.service.sendForSignature(ctx, id, dto);
  }

  @Post(':id/sign')
  @ApiOperation({ summary: 'Signer le contrat (le gérant saisit le code reçu par le locataire)' })
  sign(
    @CurrentUser() ctx: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(signContractDto)) dto: SignContractDto,
  ) {
    return this.service.sign(ctx, id, dto);
  }

  @Post(':id/terminate')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Résilier un contrat' })
  terminate(
    @CurrentUser() ctx: RequestContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(terminateContractDto)) dto: TerminateContractDto,
  ) {
    return this.service.terminate(ctx, id, dto);
  }
}
