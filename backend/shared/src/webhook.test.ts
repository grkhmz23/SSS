import { describe, expect, it } from 'vitest';
import { parseAllowedHosts, validateWebhookUrl } from './webhook.js';

describe('webhook validation', () => {
  it('requires an allowlist', () => {
    const result = validateWebhookUrl('https://example.com/webhook', new Set());
    expect(result.ok).toBe(false);
  });

  it('accepts allowlisted host', () => {
    const allowed = parseAllowedHosts('example.com');
    const result = validateWebhookUrl('https://example.com/webhook', allowed);
    expect(result.ok).toBe(true);
  });

  it('rejects non-allowlisted host', () => {
    const allowed = parseAllowedHosts('example.com');
    const result = validateWebhookUrl('https://evil.com/webhook', allowed);
    expect(result.ok).toBe(false);
  });
});
