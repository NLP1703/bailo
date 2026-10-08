import { createHash, createHmac } from 'node:crypto';

/**
 * Génération d'URL S3 pré-signées (AWS Signature Version 4, query-string) sans dépendance
 * externe. Compatible MinIO (path-style) comme AWS S3. On signe uniquement l'en-tête `host`
 * et on utilise une charge utile non signée (UNSIGNED-PAYLOAD), ce qui suffit pour des
 * liens de dépôt (PUT) et de lecture (GET) à durée limitée — cf. NF8.
 */

export interface PresignConfig {
  endpoint: string; // ex. http://localhost:9000 ou https://s3.eu-west-1.amazonaws.com
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
}

export interface PresignParams {
  method: 'GET' | 'PUT';
  key: string;
  expiresIn: number; // secondes
  now?: Date; // injectable pour les tests
}

const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

/** Encodage RFC 3986 : encodeURIComponent n'échappe pas ! * ' ( ). */
function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Encode une clé objet en préservant les séparateurs « / ». */
function encodeKey(key: string): string {
  return key
    .split('/')
    .map((segment) => rfc3986(segment))
    .join('/');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

function signingKey(secret: string, date: string, region: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

export function presignS3Url(config: PresignConfig, params: PresignParams): string {
  const now = params.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8); // YYYYMMDD

  const url = new URL(config.endpoint);
  // Préfixe de chemin éventuel de l'endpoint (ex. https://domaine/s3), sans « / » final.
  const basePath = url.pathname.replace(/\/+$/, '');
  // MinIO/S3 path-style : host = endpoint, path = /{bucket}/{key}.
  // Virtual-hosted : host = {bucket}.endpoint, path = /{key}.
  const host = config.forcePathStyle ? url.host : `${config.bucket}.${url.host}`;
  const canonicalUri = config.forcePathStyle
    ? `${basePath}/${encodeKey(config.bucket)}/${encodeKey(params.key)}`
    : `${basePath}/${encodeKey(params.key)}`;

  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKey}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(params.expiresIn),
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQuery = Object.entries(query)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`)
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    params.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    'host',
    UNSIGNED_PAYLOAD,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signature = createHmac('sha256', signingKey(config.secretKey, dateStamp, config.region))
    .update(stringToSign, 'utf8')
    .digest('hex');

  const base = `${url.protocol}//${host}${canonicalUri}`;

  return `${base}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
