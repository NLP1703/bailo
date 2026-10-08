import { Global, Module } from '@nestjs/common';
import { HtmlToPdfRenderer, PDF_RENDERER } from './pdf.renderer';

@Global()
@Module({
  providers: [HtmlToPdfRenderer, { provide: PDF_RENDERER, useExisting: HtmlToPdfRenderer }],
  exports: [PDF_RENDERER],
})
export class PdfModule {}
