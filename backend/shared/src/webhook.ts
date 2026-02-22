import { isIP } from 'node:net';

export interface WebhookValidationResult {
  ok: boolean;
  reason?: string;
  url?: URL;
}

export function parseAllowedHosts(raw?: string): Set<string> {
  if (!raw) {
    return new Set();
  }
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
}

function isPrivateIp(address: string): boolean {
  if (address.startsWith('10.')) {
    return true;
  }
  if (address.startsWith('127.')) {
    return true;
  }
  if (address.startsWith('169.254.')) {
    return true;
  }
  if (address.startsWith('192.168.')) {
    return true;
  }
  if (address.startsWith('172.')) {
    const second = Number(address.split('.')[1]);
    return second >= 16 && second <= 31;
  }
  if (address === '::1' || address.startsWith('fc') || address.startsWith('fd')) {
    return true;
  }
  return false;
}

export function validateWebhookUrl(
  rawUrl: string,
  allowedHosts: Set<string>,
): WebhookValidationResult {
  if (!allowedHosts.size) {
    return { ok: false, reason: 'WEBHOOK_ALLOWED_HOSTS is required when WEBHOOK_URL is set' };
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'invalid webhook URL' };
  }

  if (url.username || url.password) {
    return { ok: false, reason: 'credentials in webhook URL are not allowed' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'webhook URL must be http or https' };
  }

  const hostname = url.hostname.toLowerCase();
  if (!allowedHosts.has(hostname)) {
    return { ok: false, reason: `webhook host not allowlisted: ${hostname}` };
  }

  if (isIP(hostname) && isPrivateIp(hostname) && hostname !== '127.0.0.1') {
    return { ok: false, reason: 'webhook URL resolves to a private IP' };
  }

  return { ok: true, url };
}
