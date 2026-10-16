import { Body, Controller, Post } from '@nestjs/common';
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
