import { describe, expect, it } from 'vitest';
import { presignS3Url, type PresignConfig } from './sigv4';

describe('presignS3Url (AWS Signature V4)', () => {
  // Exemple canonique de la documentation AWS (GET pré-signé, UNSIGNED-PAYLOAD).
  const awsExample: PresignConfig = {
    endpoint: 'https://s3.amazonaws.com',
    region: 'us-east-1',
    bucket: 'examplebucket',
    accessKey: 'AKIAIOSFODNN7EXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    forcePathStyle: false,
  };

  it('reproduit la signature de référence AWS', () => {
    const url = presignS3Url(awsExample, {
      method: 'GET',
      key: 'test.txt',
      expiresIn: 86400,
      now: new Date('2013-05-24T00:00:00Z'),
    });
    expect(url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    expect(url).toContain('X-Amz-Expires=86400');
    expect(url).toContain('examplebucket.s3.amazonaws.com/test.txt');
    expect(url).toContain(
      'X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });

  it('produit une URL path-style pour MinIO', () => {
    const minio: PresignConfig = {
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      bucket: 'citegest',
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
      forcePathStyle: true,
    };
    const url = presignS3Url(minio, {
      method: 'PUT',
      key: 'accounts/abc/payment-proof/x.jpg',
      expiresIn: 300,
      now: new Date('2026-10-01T10:00:00Z'),
    });
    expect(url.startsWith('http://localhost:9000/citegest/accounts/abc/payment-proof/x.jpg?')).toBe(
      true,
    );
    expect(url).toMatch(/X-Amz-Signature=[0-9a-f]{64}$/);
  });
});
