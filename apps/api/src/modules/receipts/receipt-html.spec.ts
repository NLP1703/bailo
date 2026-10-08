import { describe, expect, it } from 'vitest';
import { formatFcfa } from '@citegest/shared';
import { buildReceiptHtml } from './receipt-html';

describe('buildReceiptHtml', () => {
  const data = {
    accountName: 'Cité Obélix',
    receiptNumber: 'CG-2026-000123',
    paidAtLabel: '12/09/2026',
    amount: 175000,
    modeLabel: 'Espèces',
    payerName: 'Paul Mballa',
    unitCode: 'A12',
    lines: [
      { label: 'Caution', amount: 25000 },
      { label: 'Loyer 09/2026', amount: 25000 },
    ],
    verifyUrl: 'https://citegest.app/r/abc',
  };

  it('inclut numéro, montant formaté et URL de vérification', () => {
    const html = buildReceiptHtml(data);
    expect(html).toContain('CG-2026-000123');
    expect(html).toContain(formatFcfa(175000));
    expect(html).toContain('https://citegest.app/r/abc');
    expect(html).toContain('A12');
  });

  it('échappe le HTML des champs libres (anti-injection)', () => {
    const html = buildReceiptHtml({ ...data, payerName: '<script>x</script>' });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('affiche un repli QR si pas d’image', () => {
    expect(buildReceiptHtml(data)).toContain('placeholder');
  });

  it('inline les mentions et le logo du profil quand ils sont fournis (F1.5)', () => {
    const html = buildReceiptHtml({
      ...data,
      mentions: 'Merci de votre confiance',
      logoDataUrl: 'data:image/png;base64,AAAA',
    });
    expect(html).toContain('Merci de votre confiance');
    expect(html).toContain('<img class="logo" src="data:image/png;base64,AAAA"');
  });

  it('omet le logo si absent', () => {
    expect(buildReceiptHtml(data)).not.toContain('class="logo"');
  });
});
