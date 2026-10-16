// Construction du HTML d'un reçu (fonction pure, testable — le rendu PDF est séparé).
// Montants en FCFA (RG22), dates JJ/MM/AAAA (NF5).

import { formatFcfa } from '@bailo/shared';

export interface ReceiptLine {
  label: string; // ex. "Loyer 09/2026" ou "Caution"
  amount: number;
}

export interface ReceiptData {
  accountName: string;
  receiptNumber: string;
  paidAtLabel: string; // JJ/MM/AAAA
  amount: number;
  modeLabel: string;
  payerName: string;
  unitCode: string;
  lines: ReceiptLine[];
  verifyUrl: string;
  qrDataUrl?: string; // image QR (data:image/png;base64,…) ou absente (fallback)
  mentions?: string; // mentions libres du profil (F1.5)
  logoDataUrl?: string; // logo du bailleur inliné (data:image/…) ou absent (F1.5)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildReceiptHtml(data: ReceiptData): string {
  const rows = data.lines
    .map(
      (l) => `<tr><td>${escapeHtml(l.label)}</td><td class="amt">${formatFcfa(l.amount)}</td></tr>`,
    )
    .join('');

  const qr = data.qrDataUrl
    ? `<img class="qr" src="${data.qrDataUrl}" alt="QR de vérification" />`
    : `<div class="qr placeholder">QR</div>`;

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" />
<style>
  * { font-family: Arial, Helvetica, sans-serif; }
  body { width: 360px; margin: 0 auto; padding: 16px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .muted { color: #555; font-size: 12px; }
  .num { font-weight: bold; font-size: 15px; margin-top: 8px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
  td { padding: 4px 0; border-bottom: 1px solid #eee; }
  .amt { text-align: right; }
  .total { font-weight: bold; font-size: 16px; display: flex; justify-content: space-between; }
  .logo { max-width: 120px; max-height: 60px; display: block; margin: 0 0 8px; }
  .qr { width: 96px; height: 96px; display: block; margin: 12px auto 4px; }
  .placeholder { border: 1px dashed #999; display: flex; align-items: center; justify-content: center; color: #999; }
  .verify { text-align: center; font-size: 10px; color: #555; word-break: break-all; }
  footer { margin-top: 12px; font-size: 10px; color: #777; text-align: center; }
</style></head>
<body>
  ${data.logoDataUrl ? `<img class="logo" src="${data.logoDataUrl}" alt="Logo" />` : ''}
  <h1>${escapeHtml(data.accountName)}</h1>
  <div class="muted">Reçu de paiement</div>
  <div class="num">N° ${escapeHtml(data.receiptNumber)}</div>
  <div class="muted">Date : ${escapeHtml(data.paidAtLabel)} · Mode : ${escapeHtml(data.modeLabel)}</div>
  <div class="muted">Reçu de : ${escapeHtml(data.payerName)} · Chambre ${escapeHtml(data.unitCode)}</div>
  <table>${rows}</table>
  <div class="total"><span>Total</span><span>${formatFcfa(data.amount)}</span></div>
  ${qr}
  <div class="verify">Vérifier : ${escapeHtml(data.verifyUrl)}</div>
  ${data.mentions ? `<footer>${escapeHtml(data.mentions)}</footer>` : ''}
</body></html>`;
}
