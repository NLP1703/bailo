import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  uploadUrlDto,
  downloadUrlDto,
  type UploadUrlDto,
  type DownloadUrlDto,
} from '@bailo/shared';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { StorageService } from './storage.service';

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  /**
   * État du stockage objet pour cette instance. Permet au front de masquer /
   * désactiver les boutons d'upload (photo locataire, logo, pièce de contrat…)
   * quand le déploiement n'a pas de bucket branché, plutôt que de laisser le
   * navigateur buter sur un hôte « disabled.local » invalide.
   */
  @Get('status')
  @ApiOperation({ summary: 'Indique si le stockage objet est opérationnel' })
  status(): { enabled: boolean } {
    return { enabled: this.storage.isEnabled() };
  }

  @Post('upload-url')
  @ApiOperation({ summary: 'Obtenir une URL signée pour déposer un fichier (NF8)' })
  uploadUrl(@Body(new ZodValidationPipe(uploadUrlDto)) dto: UploadUrlDto) {
    return this.storage.createUploadUrl(dto.purpose, dto.contentType);
  }

  @Post('download-url')
  @ApiOperation({ summary: 'Obtenir une URL signée de lecture à durée limitée' })
  downloadUrl(@Body(new ZodValidationPipe(downloadUrlDto)) dto: DownloadUrlDto) {
    return this.storage.createDownloadUrl(dto.key);
  }
}
