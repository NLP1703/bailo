// Gabarit HTML d'un contrat / fiche d'engagement (F4.3), rendu en PDF.

export interface ContractData {
  accountName: string;
  logoDataUrl?: string;
  title: string;
  bodyHtml: string; // corps du modèle, variables déjà substituées
  mentions?: string;
  signatureLandlord: string;
  signatureTenant: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildContractHtml(data: ContractData): string {
  const logo = data.logoDataUrl
    ? `<img src="${data.logoDataUrl}" alt="" style="height:48px;object-fit:contain" />`
    : '';
  // Le corps provient d'un modèle : on respecte les sauts de ligne, on échappe le reste.
  const body = escapeHtml(data.bodyHtml).replace(/\n/g, '<br/>');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"/>
<style>
  body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;margin:0;padding:32px;font-size:14px;line-height:1.6}
  .head{display:flex;align-items:center;gap:12px;border-bottom:2px solid #0f766e;padding-bottom:12px;margin-bottom:20px}
  .head h1{font-size:18px;margin:0;color:#0f766e}
  .account{font-weight:600}
  .title{font-size:16px;font-weight:700;margin:16px 0 8px}
  .body{white-space:normal}
  .mentions{margin-top:16px;color:#64748b;font-size:12px}
  .sign{display:flex;justify-content:space-between;margin-top:48px}
  .sign div{width:45%;border-top:1px solid #94a3b8;padding-top:6px;font-size:12px;color:#475569}
</style></head>
<body>
  <div class="head">${logo}<div><div class="account">${escapeHtml(data.accountName)}</div><h1>${escapeHtml(data.title)}</h1></div></div>
  <div class="body">${body}</div>
  ${data.mentions ? `<div class="mentions">${escapeHtml(data.mentions)}</div>` : ''}
  <div class="sign"><div>${escapeHtml(data.signatureLandlord)}</div><div>${escapeHtml(data.signatureTenant)}</div></div>
</body></html>`;
}
