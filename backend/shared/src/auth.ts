import crypto from 'node:crypto';
import type express from 'express';

export const SIGNATURE_HEADER = 'x-request-signature';
const SIGNATURE_PREFIX = 'sha256=';

export interface SignatureVerificationResult {
  ok: boolean;
  reason?: string;
}

function normalizeSignature(headerValue: string): string | null {
  const value = headerValue.trim();
  if (value.startsWith(SIGNATURE_PREFIX)) {
    return value.slice(SIGNATURE_PREFIX.length);
  }
  if (/^[a-f0-9]{64}$/i.test(value)) {
    return value;
  }
  return null;
}

export function computeSignature(secret: string, payload: Buffer): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifySignature(
  payload: Buffer,
  secret: string,
  headerValue: string | undefined,
): SignatureVerificationResult {
  if (!headerValue) {
    return { ok: false, reason: `missing ${SIGNATURE_HEADER} header` };
  }

  const normalized = normalizeSignature(headerValue);
  if (!normalized) {
    return { ok: false, reason: 'invalid signature format' };
  }

  const expected = computeSignature(secret, payload);
  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(normalized, 'hex');
  if (expectedBuf.length !== providedBuf.length) {
    return { ok: false, reason: 'invalid signature length' };
  }

  const ok = crypto.timingSafeEqual(expectedBuf, providedBuf);
  return ok ? { ok: true } : { ok: false, reason: 'signature mismatch' };
}

export function extractRawBody(req: express.Request): Buffer | null {
  const raw = (req as express.Request & { rawBody?: Buffer }).rawBody;
  if (raw && Buffer.isBuffer(raw)) {
    return raw;
  }
  return null;
}
