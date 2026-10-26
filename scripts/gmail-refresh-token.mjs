#!/usr/bin/env node
// Obtient le GMAIL_REFRESH_TOKEN de Bailo (envoi d'e-mails via l'API Gmail).
// À lancer UNE FOIS sur votre ordinateur, sans dépendance :
//
//   node scripts/gmail-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET>
//
// Le navigateur s'ouvre sur la page d'autorisation Google : connectez-vous avec le
// compte Gmail expéditeur et acceptez. Le jeton s'affiche ensuite dans ce terminal.
// Seule la portée « gmail.send » est demandée : Bailo peut ENVOYER, jamais lire vos e-mails.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { exec } from 'node:child_process';

const SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const [clientId = process.env.GMAIL_CLIENT_ID, clientSecret = process.env.GMAIL_CLIENT_SECRET] =
  process.argv.slice(2);

if (!clientId || !clientSecret) {
  console.error('Usage : node scripts/gmail-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET>');
  process.exit(1);
}

const state = randomBytes(16).toString('hex');

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname !== '/') {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const page = (title, text) =>
    `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
    `<body style="font-family:sans-serif;max-width:520px;margin:60px auto"><h2>${title}</h2><p>${text}</p></body>`;

  if (error || url.searchParams.get('state') !== state || !code) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page('Autorisation annulée', `Revenez au terminal. (${error ?? 'requête invalide'})`));
    console.error(`\nAutorisation refusée ou invalide : ${error ?? 'state/code manquant'}`);
    server.close();
    process.exitCode = 1;
    return;
  }

  try {
    const { port } = server.address();
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `http://127.0.0.1:${port}`,
        grant_type: 'authorization_code',
      }),
    });
    const data = await tokenRes.json();
    if (!tokenRes.ok || !data.refresh_token) {
      throw new Error(data.error_description ?? data.error ?? 'aucun refresh_token renvoyé');
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page('C’est fait ✅', 'Vous pouvez fermer cet onglet et revenir au terminal.'));
    console.log('\n✅ Autorisation obtenue. Ajoutez cette variable au service API sur Railway :\n');
    console.log(`GMAIL_REFRESH_TOKEN=${data.refresh_token}\n`);
    console.log('Gardez-la secrète : elle permet d’envoyer des e-mails depuis ce compte Gmail.');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page('Échec', 'Revenez au terminal pour le détail.'));
    console.error(`\nÉchec de l'échange du code : ${err.message}`);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: `http://127.0.0.1:${port}`,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline', // indispensable pour recevoir un refresh_token
      prompt: 'consent', // force un nouveau refresh_token même si déjà autorisé
      state,
    });
  console.log('Ouvrez cette adresse si le navigateur ne s’ouvre pas tout seul :\n');
  console.log(authUrl + '\n');
  const opener =
    process.platform === 'win32'
      ? `start "" "${authUrl}"`
      : process.platform === 'darwin'
        ? `open "${authUrl}"`
        : `xdg-open "${authUrl}"`;
  exec(opener, () => undefined);
});
