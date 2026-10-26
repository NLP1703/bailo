import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../common/config/env';

export const PDF_RENDERER = Symbol('PDF_RENDERER');

export interface RenderedDocument {
  buffer: Buffer;
  contentType: 'application/pdf' | 'text/html';
}

export interface PdfRenderer {
  render(html: string): Promise<RenderedDocument>;
}

/**
 * Rendu HTML→PDF. Puppeteer (Chromium) est chargé paresseusement : s'il n'est pas
 * disponible (dev/test sans Chromium), on renvoie le HTML tel quel — le reçu reste
 * consultable sur téléphone.
 *
 * `PDF_ENGINE=html` saute directement au rendu HTML (pas de tentative de lancement
 * de Chromium à chaque document). Pour de vrais PDF en image Docker, construire
 * l'image API avec `INSTALL_CHROMIUM=true` (cf. apps/api/Dockerfile) : Puppeteer
 * utilise alors le Chromium système via `PUPPETEER_EXECUTABLE_PATH`.
 */
@Injectable()
export class HtmlToPdfRenderer implements PdfRenderer {
  private readonly logger = new Logger('PdfRenderer');

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  async render(html: string): Promise<RenderedDocument> {
    if (this.env.NODE_ENV === 'test' || this.env.PDF_ENGINE === 'html') {
      return { buffer: Buffer.from(html, 'utf8'), contentType: 'text/html' };
    }
    try {
      // Import paresseux : puppeteer est une dépendance lourde et optionnelle en dev.
      // Spécificateur non-littéral : la dépendance n'est pas résolue à la compilation.
      const moduleName = 'puppeteer';
      const puppeteer = ((await import(moduleName)) as { default: unknown }).default as {
        launch: (opts: unknown) => Promise<PuppeteerBrowser>;
      };
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({ printBackground: true, format: 'A6' });
        return { buffer: Buffer.from(pdf), contentType: 'application/pdf' };
      } finally {
        await browser.close();
      }
    } catch (error) {
      this.logger.warn(
        `Puppeteer indisponible, repli HTML: ${error instanceof Error ? error.message : error}`,
      );
      return { buffer: Buffer.from(html, 'utf8'), contentType: 'text/html' };
    }
  }
}

interface PuppeteerBrowser {
  newPage(): Promise<PuppeteerPage>;
  close(): Promise<void>;
}
interface PuppeteerPage {
  setContent(html: string, opts: unknown): Promise<void>;
  pdf(opts: unknown): Promise<Uint8Array>;
}
