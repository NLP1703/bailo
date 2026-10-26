import type { MailMessage } from './mail.provider';

/** Échappe une valeur insérée dans le HTML d'un e-mail. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Gabarit commun : texte brut + HTML sobre (lisible sur tous les clients mail, y compris mobile). */
function layout(title: string, paragraphs: string[], code: string, footer: string): string {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:24px">
<tr><td style="font-size:20px;font-weight:bold;color:#0f766e;padding-bottom:16px">Bailo</td></tr>
<tr><td style="font-size:17px;font-weight:bold;padding-bottom:12px">${esc(title)}</td></tr>
${paragraphs.map((p) => `<tr><td style="font-size:15px;line-height:22px;padding-bottom:12px">${esc(p)}</td></tr>`).join('')}
<tr><td align="center" style="padding:12px 0 20px"><div style="display:inline-block;font-size:30px;letter-spacing:8px;font-weight:bold;background:#f0fdfa;color:#0f766e;border-radius:8px;padding:12px 20px">${esc(code)}</div></td></tr>
<tr><td style="font-size:12px;line-height:18px;color:#64748b">${esc(footer)}</td></tr>
</table></td></tr></table></body></html>`;
}

const minutes = (ttlSeconds: number) => Math.max(1, Math.round(ttlSeconds / 60));

/** Code de réinitialisation du mot de passe d'un utilisateur Bailo. */
export function passwordResetMail(to: string, code: string, ttlSeconds: number): MailMessage {
  const ttl = minutes(ttlSeconds);
  const intro = 'Voici votre code pour choisir un nouveau mot de passe Bailo.';
  const validity = `Il est valable ${ttl} minutes et ne peut servir qu'une fois.`;
  const footer =
    "Vous n'avez rien demandé ? Ignorez cet e-mail : votre mot de passe actuel reste valable. Ne communiquez jamais ce code.";
  return {
    to,
    subject: `Bailo — votre code de réinitialisation : ${code}`,
    text: `${intro}\n\nCode : ${code}\n\n${validity}\n\n${footer}`,
    html: layout('Réinitialisation du mot de passe', [intro, validity], code, footer),
  };
}

/** Code de signature d'un contrat de bail, envoyé au locataire. */
export function contractSignatureMail(
  to: string,
  opts: {
    code: string;
    reference: string;
    tenantName: string;
    landlordName: string;
    ttlSeconds: number;
  },
): MailMessage {
  const ttl = minutes(opts.ttlSeconds);
  const intro = `Bonjour ${opts.tenantName}, ${opts.landlordName} vous invite à signer le contrat de location ${opts.reference}.`;
  const how = `Communiquez ce code à votre bailleur pour valider votre signature. Il est valable ${ttl} minutes.`;
  const footer =
    "Vous n'êtes pas concerné par ce contrat ? Ignorez cet e-mail et ne communiquez pas ce code.";
  return {
    to,
    subject: `Bailo — code de signature du contrat ${opts.reference}`,
    text: `${intro}\n\nCode : ${opts.code}\n\n${how}\n\n${footer}`,
    html: layout('Signature de votre contrat', [intro, how], opts.code, footer),
  };
}
