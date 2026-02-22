import { describe, expect, it } from 'vitest';
import { computeSignature, verifySignature } from './auth.js';

const payload = Buffer.from('{"hello":"world"}');

describe('request signatures', () => {
  it('accepts a valid signature', () => {
    const secret = 'test-secret';
    const signature = computeSignature(secret, payload);
    const result = verifySignature(payload, secret, `sha256=${signature}`);
    expect(result.ok).toBe(true);
  });

  it('rejects invalid signatures', () => {
    const secret = 'test-secret';
    const result = verifySignature(payload, secret, 'sha256=deadbeef');
    expect(result.ok).toBe(false);
  });

  it('rejects missing signatures', () => {
    const secret = 'test-secret';
    const result = verifySignature(payload, secret, undefined);
    expect(result.ok).toBe(false);
  });
});
